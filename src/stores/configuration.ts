/** Usage:
 *
 * 1. Call `sync()` if it hasn't been called yet.
 * 2. Read the state by accessing it normally.
 * 3. Use `configure()` to update the state.
 *
 * FUTURE PLAN (probably):
 *
 * - Save configuration to .ini config files via Beekeeper Studio API
 *   instead of using setData?
 */
import { defineStore } from "pinia";
import _ from "lodash";
import { appStorage } from "@beekeeperstudio/plugin";
import type {
  AvailableProviders,
  CustomProviderConfig,
  ProviderId,
} from "@/config";
import { disabledModelsByDefault, providerConfigs } from "@/config";
import { useChatStore } from "./chat";

type Model = {
  id: string;
  displayName: string;
};

type Configurable = {
  // ==== GENERAL ====
  /** Append custom instructions to the default system instructions. */
  customInstructions: string;
  /** Append custom instructions to the default system instructions.
   * It's applied based on the connection ID */
  customConnectionInstructions: {
    workspaceId: number;
    connectionId: number;
    instructions: string;
  }[];
  allowExecutionOfReadOnlyQueries: boolean;
  enableAutoCompact: boolean;

  // ==== MODELS ====
  /** List of disabled models by id. */
  disabledModels: { providerId: ProviderId; modelId: string }[];
  /** Models that are removed are not shown in the UI and cannot be enabled. */
  removedModels: { providerId: ProviderId; modelId: string }[];
  providers_openaiCompat_baseUrl: string;
  providers_openaiCompat_headers: string;
  providers_ollama_baseUrl: string;
  providers_ollama_headers: string;

  /** User-registered OpenAI-compatible endpoints (name, url, headers). */
  customProviders: CustomProviderConfig[];
  /** Runtime-fetched model lists keyed by custom provider id. */
  customProviderModels: Record<string, Model[]>;
} & {
  // User defined models
  [K in AvailableProviders as `providers_${K}_models`]: Model[];
};

type EncryptedConfigurable = {
  "providers.openai.apiKey": string;
  "providers.anthropic.apiKey": string;
  "providers.google.apiKey": string;
  "providers.zai.apiKey": string;
  "providers.deepseek.apiKey": string;
  "providers.openrouter.apiKey": string;
  providers_openaiCompat_apiKey: string;
  /** API keys keyed by custom provider id. */
  customProviderApiKeys: Record<string, string>;
};

type ConfigurationState = Configurable & EncryptedConfigurable;

export type ConfigurationKey = keyof ConfigurationState;

const encryptedConfigKeys: (keyof EncryptedConfigurable)[] = [
  "providers.openai.apiKey",
  "providers.anthropic.apiKey",
  "providers.google.apiKey",
  "providers.zai.apiKey",
  "providers.deepseek.apiKey",
  "providers.openrouter.apiKey",
  "providers_openaiCompat_apiKey",
  "customProviderApiKeys",
];

const defaultConfiguration: ConfigurationState = {
  // ==== GENERAL ====
  customInstructions: "",
  customConnectionInstructions: [],
  allowExecutionOfReadOnlyQueries: false,
  enableAutoCompact: true,

  // ==== MODELS ====
  "providers.openai.apiKey": "",
  "providers.anthropic.apiKey": "",
  "providers.google.apiKey": "",
  "providers.zai.apiKey": "",
  "providers.deepseek.apiKey": "",
  "providers.openrouter.apiKey": "",
  providers_openaiCompat_baseUrl: "https://api.meta.ai/v1",
  providers_openaiCompat_apiKey: "",
  providers_openaiCompat_headers: "",
  providers_ollama_baseUrl: "http://localhost:11434",
  providers_ollama_headers: "",
  customProviders: [],
  customProviderModels: {},
  customProviderApiKeys: {},
  providers_openai_models: [],
  providers_anthropic_models: [],
  providers_google_models: [],
  providers_zai_models: [],
  providers_deepseek_models: [],
  providers_openrouter_models: [],
  providers_openaiCompat_models: [],
  providers_ollama_models: [],
  providers_mock_models: [],
  disabledModels: disabledModelsByDefault,
  removedModels: [],
};

