import type { AvailableProviders, ModelInfo } from "@/config";
import { providerConfigs } from "@/config";
import { BaseProvider } from "@/providers/BaseProvider";
import { createAnthropic } from "@ai-sdk/anthropic";

const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=1000";

export class AnthropicProvider extends BaseProvider {
  constructor(private options: { apiKey: string }) {
    super();
  }

  get providerId(): AvailableProviders {
    return "anthropic";
  }

  getModel(id: string) {
    return createAnthropic({
      apiKey: this.options.apiKey,
      headers: { "anthropic-dangerous-direct-browser-access": "true" },
    }).languageModel(id);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(ANTHROPIC_MODELS_URL, {
        headers: {
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
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
        displayName: m.display_name ?? m.id,
      }));
      // Newest first
      models.sort(
        (a, b) =>
          (data.data.find((m: any) => m.id === b.id)?.created_at ?? "").localeCompare(
            data.data.find((m: any) => m.id === a.id)?.created_at ?? "",
          ),
      );
      if (models.length === 0) {
        throw new Error("Empty model list");
      }
      return models;
    } catch (e) {
      console.warn("Failed to fetch Anthropic models; using bundled list", e);
      // @ts-expect-error readonly tuple is fine at runtime
      return providerConfigs.anthropic.models;
    }
  }
}
