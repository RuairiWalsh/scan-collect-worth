import { createFileRoute } from "@tanstack/react-router";
import { dailyCatalogIds } from "@/lib/featured-card";

// Nightly job: refresh the shared catalog_prices table for every catalog card
// anyone owns, then update each owned item's saved value from the fresh price.
// One JustTCG lookup per unique card, no matter how many users own it.
export const Route = createFileRoute("/api/public/cron/daily-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("app_config")
          .select("value")
          .eq("key", "cron_secret")
          .single();
        if (!cfg?.value || auth !== `Bearer ${cfg.value}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { catalogCardById, justtcgConfigured } = await import("@/server/prices.server");
        if (!justtcgConfigured()) return Response.json({ ok: false, reason: "justtcg not configured" });

        // Distinct catalog cards currently owned or batched by any user.
        const { data: rows, error } = await supabaseAdmin
          .from("items")
          .select("catalog_id")
          .not("catalog_id", "is", null);
        if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
        const ids = dailyCatalogIds((rows ?? []).map((r) => r.catalog_id as string));

        let updated = 0;
        let failed = 0;
        const { seedCatalogHistory, nmVariantOf, catalogCardsByIds } = await import("@/server/prices.server");
        const { cardVariants } = await import("@/lib/card-pricing");
        const { officialCardImage } = await import("@/lib/card-artwork");

        // Cards with no history yet get a per-card 180-day backfill fetch.
        const { data: histRows } = await supabaseAdmin
          .from("catalog_price_history")
          .select("catalog_id")
          .in("catalog_id", ids.length ? ids : ["__none__"]);
        const hasHistory = new Set((histRows ?? []).map((r) => r.catalog_id as string));
        const needsHistory = ids.filter((id) => !hasHistory.has(id));

        // Current prices for every owned card in a handful of batched requests
        // (up to 200 cards per call) instead of one request per card.
        const cards = await catalogCardsByIds(ids);
        const byId = new Map(cards.map((c) => [c.id, c]));

        // Backfill history for the (rare) cards that don't have any yet.
        for (const id of needsHistory) {
          try {
            const card = await catalogCardById(id, { history: true });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client hits TS2589
            if (card) await seedCatalogHistory(supabaseAdmin as any, card);
          } catch {
            // history backfill is best-effort; tonight's price still updates
          }
        }

        for (const id of ids) {
          try {
            const card = byId.get(id);
            if (!card) {
              failed++;
              continue;
            }
            const variants = cardVariants(card.variants);
            const nm = nmVariantOf(card);
            const { error: upErr } = await supabaseAdmin.from("catalog_prices").upsert({
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
            if (upErr) failed++;
            else {
              updated++;
              if (nm?.price != null) {
                await supabaseAdmin
                  .from("catalog_price_history")
                  .upsert(
                    { catalog_id: card.id, nm_price: nm.price },
                    { onConflict: "catalog_id,recorded_at", ignoreDuplicates: true },
                  );
              }
            }
          } catch {
            failed++;
          }
        }

        // Re-value every pinned item from the fresh shared prices.
        const { data: items } = await supabaseAdmin
          .from("items")
          .select("id, user_id, category, condition, variant, catalog_id")
          .not("catalog_id", "is", null);
        const { data: prices } = await supabaseAdmin.from("catalog_prices").select("catalog_id, variants, updated_at");
        const priceById = new Map((prices ?? []).map((p) => [p.catalog_id, p]));
        const { cardPriceSources } = await import("@/lib/card-pricing");
        const { estimateValue } = await import("@/lib/pricing");
        let revalued = 0;
        for (const item of items ?? []) {
          if (!item.catalog_id || item.category !== "cards") continue;
          const cached = priceById.get(item.catalog_id);
          if (!cached) continue;
          const sources = cardPriceSources(cardVariants(cached.variants), item.condition, item.variant);
          const estimate = estimateValue(sources, 1);
          const est = estimate?.est ?? null;
          const { error: itemErr } = await supabaseAdmin
            .from("items")
            .update({ est_value: est, price_low: estimate?.low ?? null, price_high: estimate?.high ?? null, price_sources: sources, price_updated_at: cached.updated_at })
            .eq("id", item.id);
          if (!itemErr) {
            revalued++;
            if (est != null) await supabaseAdmin.from("price_history").insert({
              item_id: item.id,
              user_id: item.user_id,
              est_value: est,
            });
          }
        }

        return Response.json({ ok: true, cards: ids.length, updated, failed, revalued });
      },
    },
  },
});
