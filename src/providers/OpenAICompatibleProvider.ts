import type { ModelInfo, ProviderId } from "@/config";
import { BaseProvider } from "@/providers/BaseProvider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Always offered on the built-in slot, even when the endpoint's /models
 * endpoint does not list it. */
const MUSE_MODEL_ID = "muse-spark-1.2-contributor";

export class OpenAICompatibleProvider extends BaseProvider {
  constructor(
    protected options: {
      baseURL: string;
      headers: Record<string, string>;
      apiKey: string;
      name?: string;
      /** Overrides the provider id so custom endpoints report their own id. */
      providerId?: ProviderId;
    },
  ) {
    super();
    this.options.baseURL = this.options.baseURL.endsWith("/")
      ? this.options.baseURL
      : this.options.baseURL + "/";
  }

  get providerId(): ProviderId {
    return this.options.providerId ?? "openaiCompat";
  }

  getModel(id: string) {
    return createOpenAICompatible({
      baseURL: this.options.baseURL,
      apiKey: this.options.apiKey,
      headers: this.options.headers,
      name: this.options.name ?? "OpenAI Compatible (AI Shell)",
    }).languageModel(id);
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = new URL("models", this.options.baseURL);

    let fetchedModels: ModelInfo[] = [];
    try {
      const res = await fetch(url.toString(), {
        headers: this.buildFetchHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Failed to list models: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(`Failed to list models: ${data.error}`);
      }
      if (Array.isArray(data.data)) {
        fetchedModels = (data.data as any[]).map<ModelInfo>((m) => ({
          id: m.id,
          displayName: m.name ?? m.id,
          contextWindow: m.context_length,
        }));
      } else {
        // use log.warn from @beekeeperstudio/plugin
        console.warn("Provider returns invalid data", this.options.baseURL, data);
      }
    } catch (e) {
      // use log.warn from @beekeeperstudio/plugin
      console.warn("Failed to fetch model list", this.options.baseURL, e);
    }

    if (
      this.providerId === "openaiCompat" &&
      !fetchedModels.some((m) => m.id === MUSE_MODEL_ID)
    ) {
      fetchedModels.push({
        id: MUSE_MODEL_ID,
        displayName: MUSE_MODEL_ID,
      });
    }

    return fetchedModels;
  }

  protected buildFetchHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.options.apiKey) {
      headers["Authorization"] = `Bearer ${this.options.apiKey}`;
    }
    return {
      ...headers,
      ...this.options.headers,
    };
  }
}
