import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SalesPoint } from "@/lib/cardsight-pricing";

/** Dated sales history for a matched sports card the caller owns (last 12 months). */
export const sportsSalesHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ itemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ points: SalesPoint[] }> => {
    try {
      const { data: item } = await context.supabase.from("items")
        .select("catalog_id, subcategory, condition, variant, grader, grade").eq("id", data.itemId).maybeSingle();
      if (!item?.catalog_id || item.subcategory !== "sports") return { points: [] };
      const { cardsightGetPricing } = await import("@/server/cardsight.server");
      const { cardsightSalesSeries } = await import("@/lib/cardsight-pricing");
      const pricing = await cardsightGetPricing(item.catalog_id, "1y");
      return { points: pricing ? cardsightSalesSeries(pricing, item) : [] };
    } catch {
      return { points: [] };
    }
  });
