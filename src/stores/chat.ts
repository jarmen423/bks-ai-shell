import { defineStore } from "pinia";
import { markRaw, type Raw } from "vue";
import type {
  AvailableModels,
  AvailableProviders,
  ModelInfo,
  ProviderId,
} from "@/config";
import { getProviderDisplayName, providerConfigs } from "@/config";
import { useConfigurationStore } from "./configuration";
import { useInternalDataStore } from "./internalData";
import { useTabState } from "./tabState";
import { createProvider } from "@/providers";
import _ from "lodash";
import { providerSupportsRuntimeModels } from "@/utils";
import { ProviderSyncError } from "@/utils/ProviderSyncError";
import {
  type ConnectionInfo,
  getAppVersion,
  getConnectionInfo,
  getTables,
  getViewContext,
  log,
  type PluginViewContext,
} from "@beekeeperstudio/plugin";
import type { Entity } from "@beekeeperstudio/ui-kit";
import gt from "semver/functions/gt";
import { getDefaultInstructions } from "@/instructions";

export type Model = (AvailableModels | ModelInfo) & {
  provider: ProviderId;
  providerDisplayName: string;
  enabled: boolean;
  /** Available if the api key is set. */
  available: boolean;
  removable: boolean;
};

export type ModelProvider = {
  id: ProviderId;
  displayName: string;
  models: Model[];
};

type ChatState = {
  /** The active model. E.g. Claude 4 Sonnet, Claude 3.5, etc. */
  model?: Model;
  errors: ProviderSyncError[];
  defaultInstructions: string;
  entities: Entity[];
  connectionInfo: ConnectionInfo;
  appVersion: Awaited<ReturnType<typeof getAppVersion>>;
  viewContext?: Raw<PluginViewContext>;
};

