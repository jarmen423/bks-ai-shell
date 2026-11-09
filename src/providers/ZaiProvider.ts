import type { AvailableProviders, ModelInfo } from "@/config";
import { providerConfigs } from "@/config";
import { BaseProvider } from "@/providers/BaseProvider";
import { createZhipu } from "zhipu-ai-provider";

const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";

export class ZaiProvider extends BaseProvider {
  constructor(private options: { apiKey: string }) {
    super();
  }

  get providerId(): AvailableProviders {
    return "zai";
  }

  getModel(id: string) {
    return createZhipu({
      baseURL: ZAI_BASE_URL,
      apiKey: this.options.apiKey,
    }).languageModel(id);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${ZAI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to list models: ${res.statusText}`);
      }
      const data = await res.json();
      const entries = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.models)
          ? data.models
          : null;
      if (!entries) {
        throw new Error("Unexpected response shape");
      }
      const models = (entries as any[]).map<ModelInfo>((m) => ({
        id: m.id ?? m.name,
        displayName: m.name ?? m.id,
      }));
      if (models.length === 0) {
        throw new Error("Empty model list");
      }
      return models;
    } catch (e) {
      console.warn("Failed to fetch Z.AI models; using bundled list", e);
      // @ts-expect-error readonly tuple is fine at runtime
      return providerConfigs.zai.models;
    }
  }
}
