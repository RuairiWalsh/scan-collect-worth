import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateValue } from "@/lib/pricing";
import type { Json } from "@/integrations/supabase/types";
import { conditionFor } from "@/lib/taxonomy";
import { officialCardImage } from "@/lib/card-artwork";
import { confidentMatch } from "@/lib/catalog";

export const refreshItemPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string") throw new Error("Invalid id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { collectPrices, ebayConfigured } = await import("@/server/prices.server");
    const { data: item, error } = await context.supabase
      .from("items")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !item) throw new Error("Item not found");

    const sources = await collectPrices(item);
    let artwork: { official_image: string | null; catalog_id: string } | undefined;
    if (item.category === "cards" && !item.official_image) {
      const { catalogCardById, findCatalogCandidates } = await import("@/server/prices.server");
      const card = item.catalog_id ? await catalogCardById(item.catalog_id) : confidentMatch(await findCatalogCandidates(item));
      if (card) artwork = { official_image: officialCardImage(card), catalog_id: card.id };
    }
    const est = estimateValue(sources, conditionFor(item.category, item.condition).mult);
    const { error: upErr } = await context.supabase
      .from("items")
      .update({
        ...artwork,
        est_value: est?.est ?? null,
        price_low: est?.low ?? null,
        price_high: est?.high ?? null,
        price_sources: sources as unknown as Json,
        price_updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    if (est) {
      await context.supabase.from("price_history").insert({
        item_id: data.id,
        est_value: est.est,
        price_low: est.low,
        price_high: est.high,
      });
    }
    return { est, sources, ebayConfigured: ebayConfigured() };
  });

export const pricingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ebayConfigured, justtcgConfigured } = await import("@/server/prices.server");
    return { ebay: ebayConfigured(), justtcg: justtcgConfigured() };
  });
