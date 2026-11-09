import type { AvailableProviders, ModelInfo } from "@/config";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(options: { apiKey: string }) {
    super({
      baseURL: OPENROUTER_BASE_URL,
      apiKey: options.apiKey,
      headers: {},
      name: "openrouter",
      providerId: "openrouter",
    });
  }

  get providerId(): AvailableProviders {
    return "openrouter";
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${OPENROUTER_BASE_URL}/models`;
    const res = await fetch(url, {
      headers: this.buildFetchHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to list models: ${res.statusText}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.data)) {
      throw new Error("Failed to list models: unexpected response shape");
    }
    return (data.data as any[])
      .filter((m) => {
        // Skip image/audio generators; keep models that produce text output
        // (modality like "text->text" or "text+image->text").
        const modality = m.architecture?.modality;
        return (
          typeof m.id === "string" &&
          (typeof modality !== "string" || modality.endsWith("->text"))
        );
      })
      .map<ModelInfo>((m) => ({
        id: m.id,
        displayName: m.name ?? m.id,
        contextWindow:
          typeof m.context_length === "number" ? m.context_length : undefined,
      }));
  }
}
