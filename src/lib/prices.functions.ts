import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Shared catalog tables are read-only for users; writes go through the server admin client.
const adminDb = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
import { estimateValue } from "@/lib/pricing";
import type { Json } from "@/integrations/supabase/types";
import { conditionFor } from "@/lib/taxonomy";
import { officialCardImage } from "@/lib/card-artwork";
import { confidentMatch } from "@/lib/catalog";
import { cardPriceSources, cardVariants } from "@/lib/card-pricing";

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

    // Editing quality/printing uses the shared variants, with no provider request.
    const { data: cached } = item.category === "cards" && item.catalog_id
      ? await context.supabase.from("catalog_prices").select("variants, updated_at").eq("catalog_id", item.catalog_id).maybeSingle()
      : { data: null };
    const hasCache = cached && cardVariants(cached.variants).length > 0;
    const sources = hasCache
      ? cardPriceSources(cardVariants(cached.variants), item.condition, item.variant)
      : await collectPrices(item);
    let artwork: { official_image: string | null; catalog_id: string } | undefined;
    if (item.category === "cards" && !hasCache) {
      const { catalogCardById, findCatalogCandidates } = await import("@/server/prices.server");
      const card = item.catalog_id ? await catalogCardById(item.catalog_id) : confidentMatch(await findCatalogCandidates(item));
      if (card) {
        if (!item.official_image) artwork = { official_image: officialCardImage(card), catalog_id: card.id };
        // Keep the shared price table warm so searches and nightly refreshes are cheap.
        const variants = cardVariants(card.variants);
        const nm =
          variants.find((v) => v.condition === "Near Mint" && !/reverse/i.test(v.printing ?? "")) ??
          variants.find((v) => v.condition === "Near Mint") ??
          variants[0];
        await (await adminDb()).from("catalog_prices").upsert({
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client upsert hits TS2589
          await ((await adminDb()) as any).from("catalog_price_history").upsert(
            { catalog_id: card.id, nm_price: nm.price },
            { onConflict: "catalog_id,recorded_at", ignoreDuplicates: true },
          );
        }
        // First time we see this card: pull its 180-day price history too.
        const { seedCatalogHistory } = await import("@/server/prices.server");
        const withHistory = await catalogCardById(card.id, { history: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client hits TS2589
        if (withHistory) await seedCatalogHistory((await adminDb()) as any, withHistory);
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
        price_updated_at: hasCache ? cached.updated_at : new Date().toISOString(),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client hits TS2589
      const n = await seedCatalogHistory((await adminDb()) as any, card);
      if (n > 0) seeded++;
      else skipped++;
    }
    return { total: cards?.length ?? 0, seeded, skipped };
  });
