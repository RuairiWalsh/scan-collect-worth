import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SearchResult = {
  catalog_id: string;
  name: string;
  set_name: string | null;
  number: string | null;
  rarity: string | null;
  image: string | null;
  nm_price: number | null;
  updated_at: string | null;
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
    const { data: cached } = await context.supabase
      .from("catalog_prices")
      .select("catalog_id, name, set_name, number, rarity, image, nm_price, updated_at")
      .ilike("name", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(20);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = (cached ?? []).filter((c) => c.updated_at && Date.parse(c.updated_at) > dayAgo);
    if (fresh.length >= 3) return { results: fresh, source: "cache" };

    // Miss (or stale): ask JustTCG and save what we find.
    const { jtSearch } = await import("@/server/prices.server");
    const { officialCardImage } = await import("@/lib/card-artwork");
    const { isSealedProduct } = await import("@/lib/catalog");
    const cards = (await jtSearch(q)).filter((c) => !isSealedProduct(c)).slice(0, 20);
    const results: SearchResult[] = [];
    for (const card of cards) {
      const variants = (card.variants ?? []).filter((v) => (v.price ?? 0) > 0);
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
      await context.supabase.from("catalog_prices").upsert(row);
    }
    // Prefer fresh cache rows merged with live ones, deduped by catalog_id.
    const seen = new Set<string>();
    const merged = [...results, ...(cached ?? [])].filter((r) => {
      if (seen.has(r.catalog_id)) return false;
      seen.add(r.catalog_id);
      return true;
    });
    return { results: merged.slice(0, 20), source: "live" };
  });
