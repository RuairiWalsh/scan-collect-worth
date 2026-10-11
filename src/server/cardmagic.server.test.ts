import { afterEach, describe, expect, it, vi } from "vitest";
import { processCardMagic } from "./cardmagic.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("CardMagic processing", () => {
  it("uploads the source scan to processing, never catalog images", async () => {
    vi.stubEnv("CARDSIGHT_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await processCardMagic("data:image/jpeg;base64,/9j/")).toBe("data:image/jpeg;base64,/9j/");
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("Expected CardMagic to receive a request");
    const [url, options] = call;
    expect(url).toContain("/v1/cardmagic/process?");
    const body = options?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new Error("Expected a multipart image upload");
    expect(body.get("image")).toBeInstanceOf(Blob);
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