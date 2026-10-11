import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cardVariants, type CardVariant } from "@/lib/card-pricing";

// Shared catalog tables are read-only for users; writes go through the server admin client.
const adminDb = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export type SearchResult = {
  catalog_id: string;
  name: string;
  set_name: string | null;
  number: string | null;
  rarity: string | null;
  image: string | null;
  nm_price: number | null;
  updated_at: string | null;
  price_provider?: string;
  price_status?: string;
  price_error?: string | null;
};

/** Card price lookup by name/number. Reads the shared price table first;
 *  on a miss, asks JustTCG and saves the results so the next search is free. */
export const searchCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => {
    if (typeof input?.q !== "string" || input.q.trim().length < 2) throw new Error("Query too short");
    return { q: input.q.trim() };
  })
  .handler(async ({ data, context }): Promise<{ results: SearchResult[]; source: "cache" | "live" }> => {
    const q = data.q;
    let query = context.supabase.from("catalog_prices").select("catalog_id,name,set_name,number,rarity,image,nm_price,updated_at,price_provider,price_status,price_error");
    for (const term of q.split(/\s+/)) {
      const safe = term.replace(/[%_,()."\\]/g, "");
      if (safe) query = query.or(`name.ilike.%${safe}%,set_name.ilike.%${safe}%,number.ilike.%${safe}%,card_metadata->>year.ilike.%${safe}%`);
    }
    const { data: cached } = await query
      .order("updated_at", { ascending: false })
      .limit(20);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = (cached ?? []).filter((c) => c.updated_at && Date.parse(c.updated_at) > dayAgo);
    const { catalogProductImages } = await import("@/server/cardmagic.server");
    const withProductImages = async (rows: SearchResult[]) => {
      const images = await catalogProductImages(context.supabase, rows.map(r => r.catalog_id));
      return rows.map(r => ({ ...r, image: images.get(r.catalog_id) ?? null }));
    };
    if (cached?.length) return { results: await withProductImages(cached), source: "cache" };

    // Miss (or stale): ask JustTCG and save what we find.
    const { jtSearch } = await import("@/server/prices.server");
    const { officialCardImage } = await import("@/lib/card-artwork");
    const { isSealedProduct } = await import("@/lib/catalog");
    const cards = (await jtSearch(q)).filter((c) => !isSealedProduct(c)).slice(0, 20);
    const results: SearchResult[] = [];
    for (const card of cards) {
      const variants = cardVariants(card.variants);
      const nm =
        variants.find((v) => v.condition === "Near Mint" && !/reverse/i.test(v.printing ?? "")) ??
        variants.find((v) => v.condition === "Near Mint") ??
        variants[0];
      const row = {
        catalog_id: card.id,
        name: card.name,
        set_name: card.set_name ?? null,
        number: card.number ?? null,
        rarity: card.rarity ?? null,
        image: officialCardImage(card),
        variants,
        nm_price: nm?.price ?? null,
        updated_at: new Date().toISOString(),
      };
      results.push({
        catalog_id: row.catalog_id,
        name: row.name,
        set_name: row.set_name,
        number: row.number,
        rarity: row.rarity,
        image: row.image,
        nm_price: row.nm_price,
        updated_at: row.updated_at,
      });
      await (await adminDb()).from("catalog_prices").upsert(row);
      if (row.nm_price != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client upsert hits TS2589
        await ((await adminDb()) as any).from("catalog_price_history").upsert(
          { catalog_id: row.catalog_id, nm_price: row.nm_price },
          { onConflict: "catalog_id,recorded_at", ignoreDuplicates: true },
        );
      }
      // First time we see this card: pull its 180-day price history too.
      const { catalogCardById, seedCatalogHistory } = await import("@/server/prices.server");
      const withHistory = await catalogCardById(card.id, { history: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client hits TS2589
      if (withHistory) await seedCatalogHistory((await adminDb()) as any, withHistory);
    }
    // Prefer fresh cache rows merged with live ones, deduped by catalog_id.
    const seen = new Set<string>();
    const merged = [...results, ...(cached ?? [])].filter((r) => {
      if (seen.has(r.catalog_id)) return false;
      seen.add(r.catalog_id);
      return true;
    });
    return { results: await withProductImages(merged.slice(0, 20)), source: "live" };
  });

export type CatalogHistoryPoint = { recorded_at: string; nm_price: number | null };

/** Price history for a shared catalog card (near-mint price over time). */
export const catalogPriceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { catalog_id: string }) => {
    if (typeof input?.catalog_id !== "string" || !input.catalog_id) throw new Error("Invalid catalog id");
    return { catalog_id: input.catalog_id };
  })
  .handler(async ({ data, context }): Promise<{ history: CatalogHistoryPoint[] }> => {
    const { data: rows } = await context.supabase
      .from("catalog_price_history")
      .select("recorded_at, nm_price")
      .eq("catalog_id", data.catalog_id)
      .order("recorded_at", { ascending: true })
      .limit(365);
    return { history: rows ?? [] };
  });

/** Full card view: shared catalog row + price history (loads 180 days on first view). */
export const catalogCardDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { catalog_id: string }) => {
    if (typeof input?.catalog_id !== "string" || !input.catalog_id) throw new Error("Invalid catalog id");
    return { catalog_id: input.catalog_id };
  })
  .handler(async ({ data, context }): Promise<{ card: (SearchResult & { variants: CardVariant[] }) | null; history: CatalogHistoryPoint[] }> => {
    const load = () =>
      context.supabase
        .from("catalog_price_history")
        .select("recorded_at, nm_price")
        .eq("catalog_id", data.catalog_id)
        .order("recorded_at", { ascending: true })
        .limit(1000);
    const { data: card } = await context.supabase
      .from("catalog_prices")
      .select("catalog_id, name, set_name, number, rarity, image, nm_price, updated_at, variants,price_provider,price_status,price_error")
      .eq("catalog_id", data.catalog_id)
      .maybeSingle();
    let { data: rows } = await load();
    if (card && card.price_provider === "justtcg" && !data.catalog_id.startsWith("lymitz-") && (rows?.length ?? 0) < 100) {
      const { catalogCardById, seedCatalogHistory } = await import("@/server/prices.server");
      const full = await catalogCardById(data.catalog_id, { history: true });
      if (full) {
        const db = (await adminDb()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const n = await seedCatalogHistory(db, full);
        if (n > 0) ({ data: rows } = await load());
      }
    }
    const { catalogProductImages } = await import("@/server/cardmagic.server");
    const images = await catalogProductImages(context.supabase, [data.catalog_id]);
    return { card: card ? { ...card, image: images.get(data.catalog_id) ?? null, variants: cardVariants(card.variants) } : null, history: rows ?? [] };
  });
