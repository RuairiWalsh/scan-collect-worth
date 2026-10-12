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
        .select("id, name, set_name, number, year, catalog_id, subcategory, condition, variant, grader, grade").eq("id", data.itemId).maybeSingle();
      if (!item || item.subcategory !== "sports") return { points: [] };
      const { cardsightGetPricing, pinSportsCatalogCard } = await import("@/server/cardsight.server");
      // Hand-entered details: pin the exact catalog card first so the chart has real sales.
      const catalogId = await pinSportsCatalogCard(context.supabase, item);
      if (!catalogId) return { points: [] };
      const { cardsightSalesSeries } = await import("@/lib/cardsight-pricing");
      const pricing = await cardsightGetPricing(catalogId, "1y");
      return { points: pricing ? cardsightSalesSeries(pricing, item) : [] };
    } catch {
      return { points: [] };
    }
  });
