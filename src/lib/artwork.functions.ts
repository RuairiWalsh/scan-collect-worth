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
    const { data: items, error } = await context.supabase.from("items").select("id,catalog_id")
      .in("id", data.ids).eq("category", "cards").is("official_image", null);
    if (error) throw new Error(error.message);
    const { catalogCardById } = await import("@/server/prices.server");
    await Promise.all((items ?? []).map(async (item) => {
      if (!item.catalog_id) return;
      const card = await catalogCardById(item.catalog_id);
      const image = card ? officialCardImage(card) : null;
      if (!image) return;
      const { error } = await context.supabase.from("items").update({ official_image: image }).eq("id", item.id).eq("catalog_id", item.catalog_id);
      if (error) throw new Error(error.message);
    }));
  });