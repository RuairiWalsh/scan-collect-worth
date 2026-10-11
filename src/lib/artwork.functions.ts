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
    const { data: items, error } = await context.supabase.from("items").select("id,catalog_id,name,set_name,number,year,subcategory,line,variant,thumbnail")
      .in("id", data.ids).eq("category", "cards").eq("user_id", context.userId).is("product_image", null);
    if (error) throw new Error(error.message);
    const { cachedCardMagic } = await import("@/server/cardmagic.server");
    for (const item of items ?? []) {
      if (!item.thumbnail) continue;
      const image = await cachedCardMagic(item, item.thumbnail);
      if (!image) continue;
      const { error } = await context.supabase.from("items").update({ product_image: image }).eq("id", item.id).eq("user_id", context.userId).is("product_image", null);
      if (error) throw new Error(error.message);
    }
  });