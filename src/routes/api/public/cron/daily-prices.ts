import { createFileRoute } from "@tanstack/react-router";
import { dailyCatalogIds } from "@/lib/featured-card";
import { dailyTrackedIds, isCardsightId, isLocalCatalogId } from "@/lib/imported-catalog";

export const Route = createFileRoute("/api/public/cron/daily-prices")({
  server: { handlers: { POST: async ({ request }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await db.from("app_config").select("value").eq("key", "cron_secret").single();
    if (!cfg?.value || request.headers.get("authorization") !== `Bearer ${cfg.value}`) return new Response("Unauthorized", { status: 401 });
    const { catalogCardsByIds, nmVariantOf } = await import("@/server/prices.server");
    const { cardVariants, cardPriceSources } = await import("@/lib/card-pricing");
    const { estimateValue } = await import("@/lib/pricing");
    const { refreshTrackedRow } = await import("@/server/imported-prices.server");
    const { cardsightBulkPricing } = await import("@/server/cardsight.server");
    const owned: { catalog_id: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("items").select("catalog_id").not("catalog_id", "is", null).order("id").range(offset, offset + 999);
      if (error) return Response.json({ ok: false, reason: "Could not load tracked cards" }, { status: 500 });
      owned.push(...data);
      if (data.length < 1000) break;
    }
    const catalog = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("catalog_prices").select("*").order("catalog_id").range(offset, offset + 999);
      if (error) return Response.json({ ok: false, reason: "Could not load catalog" }, { status: 500 });
      catalog.push(...data);
      if (data.length < 1000) break;
    }
    const ids = dailyTrackedIds(owned.flatMap(r => r.catalog_id ? [r.catalog_id] : []), catalog.filter(r => r.imported_card).map(r => r.catalog_id), dailyCatalogIds([]));
    const byId = new Map(catalog.map(r => [r.catalog_id, r]));
    const special = ids.filter(id => (byId.has(id) && byId.get(id)?.price_provider !== "justtcg") || isLocalCatalogId(id) || isCardsightId(id));
    const jtIds = ids.filter(id => !special.includes(id));
    let updated = 0, failed = 0;
    const freshIds = new Set<string>();
    // JustTCG requests use provider IDs only; local identities are handled separately.
    const cards = await catalogCardsByIds(jtIds);
    for (const card of cards) {
      const at = new Date().toISOString();
      const nm = nmVariantOf(card);
      const { error } = await db.from("catalog_prices").upsert({ catalog_id: card.id, name: card.name, set_name: card.set_name ?? null, number: card.number ?? null, rarity: card.rarity ?? null, image: null, variants: cardVariants(card.variants), nm_price: nm?.price ?? null, price_status: "ready", price_error: null, price_checked_at: at, updated_at: at });
      if (error) failed++;
      else { updated++; freshIds.add(card.id); if (nm?.price != null) await db.from("catalog_price_history").upsert({ catalog_id: card.id, nm_price: nm.price, recorded_at: at }, { onConflict: "catalog_id,recorded_at", ignoreDuplicates: true }); }
    }
    failed += jtIds.length - cards.length;
    // Up to 100 sports cards per provider request. Failure never clears saved prices.
    const sports = special.flatMap(id => { const r = byId.get(id); return r?.price_provider === "cardsight" && r.provider_card_id ? [r.provider_card_id] : []; });
    let bulk = new Map<string, import("@/lib/cardsight-pricing").CardsightPricing>();
    let bulkFailed = false;
    try { bulk = await cardsightBulkPricing([...new Set(sports)]); } catch { bulkFailed = true; }
    for (const id of special) {
      const row = byId.get(id);
      if (!row) { failed++; continue; }
      if (row.price_provider === "cardsight" && row.provider_card_id && (!bulk.has(row.provider_card_id) || bulkFailed)) {
        await db.from("catalog_prices").update({ price_status: "failed", price_error: "CardSight daily pricing unavailable; previous price preserved.", price_checked_at: new Date().toISOString() }).eq("catalog_id", id);
        failed++; continue;
      }
      const ok = await refreshTrackedRow(row, row.provider_card_id ? bulk.get(row.provider_card_id) : undefined);
      if (ok) { updated++; freshIds.add(id); } else failed++;
    }
    let revalued = 0;
    for (let offset = 0; ; offset += 500) {
      const { data: items, error } = await db.from("items").select("id,user_id,category,condition,variant,grader,grade,catalog_id").not("catalog_id", "is", null).order("id").range(offset, offset + 499);
      if (error || !items) return Response.json({ ok: false, updated, failed, reason: "Item revaluation unavailable" }, { status: 500 });
      const pageIds = [...new Set(items.flatMap(i => i.catalog_id ? [i.catalog_id] : []))];
      const { data: prices } = await db.from("catalog_prices").select("catalog_id,variants,updated_at").in("catalog_id", pageIds.length ? pageIds : ["__none__"]);
      const pricesById = new Map((prices ?? []).map(r => [r.catalog_id, r]));
      for (const item of items) {
        if (!item.catalog_id || item.category !== "cards" || !freshIds.has(item.catalog_id)) continue;
        const cached = pricesById.get(item.catalog_id);
        if (!cached) continue;
        const sources = cardPriceSources(cardVariants(cached.variants), item.condition, item.variant, item.grader, item.grade);
        const est = estimateValue(sources, 1);
        const { error: saveError } = await db.from("items").update({ est_value: est?.est ?? null, price_low: est?.low ?? null, price_high: est?.high ?? null, price_sources: sources, price_updated_at: cached.updated_at }).eq("id", item.id);
        if (!saveError) { revalued++; if (est) await db.from("price_history").insert({ item_id: item.id, user_id: item.user_id, est_value: est.est }); }
      }
      if (items.length < 500) break;
    }
    return Response.json({ ok: true, cards: ids.length, updated, failed, revalued });
  } } },
});
