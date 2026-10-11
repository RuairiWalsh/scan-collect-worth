import { canReuseCardImage, cardImageIdentity, type CardImageIdentity } from "@/lib/card-product-images";
import { pickTcgGraphImage, tcgGraphGame, tcgGraphLanguage, tcgGraphName, type TcgGraphCard } from "@/lib/tcggraph";

/** Official TCG artwork from TCGGraph's CDN for supported games; null when no exact printing matches. */
export async function tcgGraphImage(item: CardImageIdentity): Promise<string | null> {
  const key = process.env["TCG_GRAPH_API_KEY"];
  const game = tcgGraphGame(item.line);
  if (!key || !game || !item.name || !item.number) return null;
  const params = new URLSearchParams({ game, name: tcgGraphName(item.name), collectorNumber: item.number.split("/")[0]?.trim() || item.number, language: tcgGraphLanguage(item.language), limit: "50" });
  const res = await fetch(`https://api.tcggraph.com/v1/cards?${params}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  // Rate limits and outages are not "no image": throw so the miss is not cached and the lookup retries.
  if (!res.ok) throw new Error(`TCGGraph lookup failed (${res.status})`);
  const body = await res.json() as { data?: TcgGraphCard[] };
  return pickTcgGraphImage(body.data ?? [], item.number, item.set_name);
}

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
  if (item.catalog_id) {
    const tcg = (await cachedTcgGraphImages([item.catalog_id]).catch(() => null))?.get(item.catalog_id);
    if (tcg) return tcg;
  }
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
  const row = { card_key: cardKey, catalog_id: item.catalog_id ?? null, claim_id: claim, updated_at: new Date().toISOString(), status: "processing", submitted_by: userId, original_scan: image, card_metadata: { ...item }, review_status: "approved" };
  const claimed = cached
    ? await db.from("card_product_images").update(row).eq("card_key", cardKey).eq("claim_id", cached.claim_id).select("card_key")
    : await db.from("card_product_images").insert(row).select("card_key");
  if (claimed.error?.code === "23505") return null;
  if (claimed.error) throw new Error("Could not save the card image cache.");
  if (!claimed.data?.length) return null;
  try {
    const processed = (await tcgGraphImage(item).catch(() => null)) ?? await processCardMagic(image);
    const { error: saveError } = await db.from("card_product_images").update({ image: processed, status: "ready", updated_at: new Date().toISOString() }).eq("card_key", cardKey).eq("claim_id", claim);
    if (saveError) throw new Error("Could not save the processed card image.");
    return processed;
  } catch (error) {
    await db.from("card_product_images").update({ status: "failed", updated_at: new Date().toISOString() }).eq("card_key", cardKey).eq("claim_id", claim);
    throw error;
  }
}

const RECHECK_MS = 30 * 86_400_000;

/** Looks up TCGGraph artwork once per catalog card and caches the CDN URL (or a miss) on catalog_prices. */
export async function cachedTcgGraphImages(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("catalog_prices").select("catalog_id,name,number,set_name,game,tcggraph_image,tcggraph_checked_at").in("catalog_id", ids);
  const stale: NonNullable<typeof data> = [];
  for (const r of data ?? []) {
    if (r.tcggraph_image) out.set(r.catalog_id, r.tcggraph_image);
    else if (tcgGraphGame(r.game ?? r.catalog_id) && (!r.tcggraph_checked_at || Date.parse(r.tcggraph_checked_at) < Date.now() - RECHECK_MS)) stale.push(r);
  }
  // TCGGraph allows 60 requests/minute; cap each call and stop at the first failure (usually a rate limit).
  let failed = false;
  const batch = stale.slice(0, 40);
  for (let i = 0; i < batch.length && !failed; i += 5) {
    await Promise.all(batch.slice(i, i + 5).map(async r => {
      const image = await tcgGraphImage({ line: r.game ?? r.catalog_id, name: r.name, number: r.number, set_name: r.set_name, language: (r.game ?? r.catalog_id).startsWith("pokemon-japan") ? "ja" : "en" }).catch(() => undefined);
      if (image === undefined) { failed = true; return; } // rate limit / network failure: retry next time
      await db.from("catalog_prices").update({ tcggraph_image: image, tcggraph_checked_at: new Date().toISOString() }).eq("catalog_id", r.catalog_id);
      if (image) { out.set(r.catalog_id, image); await db.from("items").update({ product_image: image }).eq("catalog_id", r.catalog_id); }
    }));
  }
  return out;
}

export async function catalogProductImages(db: { from: (table: "card_product_images") => any }, ids: string[]): Promise<Map<string, string>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!ids.length) return new Map();
  const tcg = await cachedTcgGraphImages(ids).catch(() => new Map<string, string>());
  const rest = ids.filter(id => !tcg.has(id));
  if (!rest.length) return tcg;
  const { data } = await db.from("card_product_images").select("catalog_id,image").in("catalog_id", rest).eq("status", "ready").eq("review_status", "approved");
  return new Map([...tcg, ...(data ?? []).filter((r: { catalog_id: string | null; image: string | null }) => r.catalog_id && r.image).map((r: { catalog_id: string; image: string }) => [r.catalog_id, r.image] as [string, string])]);
}