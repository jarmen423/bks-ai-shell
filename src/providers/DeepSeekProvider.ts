import type { AvailableProviders, ModelInfo } from "@/config";
import { providerConfigs } from "@/config";
import { BaseProvider } from "@/providers/BaseProvider";
import { createDeepSeek } from "@ai-sdk/deepseek";

const DEEPSEEK_MODELS_URL = "https://api.deepseek.com/models";

export class DeepSeekProvider extends BaseProvider {
  constructor(private options: { apiKey: string }) {
    super();
  }

  get providerId(): AvailableProviders {
    return "deepseek";
  }

  getModel(id: string) {
    return createDeepSeek({
      apiKey: this.options.apiKey,
    }).languageModel(id);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(DEEPSEEK_MODELS_URL, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to list models: ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.data)) {
        throw new Error("Unexpected response shape");
      }
      const models = (data.data as any[]).map<ModelInfo>((m) => ({
        id: m.id,
        displayName: m.id,
      }));
      if (models.length === 0) {
        throw new Error("Empty model list");
      }
      return models;
    } catch (e) {
      console.warn("Failed to fetch DeepSeek models; using bundled list", e);
      // @ts-expect-error readonly tuple is fine at runtime
      return providerConfigs.deepseek.models;
    }
  }
}
