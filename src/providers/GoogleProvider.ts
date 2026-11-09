import type { AvailableProviders, ModelInfo } from "@/config";
import { providerConfigs } from "@/config";
import { BaseProvider } from "@/providers/BaseProvider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const GOOGLE_MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";

/** Sort gemini-<version> ids newest-version first, then by name. */
function geminiVersionRank(id: string): [number[], string] {
  const match = id.match(/gemini-(\d+(?:\.\d+)*)/);
  const parts = match?.[1]?.split(".").map(Number) ?? [0];
  return [parts, id];
}

function compareRank([av, aid]: [number[], string], [bv, bid]: [number[], string]) {
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const diff = (bv[i] ?? 0) - (av[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return bid.localeCompare(aid);
}

export class GoogleProvider extends BaseProvider {
  constructor(private options: { apiKey: string }) {
    super();
  }

  get providerId(): AvailableProviders {
    return "google";
  }

  getModel(id: string) {
    return createGoogleGenerativeAI({
      apiKey: this.options.apiKey,
    }).languageModel(id);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(GOOGLE_MODELS_URL, {
        headers: { "x-goog-api-key": this.options.apiKey },
      });
      if (!res.ok) {
        throw new Error(`Failed to list models: ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.models)) {
        throw new Error("Unexpected response shape");
      }
      const models = (data.models as any[])
        .filter(
          (m) =>
            typeof m.name === "string" &&
            m.name.startsWith("models/gemini") &&
            (m.supportedGenerationMethods ?? []).includes("generateContent"),
        )
        .map<ModelInfo>((m) => ({
          id: m.name.replace(/^models\//, ""),
          displayName:
            typeof m.displayName === "string" && m.displayName.length > 0
              ? m.displayName
              : m.name.replace(/^models\//, ""),
        }))
        .sort((a, b) =>
          compareRank(geminiVersionRank(a.id), geminiVersionRank(b.id)),
        );
      if (models.length === 0) {
        throw new Error("Empty model list");
      }
      return models;
    } catch (e) {
      console.warn("Failed to fetch Google models; using bundled list", e);
      // @ts-expect-error readonly tuple is fine at runtime
      return providerConfigs.google.models;
    }
  }
}
