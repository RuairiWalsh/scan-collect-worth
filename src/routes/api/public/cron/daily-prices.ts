import { createFileRoute } from "@tanstack/react-router";

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
        const ids = [...new Set((rows ?? []).map((r) => r.catalog_id as string))];

        let updated = 0;
        let failed = 0;
        for (const id of ids) {
          try {
            const card = await catalogCardById(id);
            if (!card) {
              failed++;
              continue;
            }
            const variants = (card.variants ?? []).filter((v) => (v.price ?? 0) > 0);
            const nm =
              variants.find((v) => v.condition === "Near Mint" && !/reverse/i.test(v.printing ?? "")) ??
              variants.find((v) => v.condition === "Near Mint") ??
              variants[0];
            const { officialCardImage } = await import("@/lib/card-artwork");
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
                  .insert({ catalog_id: card.id, nm_price: nm.price });
              }
            }
          } catch {
            failed++;
          }
        }

        // Re-value every pinned item from the fresh shared prices.
        const { data: items } = await supabaseAdmin
          .from("items")
          .select("id, user_id, category, condition, catalog_id")
          .not("catalog_id", "is", null);
        const { data: prices } = await supabaseAdmin.from("catalog_prices").select("catalog_id, nm_price");
        const priceById = new Map((prices ?? []).map((p) => [p.catalog_id, p.nm_price]));
        const { conditionFor } = await import("@/lib/taxonomy");
        let revalued = 0;
        for (const item of items ?? []) {
          const nm = priceById.get(item.catalog_id!);
          if (!nm) continue;
          const mult = conditionFor(item.category, item.condition).mult;
          const est = Math.round(nm * mult * 100) / 100;
          const { error: itemErr } = await supabaseAdmin
            .from("items")
            .update({ est_value: est, price_updated_at: new Date().toISOString() })
            .eq("id", item.id);
          if (!itemErr) {
            revalued++;
            await supabaseAdmin.from("price_history").insert({
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
