import { afterEach, describe, expect, it, vi } from "vitest";
import { processCardMagic } from "./cardmagic.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("CardMagic processing", () => {
  it("uploads the source scan to processing, never catalog images", async () => {
    vi.stubEnv("CARDSIGHT_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await processCardMagic("data:image/jpeg;base64,/9j/")).toBe("data:image/jpeg;base64,/9j/");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/cardmagic/process?");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("image")).toBeInstanceOf(Blob);
  });
  it("rejects multiple-card ZIPs rather than caching the wrong card", async () => {
    vi.stubEnv("CARDSIGHT_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("zip", { headers: { "content-type": "application/zip" } })));
    await expect(processCardMagic("data:image/jpeg;base64,/9j/")).rejects.toThrow("just one card");
  });
  it("fails safely when processing is unavailable", async () => {
    vi.stubEnv("CARDSIGHT_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(processCardMagic("data:image/jpeg;base64,/9j/")).rejects.toThrow("original scan");
  });
});