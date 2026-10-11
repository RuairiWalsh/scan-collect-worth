import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_CARD_ID, featuredCardPrice } from "./featured-card";

export const featuredCard = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) return null;
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
  const { data, error } = await db.from("catalog_prices")
    .select("catalog_id,name,set_name,number,updated_at,variants")
    .eq("catalog_id", FEATURED_CARD_ID).maybeSingle();
  if (error || !data) return null;
  return { name: String(data.name), setName: String(data.set_name), price: featuredCardPrice(data.variants), updatedAt: data.updated_at as string | null };
});