// the first argument is a unique id of the store across your application
export const useChatStore = defineStore("chat", {
  state: (): ChatState => ({
    model: undefined,
    errors: [],
    defaultInstructions: "",
    entities: [],
    connectionInfo: {
      id: -1,
      connectionType: "postgresql",
      databaseType: "mysql",
      workspaceId: -1,
      connectionName: "",
      databaseName: "",
      readOnlyMode: true,
    },
    appVersion: "900.0.0",
    viewContext: undefined,
  }),
  getters: {
    providers(): ModelProvider[] {
      const config = useConfigurationStore();

      const isAvailable = (providerId: ProviderId): boolean => {
        switch (providerId) {
          // OpenAI-compatible endpoints can be keyless (local servers,
          // open proxies).
          case "openaiCompat":
          case "ollama":
          case "mock":
            return true;
          default:
            if (providerId.startsWith("custom-")) {
              return true;
            }
            return !!config[
              `providers.${providerId}.apiKey` as keyof typeof config
            ];
        }
      };

      const modelsFor = (providerId: ProviderId): Model[] => {
        const hardcoded: readonly ModelInfo[] =
          (
            providerConfigs as Record<
              string,
              { models: readonly ModelInfo[] }
            >
          )[providerId]?.models ?? [];
        const stored = config.getModelsByProvider(providerId) ?? [];
        // Live-fetched lists win; the bundled list is the offline/no-key
        // fallback.
        const source = stored.length > 0 ? stored : hardcoded;
        const available = isAvailable(providerId);
        return source
          .filter(
            (m) =>
              !config.removedModels.some(
                (r) => r.modelId === m.id && r.providerId === providerId,
              ),
          )
          .map((m) => {
            const fallback = hardcoded.find((h) => h.id === m.id);
            const withExtras = m as ModelInfo;
            return {
              ...m,
              contextWindow: withExtras.contextWindow ?? fallback?.contextWindow,
              temperature:
                (withExtras as { temperature?: number }).temperature ??
                (fallback as { temperature?: number } | undefined)?.temperature,
              provider: providerId,
              providerDisplayName: getProviderDisplayName(
                providerId,
                config.customProviders,
              ),
              available,
              enabled:
                available &&
                !config.disabledModels.some(
                  (disabled) =>
                    m.id === disabled.modelId &&
                    disabled.providerId === providerId,
                ),
              removable: false,
            } as Model;
          });
      };

      const builtinProviders = (
        Object.keys(providerConfigs) as AvailableProviders[]
      )
        .filter(
          (provider) =>
            import.meta.env.MODE === "development" || provider !== "mock",
        )
        .map((providerId) => ({
          id: providerId as ProviderId,
          displayName: getProviderDisplayName(providerId),
          models: modelsFor(providerId),
        }));

      const customProviders = config.customProviders.map((cp) => ({
        id: cp.id as ProviderId,
        displayName: cp.name,
        models: modelsFor(cp.id),
      }));

      return [...builtinProviders, ...customProviders];
    },
    models(): Model[] {
      return this.providers.flatMap((provider) => provider.models);
    },
    systemPrompt(state) {
      const config = useConfigurationStore();
      return (
        state.defaultInstructions +
        "\n" +
        config.customInstructions +
        "\n" +
        config.currentConnectionInstructions
      ).trim();
    },
    // FIXME move this to UI Kit?
    formatterDialect(state) {
      const d = state.connectionInfo.databaseType;
      if (d === "sqlserver") return "tsql";
      if (d === "sqlite") return "sqlite";
      if (d === "oracle") return "plsql";
      if (d === "postgresql") return "postgresql";
      if (d === "redshift") return "redshift";
      if (d === "cassandra") return "sql";
      if (d === "duckdb") return "sql";
      if (d === "trino") return "trino";
      if (d === "surrealdb") return "sql";
      return "mysql"; // we want this as the default
    },
    // FIXME move this to UI Kit?
    identifierDialect(state) {
      const mappings: Record<string, string> = {
        sqlserver: "mssql",
        sqlite: "sqlite",
        cockroachdb: "psql",
        postgresql: "psql",
        mysql: "mysql",
        mariadb: "mysql",
        tidb: "mysql",
        redshift: "psql",
      };
      return mappings[state.connectionInfo.databaseType] || "generic";
    },
    languageId(state) {
      const d = state.connectionInfo.databaseType;
      if (d === "cassandra") return "text/x-cassandra";
      if (d === "clickhouse") return "text/x-mysql";
      if (d === "mysql" || d === "mariadb") return "text/x-mysql";
      if (d === "postgresql" || d === "redshift") return "text/x-pgsql";
      if (d === "redis") return "text/x-redis";
      if (d === "sqlite" || d === "libsql") return "text/x-sqlite";
      return "text/x-sql";
    },
    sqlOrCode(state) {
      if (
        state.connectionInfo.databaseType === "redis" ||
        state.connectionInfo.databaseType === "mongodb"
      ) {
        return "code";
      }
      return "sql";
    },
    queryOrCode() {
      if (this.sqlOrCode === "sql") {
        return "query";
      }
      return "code";
    },
    supportOpenInQueryEditor(state) {
      return gt(state.appVersion, "5.3.0");
    },
    /**
     * The context limit is the actual `contextWindow` - `outputTokens`.
     * For most models, reserved `outputTokens` are 32K. If the `contextWindow`
     * is less than 32K, we will reserve 25% of the `contextWindow` instead.
     **/
    contextLeftUntilAutoCompact(state): number {
      if (typeof state.model?.contextWindow !== "number") {
        return 100;
      }

      const totalTokens = useTabState().messages.findLast(
        (m) =>
          m.role === "assistant" &&
          typeof m.metadata?.usage?.totalTokens === "number",
      )?.metadata?.usage?.totalTokens;

      if (typeof totalTokens !== "number") {
        return 100;
      }

      // Reserve 32K tokens or 25% for output tokens
      const outputTokens = Math.min(
        32_000,
        Math.floor(state.model.contextWindow * 0.25)
      );
      const contextLimit = state.model.contextWindow - outputTokens;
      const contextUsage = totalTokens / contextLimit;
      return (1 - contextUsage) * 100;
    },
    contextOverflow(): boolean {
      return this.contextLeftUntilAutoCompact <= 0;
    },
  },
  actions: {
    async initialize() {
      const internal = useInternalDataStore();
      const config = useConfigurationStore();
      const tabState = useTabState();
      await config.sync();
      await internal.sync();
      await tabState.sync();

      this.viewContext = markRaw(await getViewContext());

      await this.syncAllProviders();

      this.model = (
        this.models.find(
          (m) => m.id === internal.lastUsedModelId && m.enabled,
        ) || this.models.find((m) => m.enabled)
      ) as Model | undefined;

      internal.lastUsedModelId = this.model?.id;
      getDefaultInstructions()
        .then((instructions) => {
          this.defaultInstructions = instructions;
        })
        .catch(log.error);
      getTables()
        .then((tables) => {
          this.entities = tables.map((table) => ({
            name: table.name,
            schema: table.schema,
            entityType: "table",
          }));
        })
        .catch(log.error);
      getAppVersion()
        .then((version) => {
          this.appVersion = version;
        })
        .catch(log.error);
      getConnectionInfo()
        .then((info) => {
          this.connectionInfo = info;
        })
        .catch(log.error);
    },
    /** List the models for a provider and store them in the internal data store. */
    async syncProvider(provider: ProviderId) {
      const config = useConfigurationStore();
      try {
        const errorIdx = this.errors.findIndex(
          (e) => e.providerId === provider,
        );
        if (errorIdx !== -1) {
          this.errors.splice(errorIdx, 1);
        }

        // Fetch new models
        const newModels = await createProvider(provider).listModels();

        // Update the model list first
        await config.setModels(provider, newModels);
      } catch (e) {
        if (
          provider === "ollama" &&
          e instanceof TypeError &&
          e.message === "Failed to fetch"
        ) {
          this.errors.push(
            new ProviderSyncError("Failed to fetch models from Ollama. [1]", {
              providerId: provider,
              cause: e,
            }),
          );
        } else {
          console.error(e);
          const error = e as Error | undefined;
          this.errors.push(
            new ProviderSyncError(error?.message ?? "Unknown error", {
              providerId: provider,
              cause: e,
            }),
          );
        }
        config.setModels(provider, []);
      }
    },
    /** Refresh the model lists of every configured provider. */
    async syncAllProviders() {
      const config = useConfigurationStore();
      const providerIds: ProviderId[] = [
        ...(Object.keys(providerConfigs) as AvailableProviders[]),
        ...config.customProviders.map((cp) => cp.id),
      ];
      await Promise.allSettled(
        providerIds
          .filter(
            (providerId) =>
              providerSupportsRuntimeModels(providerId) &&
              providerIsConfigured(providerId, config),
          )
          .map((providerId) => this.syncProvider(providerId)),
      );
    },
  },
});

/** Whether the provider has enough configuration to list/use models. */
function providerIsConfigured(
  providerId: ProviderId,
  config: ReturnType<typeof useConfigurationStore>,
): boolean {
  switch (providerId) {
    case "openaiCompat":
      return !!config.providers_openaiCompat_baseUrl?.trim();
    case "ollama":
      return !!config.providers_ollama_baseUrl?.trim();
    case "mock":
      return import.meta.env.MODE === "development";
    case "openrouter":
      // The OpenRouter model catalog is public, so the picker can show the
      // available models before an API key is entered.
      return true;
    default:
      if (providerId.startsWith("custom-")) {
        return !!config.customProviders
          .find((cp) => cp.id === providerId)
          ?.baseUrl?.trim();
      }
      return !!config[
        `providers.${providerId}.apiKey` as keyof typeof config
      ];
  }
}