function isEncryptedConfig(
  config: string,
): config is keyof EncryptedConfigurable {
  return encryptedConfigKeys.includes(config as keyof EncryptedConfigurable);
}

export const useConfigurationStore = defineStore("configuration", {
  state: (): ConfigurationState => {
    return defaultConfiguration;
  },

  getters: {
    apiKeyExists(): boolean {
      return (
        encryptedConfigKeys.some(
          (key) =>
            typeof this[key] === "string" &&
            (this[key] as string).trim() !== "",
        ) ||
        Object.values(this.customProviderApiKeys).some(
          (key) => key.trim() !== "",
        )
      );
    },

    getModelsByProvider: (state) => {
      return (provider: ProviderId) => {
        if (provider.startsWith("custom-")) {
          return state.customProviderModels[provider] ?? [];
        }
        return (state as unknown as Record<string, Model[]>)[
          `providers_${provider}_models`
        ] ?? [];
      };
    },

    /** Models that are not defined in the config. */
    models(state): (Model & { providerId: ProviderId })[] {
      const availableProviders = Object.keys(
        providerConfigs,
      ) as AvailableProviders[];
      const builtinModels = availableProviders.flatMap((providerId) => {
        const models = (state as unknown as Record<string, Model[]>)[
          `providers_${providerId}_models`
        ];
        if (!models) {
          return [];
        }
        // Filter out removed models
        return models
          .filter(
            (model) =>
              !state.removedModels.some(
                (m) => m.modelId === model.id && m.providerId === providerId,
              ),
          )
          .map((model) => ({ ...model, providerId }));
      });
      const customModels = state.customProviders.flatMap((cp) =>
        (state.customProviderModels[cp.id] ?? [])
          .filter(
            (model) =>
              !state.removedModels.some(
                (m) => m.modelId === model.id && m.providerId === cp.id,
              ),
          )
          .map((model) => ({ ...model, providerId: cp.id as ProviderId })),
      );
      return [...builtinModels, ...customModels];
    },

    currentConnectionInstructions(state): string {
      const connection = useChatStore().connectionInfo;
      const connectionInstructions = state.customConnectionInstructions.find(
        (i) =>
          i.connectionId === connection.id &&
          i.workspaceId === connection.workspaceId,
      );
      return connectionInstructions?.instructions || "";
    },
  },

  actions: {
    async sync() {
      const configuration: Record<string, unknown> = {};
      for (const key in defaultConfiguration) {
        const value = await appStorage.getItem(key, {
          encrypted: isEncryptedConfig(key),
        });

        if (value === null) {
          continue;
        }

        configuration[key] = value;
      }

      this.$patch(configuration);
    },
    async configure<T extends keyof ConfigurationState>(
      config: T,
      value: ConfigurationState[T],
    ) {
      this.$patch({ [config]: value });

      await appStorage.setItem(config, value, {
        encrypted: isEncryptedConfig(config),
      });
    },

    async setModels(providerId: ProviderId, models: Model[]) {
      if (providerId.startsWith("custom-")) {
        await this.configure("customProviderModels", {
          ...this.customProviderModels,
          [providerId]: models,
        });
        return;
      }
      await this.configure(
        `providers_${providerId}_models` as keyof Configurable,
        models as never,
      );
    },

    async addCustomProvider(options: {
      name: string;
      baseUrl: string;
      headers?: string;
    }): Promise<CustomProviderConfig> {
      const slug =
        options.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "endpoint";
      const provider: CustomProviderConfig = {
        id: `custom-${slug}-${Math.random().toString(36).slice(2, 8)}`,
        name: options.name,
        baseUrl: options.baseUrl,
        headers: options.headers ?? "",
      };
      await this.configure("customProviders", [
        ...this.customProviders,
        provider,
      ]);
      return provider;
    },

    async updateCustomProvider(
      providerId: `custom-${string}`,
      patch: Partial<Omit<CustomProviderConfig, "id">>,
    ) {
      await this.configure(
        "customProviders",
        this.customProviders.map((cp) =>
          cp.id === providerId ? { ...cp, ...patch } : cp,
        ),
      );
    },

    async removeCustomProvider(providerId: `custom-${string}`) {
      await this.configure(
        "customProviders",
        this.customProviders.filter((cp) => cp.id !== providerId),
      );
      const customProviderModels = _.omit(this.customProviderModels, [
        providerId,
      ]);
      const customProviderApiKeys = _.omit(this.customProviderApiKeys, [
        providerId,
      ]);
      await this.configure("customProviderModels", customProviderModels);
      await this.configure("customProviderApiKeys", customProviderApiKeys);
      await this.configure("disabledModels", [
        ...this.disabledModels.filter((m) => m.providerId !== providerId),
      ]);
      await this.configure("removedModels", [
        ...this.removedModels.filter((m) => m.providerId !== providerId),
      ]);
    },

    async setCustomProviderApiKey(
      providerId: `custom-${string}`,
      apiKey: string,
    ) {
      await this.configure("customProviderApiKeys", {
        ...this.customProviderApiKeys,
        [providerId]: apiKey,
      });
    },

    async addModel(options: {
      providerId: ProviderId;
      modelId: string;
      displayName: string;
    }) {
      const models = _.cloneDeep(
        this.getModelsByProvider(options.providerId) ?? [],
      );
      models.push({ id: options.modelId, displayName: options.displayName });
      await this.setModels(options.providerId, models);
    },

    async removeModel(providerId: ProviderId, modelId: string) {
      const removedModels = _.cloneDeep(this.removedModels);
      removedModels.push({ providerId, modelId });
      await this.configure("removedModels", removedModels);
    },

    async disableModel(providerId: ProviderId, modelId: string) {
      if (
        this.disabledModels.find(
          (m) => m.providerId === providerId && m.modelId === modelId,
        )
      ) {
        return;
      }
      // clone this to avoid sending Proxy objects to the host
      const disabledModels = _.cloneDeep(this.disabledModels);
      disabledModels.push({ providerId, modelId });
      await this.configure("disabledModels", disabledModels);
    },

    async disableModels(
      models: { providerId: ProviderId; modelId: string }[],
    ) {
      const map = new Map<string, (typeof models)[number]>();

      for (const model of this.disabledModels) {
        // clone this to avoid sending Proxy objects to the host
        map.set(`${model.providerId}:${model.modelId}`, _.clone(model));
      }

      for (const model of models) {
        // clone this to avoid sending Proxy objects to the host
        map.set(`${model.providerId}:${model.modelId}`, _.clone(model));
      }

      await this.configure("disabledModels", [...map.values()]);
    },

    async enableModel(providerId: ProviderId, modelId: string) {
      const disabledModels = _.cloneDeep(this.disabledModels);
      const idx = disabledModels.findIndex(
        (m) => m.providerId === providerId && m.modelId === modelId,
      );
      if (idx !== -1) {
        disabledModels.splice(idx, 1);
      }
      await this.configure("disabledModels", disabledModels);
    },

    async configureCustomConnectionInstructions(instructions: string) {
      const connection = useChatStore().connectionInfo;
      const connectionId = connection.id;
      const workspaceId = connection.workspaceId;
      const connectionInstructions = _.cloneDeep(this.customConnectionInstructions);
      const idx = connectionInstructions.findIndex(
        (i) => i.connectionId === connectionId && i.workspaceId === workspaceId,
      );
      if (idx === -1) {
        connectionInstructions.push({
          connectionId,
          workspaceId,
          instructions,
        });
      } else {
        connectionInstructions[idx] = {
          connectionId,
          workspaceId,
          instructions,
        };
      }
      await this.configure(
        "customConnectionInstructions",
        connectionInstructions,
      );
    },
  },
});
