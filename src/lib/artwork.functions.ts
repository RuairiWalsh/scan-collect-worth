import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncOfficialImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input?.ids) || input.ids.length > 50 || input.ids.some((id) => typeof id !== "string")) throw new Error("Invalid items");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (!data.ids.length) return;
    const { data: items, error } = await context.supabase.from("items").select("id,catalog_id,name,set_name,number,year,subcategory,line,variant,thumbnail,product_image")
      .in("id", data.ids).eq("category", "cards").eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const { cachedCardMagic, cachedTcgGraphImages } = await import("@/server/cardmagic.server");
    // Upgrade any card whose catalog entry has official TCG Graph artwork, even if a
    // CardMagic image was saved before the artwork existed.
    const catalogIds = [...new Set((items ?? []).map((item) => item.catalog_id).filter((id): id is string => !!id))];
    const tcgImages = await cachedTcgGraphImages(catalogIds).catch(() => new Map<string, string>());
    for (const item of items ?? []) {
      const tcg = item.catalog_id ? tcgImages.get(item.catalog_id) : undefined;
      if (!tcg || item.product_image === tcg) continue;
      const { error } = await context.supabase.from("items").update({ product_image: tcg }).eq("id", item.id).eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      item.product_image = tcg;
    }
    for (const item of items ?? []) {
      if (item.product_image || !item.thumbnail) continue;
      const image = await cachedCardMagic(item, item.thumbnail, context.userId);
      if (!image) continue;
      const { error } = await context.supabase.from("items").update({ product_image: image }).eq("id", item.id).eq("user_id", context.userId).is("product_image", null);
      if (error) throw new Error(error.message);
    }
  });
