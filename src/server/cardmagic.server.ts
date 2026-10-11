import { canReuseCardImage, cardImageIdentity, type CardImageIdentity } from "@/lib/card-product-images";

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

/** Dedicated CardMagic processing endpoint: source photograph in, cleaned photograph out. */
export async function processCardMagic(image: string): Promise<string> {
  const key = process.env["CARDSIGHT_API_KEY"];
  if (!key) throw new Error("CardMagic is not configured. Your original scan is still available.");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match?.[1] || !match[2]) throw new Error("CardMagic needs a JPEG, PNG or WebP scan.");
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: match[1] }), "card-front.jpg");
  const params = new URLSearchParams({ mode: "process", paddingPercent: "0", autoLevels: "true", outputFormat: "jpeg", longEdge: "1000", corners: "false" });
  const response = await fetch(`https://api.cardsight.ai/v1/cardmagic/process?${params}`, { method: "POST", headers: { "X-API-Key": key }, body: form, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`CardMagic could not process this scan (${response.status}). Your original scan is still available.`);
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType !== "image/jpeg" && contentType !== "image/png") throw new Error("CardMagic needs a photo containing just one card.");
  const output = new Uint8Array(await response.arrayBuffer());
  if (!output.length || output.length > 1_000_000) throw new Error("CardMagic returned an unsupported image size.");
  let binary = "";
  for (let i = 0; i < output.length; i += 8192) binary += String.fromCharCode(...output.subarray(i, i + 8192));
  return `data:${contentType};base64,${btoa(binary)}`;
}

/** Admin writes are restricted to the shared derived-image cache, after the caller is authenticated. */
export async function cachedCardMagic(item: CardImageIdentity, image: string, userId: string): Promise<string | null> {
  const identity = cardImageIdentity(item);
  const cardKey = await digest(identity ?? `scan:${image}`);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: cached, error } = await db.from("card_product_images").select("*").eq("card_key", cardKey).maybeSingle();
  if (error) throw new Error("Could not read the card image cache.");
  if (cached?.status === "ready") return canReuseCardImage(cached.review_status, cached.submitted_by, userId) ? cached.image : null;
  // Do not automatically retry failed paid calls; a newer scan can be retried explicitly later.
  if (cached?.status === "failed") return null;
  if (cached?.status === "processing" && Date.parse(cached.updated_at) > Date.now() - 10 * 60_000) return null;
  const claim = crypto.randomUUID();
  const row = { card_key: cardKey, catalog_id: item.catalog_id ?? null, claim_id: claim, updated_at: new Date().toISOString(), status: "processing", submitted_by: userId, original_scan: image, card_metadata: { ...item }, review_status: "pending" };
  const claimed = cached
    ? await db.from("card_product_images").update(row).eq("card_key", cardKey).eq("claim_id", cached.claim_id).select("card_key")
    : await db.from("card_product_images").insert(row).select("card_key");
  if (claimed.error?.code === "23505") return null;
  if (claimed.error) throw new Error("Could not save the card image cache.");
  if (!claimed.data?.length) return null;
  try {
    const processed = await processCardMagic(image);
    const { error: saveError } = await db.from("card_product_images").update({ image: processed, status: "ready", updated_at: new Date().toISOString() }).eq("card_key", cardKey).eq("claim_id", claim);
    if (saveError) throw new Error("Could not save the processed card image.");
    return processed;
  } catch (error) {
    await db.from("card_product_images").update({ status: "failed", updated_at: new Date().toISOString() }).eq("card_key", cardKey).eq("claim_id", claim);
    throw error;
  }
}

export async function catalogProductImages(db: { from: (table: "card_product_images") => any }, ids: string[]): Promise<Map<string, string>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!ids.length) return new Map();
  const { data } = await db.from("card_product_images").select("catalog_id,image").in("catalog_id", ids).eq("status", "ready").eq("review_status", "approved");
  return new Map((data ?? []).filter((r: { catalog_id: string | null; image: string | null }) => r.catalog_id && r.image).map((r: { catalog_id: string; image: string }) => [r.catalog_id, r.image]));
}