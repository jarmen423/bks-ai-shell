import { providerConfigs } from "../../src/config";
import { DeepSeekProvider } from "../../src/providers/DeepSeekProvider";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("DeepSeekProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates DeepSeek language models through the AI SDK provider", () => {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
    });

    const model = provider.getModel("deepseek-v4-flash");

    expect(model.provider).toBe("deepseek.chat");
    expect(model.modelId).toBe("deepseek-v4-flash");
  });

  it("falls back to the bundled model list when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
    });

    await expect(provider.listModels()).resolves.toEqual(
      providerConfigs.deepseek.models,
    );
  });

  it("lists the models returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: "list",
            data: [
              { id: "deepseek-chat" },
              { id: "deepseek-reasoner" },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
    });

    await expect(provider.listModels()).resolves.toEqual([
      { id: "deepseek-chat", displayName: "deepseek-chat" },
      { id: "deepseek-reasoner", displayName: "deepseek-reasoner" },
    ]);
  });
});
