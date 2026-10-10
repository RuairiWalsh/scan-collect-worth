import { createServerFn } from "@tanstack/react-start";

export interface TickerCard {
  name: string;
  setName: string | null;
  number: string | null;
  price: number;
}

/** Deterministic daily shuffle so every visitor sees the same 20 cards that day. */
function dailyShuffle<T>(rows: T[], seed: number): T[] {
  const out = [...rows];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 20 random priced cards from the shared catalog price table, re-picked each day. */
export const tickerCards = createServerFn({ method: "GET" }).handler(async (): Promise<TickerCard[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("catalog_prices")
    .select("name,set_name,number,nm_price")
    .not("nm_price", "is", null)
    .order("catalog_id")
    .limit(1000);
  if (error || !data) return [];
  const daySeed = Math.floor(Date.now() / 86400000);
  return dailyShuffle(data, daySeed)
    .slice(0, 20)
    .map((r) => ({
      name: r.name as string,
      setName: (r.set_name as string | null) ?? null,
      number: (r.number as string | null) ?? null,
      price: Number(r.nm_price),
    }));
});
