import { createServerFn } from "@tanstack/react-start";

export interface TickerCard {
  name: string;
  setName: string | null;
  number: string | null;
  price: number;
}

/** Top-priced cards from the shared catalog price table, for the landing-page ticker. */
export const tickerCards = createServerFn({ method: "GET" }).handler(async (): Promise<TickerCard[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("catalog_prices")
    .select("name,set_name,number,nm_price")
    .not("nm_price", "is", null)
    .order("nm_price", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((r) => ({
    name: r.name as string,
    setName: (r.set_name as string | null) ?? null,
    number: (r.number as string | null) ?? null,
    price: Number(r.nm_price),
  }));
});
