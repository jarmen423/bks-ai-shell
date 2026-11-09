import type { ProviderId } from "@/config";
import { AnthropicProvider } from "@/providers/AnthropicProvider";
import { DeepSeekProvider } from "@/providers/DeepSeekProvider";
import { OpenAIProvider } from "@/providers/OpenAIProvider";
import { OpenAICompatibleProvider } from "@/providers/OpenAICompatibleProvider";
import { OpenRouterProvider } from "@/providers/OpenRouterProvider";
import { GoogleProvider } from "@/providers/GoogleProvider";
import { ZaiProvider } from "@/providers/ZaiProvider";
import { useConfigurationStore } from "@/stores/configuration";
import { OllamaProvider } from "./OllamaProvider";
import { MockProvider } from "@/providers/MockProvider";
import { parseHeaders } from "@/utils";
import _ from "lodash";

export function createProvider(id: ProviderId)  {
  const configuration = useConfigurationStore();
  switch (id) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey: configuration["providers.anthropic.apiKey"],
      });
    case "openai":
      return new OpenAIProvider({
        apiKey: configuration["providers.openai.apiKey"],
      });
    case "google":
      return new GoogleProvider({
        apiKey: configuration["providers.google.apiKey"],
      });
    case "zai":
      return new ZaiProvider({
        apiKey: configuration["providers.zai.apiKey"],
      });
    case "deepseek":
      return new DeepSeekProvider({
        apiKey: configuration["providers.deepseek.apiKey"],
      });
    case "openrouter":
      return new OpenRouterProvider({
        apiKey: configuration["providers.openrouter.apiKey"],
      });
    case "openaiCompat":
      if (_.isEmpty(configuration.providers_openaiCompat_baseUrl)) {
        throw new Error("Missing API base URL [2]");
      }
      return new OpenAICompatibleProvider({
        baseURL: configuration.providers_openaiCompat_baseUrl,
        apiKey: configuration.providers_openaiCompat_apiKey,
        headers: parseHeaders(configuration.providers_openaiCompat_headers),
      });
    case "ollama":
      if (_.isEmpty(configuration.providers_ollama_baseUrl)) {
        throw new Error("Missing API base URL [2]");
      }
      return new OllamaProvider({
        baseURL: configuration.providers_ollama_baseUrl,
        headers: parseHeaders(configuration.providers_ollama_headers),
      });
    case "mock":
      if (import.meta.env.MODE !== "development") {
        throw new Error("Mock provider is only available in development mode");
      }
      return new MockProvider();
    default: {
      const custom = configuration.customProviders.find((cp) => cp.id === id);
      if (custom) {
        if (_.isEmpty(custom.baseUrl)) {
          throw new Error("Missing API base URL [2]");
        }
        return new OpenAICompatibleProvider({
          providerId: custom.id,
          baseURL: custom.baseUrl,
          apiKey: configuration.customProviderApiKeys[custom.id] ?? "",
          headers: parseHeaders(custom.headers),
          name: custom.name,
        });
      }
      throw new Error(`Provider ${id} does not exist.`);
    }
  }
}
