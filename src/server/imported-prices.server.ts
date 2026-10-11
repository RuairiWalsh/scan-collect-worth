import type { Database, Json } from "@/integrations/supabase/types";
import { cardVariants } from "@/lib/card-pricing";
import { cardsightVariants, type CardsightPricing } from "@/lib/cardsight-pricing";
import { isLocalCatalogId, isCardsightId } from "@/lib/imported-catalog";
import type { Identification } from "@/lib/scan.functions";

type Row = Database["public"]["Tables"]["catalog_prices"]["Row"];
export async function refreshImportedPrice(id: string, bulk?: CardsightPricing) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: row } = await db.from("catalog_prices").select("*").eq("catalog_id", id).maybeSingle();
  if (!row) return false;
  return refreshTrackedRow(row, bulk);
}
export async function refreshTrackedRow(row: Row, bulk?: CardsightPricing) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const checked = new Date().toISOString();
  try {
    const item = row.card_metadata as unknown as Identification;
    let providerId = row.provider_card_id;
    let variants = cardVariants([]);
    let basePrice: number | null = null;
    if (row.price_provider === "cardsight") {
      const { cardsightFindCard, cardsightGetPricing } = await import("@/server/cardsight.server");
      if (!providerId) providerId = (await cardsightFindCard(item))?.id ?? null;
      if (!providerId) throw new Error("No exact CardSight match; daily lookup will retry.");
      const data = bulk ?? await cardsightGetPricing(providerId);
      if (data) variants = cardsightVariants(data);
      basePrice = variants.find(v => v.condition === "Ungraded" && v.printing === "Normal")?.price ?? null;
    } else if (row.price_provider === "justtcg") {
      const { catalogCardById, findCatalogCandidates } = await import("@/server/prices.server");
      const { confidentMatch } = await import("@/lib/catalog");
      if (!providerId && !isLocalCatalogId(row.catalog_id) && !isCardsightId(row.catalog_id)) providerId = row.catalog_id;
      const card = providerId ? await catalogCardById(providerId) : confidentMatch(await findCatalogCandidates(item));
      if (!card) throw new Error("No exact JustTCG match; daily lookup will retry.");
      providerId = card.id;
      variants = cardVariants(card.variants);
      basePrice = variants.find(v => v.condition === "Near Mint" && !/reverse/i.test(v.printing ?? ""))?.price ?? null;
    } else {
      const { ebay } = await import("@/server/prices.server");
      const sources = await ebay({ ...item, condition: "raw_ungraded", grader: null, grade: null });
      if (sources[0]) variants = [{ condition: "Ungraded", printing: item.variant || "Normal", price: sources[0].price, sources: sources.map(s => ({ ...s, kind: "market" as const })) }];
      basePrice = variants[0]?.price ?? null;
    }
    const { error } = await db.from("catalog_prices").update({ variants: variants as unknown as Json, nm_price: basePrice, provider_card_id: providerId, updated_at: checked, price_checked_at: checked, price_status: variants.length ? "ready" : "no_comps", price_error: null }).eq("catalog_id", row.catalog_id);
    if (error) throw new Error("Could not save the daily price.");
    if (basePrice != null) await db.from("catalog_price_history").upsert({ catalog_id: row.catalog_id, nm_price: basePrice, recorded_at: checked }, { onConflict: "catalog_id,recorded_at", ignoreDuplicates: true });
    return true;
  } catch (error) {
    await db.from("catalog_prices").update({ price_checked_at: checked, price_status: "failed", price_error: error instanceof Error ? error.message : "Price lookup unavailable" }).eq("catalog_id", row.catalog_id);
    return false;
  }
}