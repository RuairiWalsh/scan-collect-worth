import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateValue } from "@/lib/pricing";
import type { Json } from "@/integrations/supabase/types";
import { conditionFor } from "@/lib/taxonomy";

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
    const est = estimateValue(sources, conditionFor(item.category, item.condition).mult);
    const { error: upErr } = await context.supabase
      .from("items")
      .update({
        est_value: est?.est ?? null,
        price_low: est?.low ?? null,
        price_high: est?.high ?? null,
        price_sources: sources as unknown as Json,
        price_updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { est, sources, ebayConfigured: ebayConfigured() };
  });

export const pricingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ebayConfigured, justtcgConfigured } = await import("@/server/prices.server");
    return { ebay: ebayConfigured(), justtcg: justtcgConfigured() };
  });
