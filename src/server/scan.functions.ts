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
  grader: string | null;
  grade: string | null;
  confidence: number;
};

const nullableStr = { type: ["string", "null"] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_collectible", "category", "subcategory", "line", "name", "set_name",
    "number", "year", "variant", "grader", "grade", "confidence",
  ],
  properties: {
    is_collectible: { type: "boolean" },
    category: { type: "string", enum: ["cards", "stamps", "coins"] },
    subcategory: {
      type: "string",
      enum: ["tcg", "sports", "nonsport", "us", "world", "bullion"],
      description: "cards: tcg|sports|nonsport. stamps: us|world. coins: us|world|bullion.",
    },
    line: {
      type: "string",
      description:
        "Product line, e.g. Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Lorcana, Baseball, Basketball, Football, Hockey, Soccer, Commemorative, Quarters, Silver…",
    },
    name: { type: "string", description: "Card/player name, stamp title, or coin name" },
    set_name: { ...nullableStr, description: "Set, series, or brand (e.g. Base Set, 2018 Topps Chrome)" },
    number: { ...nullableStr, description: "Collector number, catalog number (Scott #), or null" },
    year: nullableStr,
    variant: { ...nullableStr, description: "Holo, Refractor, parallel, mint mark, error, etc." },
    grader: { ...nullableStr, description: "PSA, BGS, CGC, SGC, PCGS, NGC if slabbed, else null" },
    grade: { ...nullableStr, description: "Numeric grade on the slab label, else null" },
    confidence: { type: "number", description: "0-1 confidence in the identification" },
  },
};

export const identifyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { image: string }) => {
    if (typeof input?.image !== "string" || !input.image.startsWith("data:image/"))
      throw new Error("Invalid image");
    if (input.image.length > 3_000_000) throw new Error("Image too large");
    return input;
  })
  .handler(async ({ data }) => {
    const { streamJson, AiError } = await import("./ai.server");
    try {
      const result = await streamJson<Identification>({
        instructions:
          "You are an expert appraiser of trading cards, sports cards, stamps and coins. Identify the single main collectible in the photo as precisely as possible, reading any visible text (names, set symbols, collector numbers, years, slab labels, mint marks). If unsure, give your best guess with lower confidence.",
        content: [
          { type: "input_text", text: "Identify this collectible." },
          { type: "input_image", image_url: data.image },
        ],
        schemaName: "identification",
        schema,
      });
      return { ok: true as const, result };
    } catch (e) {
      if (e instanceof AiError) return { ok: false as const, error: e.message, status: e.status };
      throw e;
    }
  });
