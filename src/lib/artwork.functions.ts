import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { officialCardImage } from "@/lib/card-artwork";

export const syncOfficialImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input?.ids) || input.ids.length > 50 || input.ids.some((id) => typeof id !== "string")) throw new Error("Invalid items");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (!data.ids.length) return;
    const { data: items, error } = await context.supabase.from("items").select("id,catalog_id,name,set_name,number,year")
      .in("id", data.ids).eq("category", "cards").is("official_image", null);
    if (error) throw new Error(error.message);
    const { catalogCardById } = await import("@/server/prices.server");
    const { cardsightConfigured, cardsightArtwork } = await import("@/server/cardsight.server");
    const useCardsight = cardsightConfigured();
    await Promise.all((items ?? []).map(async (item) => {
      let image: string | null = null;
      if (item.catalog_id) {
        const card = await catalogCardById(item.catalog_id);
        image = card ? officialCardImage(card) : null;
      }
      // Sports / non-TCG cards have no JustTCG entry — try CardSight's catalog.
      if (!image && useCardsight) image = await cardsightArtwork(item).catch(() => null);
      if (!image) return;
      const { error } = await context.supabase.from("items").update({ official_image: image }).eq("id", item.id).is("official_image", null);
      if (error) throw new Error(error.message);
    }));
  });