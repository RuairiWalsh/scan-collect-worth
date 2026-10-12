import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Identification = {
  is_collectible: boolean;
  category: "cards" | "stamps" | "coins";
  subcategory: string;
  line: string;
  name: string;
  set_name: string | null;
  number: string | null;
  year: string | null;
  variant: string | null;
  language?: string | null;
  grader: string | null;
  grade: string | null;
  confidence: number;
  printed_text?: string;
  catalog_id?: string | null;
  official_image?: string | null;
  product_image?: string | null;
  alternatives?: CardAlternative[];
  missing_info?: string[];
};

export type CardAlternative = { catalog_id: string; name: string; set_name: string | null; number: string | null; year: string | null };

export const identifyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { image: string; strip?: string | undefined; back?: string | undefined }) => {
    if (input.back !== undefined && (typeof input.back !== "string" || !input.back.startsWith("data:image/") || input.back.length > 3_000_000))
      throw new Error("Invalid image");
    if (input.strip !== undefined && (typeof input.strip !== "string" || !input.strip.startsWith("data:image/") || input.strip.length > 2_000_000))
      throw new Error("Invalid image");
    if (typeof input?.image !== "string" || !input.image.startsWith("data:image/"))
      throw new Error("Invalid image");
    if (input.image.length > 3_000_000) throw new Error("Image too large");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { identifyImage } = await import("@/server/identify.server");
    const result = await identifyImage(data.image, data.strip, data.back);
    if (result.ok) {
      const { coinMissingInfo } = await import("@/lib/coin-id");
      result.result.missing_info = coinMissingInfo(result.result);
    }
    if (result.ok && result.result.is_collectible && result.result.category === "cards") {
      const { cachedCardMagic } = await import("@/server/cardmagic.server");
      try {
        result.result.product_image = await cachedCardMagic(result.result, data.image, context.userId);
      } catch (error) {
        return { ...result, imageWarning: error instanceof Error ? error.message : "Product image unavailable; your scan is saved." };
      }
    }
    return { ...result, imageWarning: undefined };
  });
