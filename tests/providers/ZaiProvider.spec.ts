import { providerConfigs } from "../../src/config";
import { ZaiProvider } from "../../src/providers/ZaiProvider";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("ZaiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates Z.AI language models through the AI SDK provider", () => {
    const provider = new ZaiProvider({
      apiKey: "test-key",
    });

    const model = provider.getModel("glm-5.1");

    expect(model.provider).toBe("zhipu.chat");
    expect(model.modelId).toBe("glm-5.1");
  });

  it("falls back to the bundled model list when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    const provider = new ZaiProvider({
      apiKey: "test-key",
    });

    await expect(provider.listModels()).resolves.toEqual(
      providerConfigs.zai.models,
    );
  });

  it("lists the models returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: "glm-5.1" }, { id: "glm-5" }],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new ZaiProvider({
      apiKey: "test-key",
    });

    await expect(provider.listModels()).resolves.toEqual([
      { id: "glm-5.1", displayName: "glm-5.1" },
      { id: "glm-5", displayName: "glm-5" },
    ]);
  });
});
