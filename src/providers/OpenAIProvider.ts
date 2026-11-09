import type { AvailableProviders, ModelInfo } from "@/config";
import { providerConfigs } from "@/config";
import { BaseProvider } from "@/providers/BaseProvider";
import { createOpenAI } from "@ai-sdk/openai";

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

/** Ids that can hold a chat/responses conversation. */
const CHAT_MODEL = /^(gpt-|o\d|codex|chatgpt-)/i;
/** Non-conversational families the picker should not offer. */
const NON_CHAT_MODEL =
  /(audio|realtime|tts|whisper|dall-e|embedding|moderation|transcribe|image|search-api|deep-research|computer-use)/i;

export class OpenAIProvider extends BaseProvider {
  constructor(private options: { apiKey: string }) {
    super();
  }

  get providerId(): AvailableProviders {
    return "openai";
  }

  getModel(id: string) {
    return createOpenAI({
      apiKey: this.options.apiKey,
    }).languageModel(id);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(OPENAI_MODELS_URL, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to list models: ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.data)) {
        throw new Error("Unexpected response shape");
      }
      const models = (data.data as any[])
        .filter(
          (m) =>
            typeof m.id === "string" &&
            CHAT_MODEL.test(m.id) &&
            !NON_CHAT_MODEL.test(m.id),
        )
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
        .map<ModelInfo>((m) => ({
          id: m.id,
          displayName: m.id,
        }));
      if (models.length === 0) {
        throw new Error("Empty model list");
      }
      return models;
    } catch (e) {
      console.warn("Failed to fetch OpenAI models; using bundled list", e);
      // @ts-expect-error readonly tuple is fine at runtime
      return providerConfigs.openai.models;
    }
  }
}
