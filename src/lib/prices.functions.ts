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
    if (item.category === "cards") {
      const { catalogCardById, findCatalogCandidates } = await import("@/server/prices.server");
      const card = item.catalog_id ? await catalogCardById(item.catalog_id) : confidentMatch(await findCatalogCandidates(item));
      if (card) {
        if (!item.official_image) artwork = { official_image: officialCardImage(card), catalog_id: card.id };
        // Keep the shared price table warm so searches and nightly refreshes are cheap.
        const variants = (card.variants ?? []).filter((v) => (v.price ?? 0) > 0);
        const nm =
          variants.find((v) => v.condition === "Near Mint" && !/reverse/i.test(v.printing ?? "")) ??
          variants.find((v) => v.condition === "Near Mint") ??
          variants[0];
        await context.supabase.from("catalog_prices").upsert({
          catalog_id: card.id,
          name: card.name,
          set_name: card.set_name ?? null,
          number: card.number ?? null,
          rarity: card.rarity ?? null,
          image: officialCardImage(card),
          variants,
          nm_price: nm?.price ?? null,
          updated_at: new Date().toISOString(),
        });
        if (nm?.price != null) {
          await context.supabase.from("catalog_price_history").upsert(
            { catalog_id: card.id, nm_price: nm.price } as never,
            { onConflict: "catalog_id,recorded_at", ignoreDuplicates: true },
          );
        }
        // First time we see this card: pull its 180-day price history too.
        const { seedCatalogHistory } = await import("@/server/prices.server");
        const withHistory = await catalogCardById(card.id, { history: true });
        if (withHistory) await seedCatalogHistory(context.supabase, withHistory);
      }
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

/** One-off: backfill 180-day price history for every catalog card that has none. */
export const backfillCatalogHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { catalogCardById, seedCatalogHistory } = await import("@/server/prices.server");
    const { data: cards } = await context.supabase.from("catalog_prices").select("catalog_id");
    let seeded = 0;
    let skipped = 0;
    for (const c of cards ?? []) {
      const card = await catalogCardById(c.catalog_id, { history: true });
      if (!card) {
        skipped++;
        continue;
      }
      const n = await seedCatalogHistory(context.supabase, card);
      if (n > 0) seeded++;
      else skipped++;
    }
    return { total: cards?.length ?? 0, seeded, skipped };
  });
