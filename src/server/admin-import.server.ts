import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cardImageIdentity } from "@/lib/card-product-images";
import { isImportedPair, pdfCardPair, scannerImageApproval } from "@/lib/pdf-card-pairs";
import type { Identification } from "@/lib/scan.functions";
import { reviewedCatalogId, sameImportedIdentity, isCardsightId } from "@/lib/imported-catalog";

type Pair = Database["public"]["Tables"]["card_image_import_pairs"]["Row"];

export async function assertImportAdmin(db: SupabaseClient<Database>, userId: string) {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Admins only");
  return scannerImageApproval(data);
}

async function imageData(blob: Blob) {
  if (!blob.type.startsWith("image/") || blob.size > 20 * 1024 * 1024) throw new Error("Unsupported scan image.");
  const binary = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < binary.length; i += 8192) text += String.fromCharCode(...binary.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(text)}`;
}

async function publishPair(pair: Pair, item: Identification, userId: string, confirmed = false) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const identity = cardImageIdentity(item);
  // Incomplete identities stay private rather than publishing a guessed catalog image.
  if (!confirmed || !identity || !item.is_collectible || item.category !== "cards") {
    const { error } = await db.from("card_image_import_pairs").update({ status: "needs_details", metadata: item as unknown as Json, error: "Confirm this card's identity before sharing.", updated_at: new Date().toISOString() }).eq("id", pair.id);
    if (error) throw new Error("Could not save card details.");
    return "needs_details";
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const catalogId = reviewedCatalogId(key, item.catalog_id);
  const provider = item.subcategory === "sports" ? "cardsight" : item.subcategory === "tcg" ? "justtcg" : "ebay";
  const { data: existingCard } = await db.from("catalog_prices").select("catalog_id").eq("catalog_id", catalogId).maybeSingle();
  const { error: catalogError } = await db.from("catalog_prices").upsert({
    catalog_id: catalogId, name: item.name, set_name: item.set_name, number: item.number,
    card_metadata: item as unknown as Json, price_provider: provider,
    provider_card_id: item.catalog_id ?? null, imported_card: true,
    ...(existingCard ? {} : { variants: [], nm_price: null, image: null }),
  });
  if (catalogError) throw new Error("Could not save this card to the shared catalog.");
  const frontUrl = `/api/public/card-images/${key}?side=front`;
  const backUrl = `/api/public/card-images/${key}?side=back`;
  const { error } = await db.from("card_product_images").upsert({
    card_key: key, catalog_id: catalogId, image: frontUrl, original_scan: frontUrl,
    back_image: backUrl, front_storage_path: pair.front_path, back_storage_path: pair.back_path,
    status: "ready", source: "admin_scanner", review_status: "approved", reviewed_by: userId,
    reviewed_at: new Date().toISOString(), submitted_by: userId, card_metadata: item as unknown as Json,
    claim_id: crypto.randomUUID(), updated_at: new Date().toISOString(), review_note: "Admin confirmed scanner card and images",
  });
  if (error) throw new Error("Could not publish the scanner images.");
  const saved = await db.from("card_image_import_pairs").update({ status: "approved", card_key: key, metadata: item as unknown as Json, error: null, updated_at: new Date().toISOString() }).eq("id", pair.id);
  if (saved.error) throw new Error("Could not save import progress.");
  // Publishing succeeds even when pricing is unavailable; the daily queue retries it.
  const { refreshImportedPrice } = await import("@/server/imported-prices.server");
  await refreshImportedPrice(catalogId).catch(() => undefined);
  return "approved";
}

/** Identify several pairs in one light-model AI call, then publish each for review. */
export async function processImportBatch(importId: string, start: number, count: number, userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: batch } = await db.from("card_image_imports").select("*").eq("id", importId).eq("user_id", userId).single();
  if (!batch) throw new Error("Import unavailable.");
  const total = batch.page_count / 2;
  if (count < 1 || count > 8 || start < 0 || start + count > total) throw new Error("Invalid batch range.");
  const indexes = Array.from({ length: count }, (_, i) => start + i);
  const { data: existingRows } = await db.from("card_image_import_pairs").select("pair_index,status").eq("import_id", importId).in("pair_index", indexes);
  const done = new Set((existingRows ?? []).filter((r) => isImportedPair(r.status)).map((r) => r.pair_index));
  const todo = indexes.filter((i) => !done.has(i));
  const statuses: Record<number, string> = {};
  for (const i of indexes) if (done.has(i)) statuses[i] = existingRows!.find((r) => r.pair_index === i)!.status;
  if (!todo.length) return { statuses };
  const pairs: { index: number; pair: Pair; front: string; back: string }[] = [];
  for (const index of todo) {
    pdfCardPair(batch.page_count, index);
    const frontPath = `${userId}/${importId}/${index}-front.png`;
    const backPath = `${userId}/${importId}/${index}-back.png`;
    const { data: pair, error: saveError } = await db.from("card_image_import_pairs").upsert({ import_id: importId, pair_index: index, front_path: frontPath, back_path: backPath, status: "pending" }, { onConflict: "import_id,pair_index" }).select("*").single();
    if (saveError || !pair) throw new Error("Could not start card import.");
    const [front, back] = await Promise.all([db.storage.from("admin-card-scans").download(frontPath), db.storage.from("admin-card-scans").download(backPath)]);
    if (!front.data || !back.data || front.error || back.error) throw new Error("Both scan pages must be uploaded before identification.");
    pairs.push({ index, pair, front: await imageData(front.data), back: await imageData(back.data) });
  }
  const { identifyImportBatch } = await import("@/server/identify.server");
  const identified = await identifyImportBatch(pairs.map((p) => ({ front: p.front, back: p.back })));
  for (let i = 0; i < pairs.length; i++) {
    const { index, pair } = pairs[i]!;
    try {
      statuses[index] = await publishPair(pair, identified[i]!, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Card import failed.";
      await db.from("card_image_import_pairs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", pair.id);
      statuses[index] = "failed";
    }
  }
  return { statuses };
}

export async function processImportPair(importId: string, index: number, userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: batch } = await db.from("card_image_imports").select("*").eq("id", importId).eq("user_id", userId).single();
  if (!batch) throw new Error("Import unavailable.");
  pdfCardPair(batch.page_count, index);
  const frontPath = `${userId}/${importId}/${index}-front.png`;
  const backPath = `${userId}/${importId}/${index}-back.png`;
  const { data: existing } = await db.from("card_image_import_pairs").select("*").eq("import_id", importId).eq("pair_index", index).maybeSingle();
  if (existing && isImportedPair(existing.status)) return { status: existing.status };
  const { data: pair, error: saveError } = await db.from("card_image_import_pairs").upsert({ import_id: importId, pair_index: index, front_path: frontPath, back_path: backPath, status: "pending" }, { onConflict: "import_id,pair_index" }).select("*").single();
  if (saveError || !pair) throw new Error("Could not start card import.");
  try {
    const [front, back] = await Promise.all([db.storage.from("admin-card-scans").download(frontPath), db.storage.from("admin-card-scans").download(backPath)]);
    if (!front.data || !back.data || front.error || back.error) throw new Error("Both scan pages must be uploaded before identification.");
    // Catalog imports never send images to CardSight: the cheap reader extracts
    // text, and only name/set/number/year go to the catalog lookup.
    const { identifyImportBatch } = await import("@/server/identify.server");
    const [result] = await identifyImportBatch([{ front: await imageData(front.data), back: await imageData(back.data) }]);
    if (!result) throw new Error("The card could not be read.");
    return { status: await publishPair(pair, result, userId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Card import failed.";
    await db.from("card_image_import_pairs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", pair.id);
    throw new Error(message);
  }
}

export async function confirmImportPair(pairId: string, item: Identification, userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: pair } = await db.from("card_image_import_pairs").select("*").eq("id", pairId).single();
  if (!pair) throw new Error("Scan unavailable.");
  const suggested = pair.metadata as unknown as Identification;
  let providerId = sameImportedIdentity(suggested, item) ? suggested.catalog_id : null;
  if (!providerId) {
    if (item.subcategory === "sports") {
      const { cardsightFindCard } = await import("@/server/cardsight.server");
      providerId = (await cardsightFindCard(item))?.id ?? null;
    } else if (item.subcategory === "tcg") {
      const { findCatalogCandidates } = await import("@/server/prices.server");
      const { confidentMatch } = await import("@/lib/catalog");
      providerId = confidentMatch(await findCatalogCandidates(item))?.id ?? null;
    }
  }
  if (item.subcategory === "tcg" && providerId && isCardsightId(providerId)) providerId = null;
  return { status: await publishPair(pair, { ...item, catalog_id: providerId ?? null, confidence: 1, is_collectible: true, category: "cards" }, userId, true) };
}