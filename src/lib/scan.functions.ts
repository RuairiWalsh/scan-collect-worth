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
  printed_text?: string;
  catalog_id?: string | null;
};

const nullableStr = { type: ["string", "null"] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "printed_text", "is_collectible", "category", "subcategory", "line", "name", "set_name",
    "number", "year", "variant", "grader", "grade", "confidence",
  ],
  properties: {
    printed_text: {
      type: "string",
      description:
        "Transcribe the key printed text exactly as seen BEFORE identifying: card/player name, collector number with set total (e.g. 025/165), set code (e.g. LOB-EN001, OP01-001, SV2a), rarity mark, copyright line/year, slab label. Write 'unreadable' for parts you can't read.",
    },
    is_collectible: {
      type: "boolean",
      description: "true only for a single card, stamp or coin. false for boxes, packs, tins, binders, empty sleeves, or no item.",
    },
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
    const { streamJson, AiError } = await import("@/server/ai.server");
    try {
      const result = await streamJson<Identification>({
        instructions: [
          "You are an expert grader and identifier of trading cards, sports cards, stamps and coins.",
          "Identify the ONE item in the centre of the photo. Ignore hands, tables, sleeves and anything at the edges.",
          "First transcribe the printed text, then base the identification on that text — never on artwork alone.",
          "Pokémon: name top-left; collector number like 025/165 at the bottom left or right; the set is defined by that number + set symbol, not by the artwork.",
          "Magic: collector number and 3-letter set code bottom-left. Yu-Gi-Oh!: set code like LOB-EN001 under the artwork, right side. One Piece/Lorcana/Digimon: code bottom-right.",
          "Sports: player name, brand (Topps, Panini, Upper Deck…), year from the copyright line, card number on the back or corner.",
          "Copy the number exactly as printed into `number` (keep leading zeros and the /total). If you can't read it, use null — do not guess numbers.",
          "If it's packaging (box, pack, tin) rather than a single card, set is_collectible false.",
          "Use confidence below 0.5 when the text is unreadable.",
        ].join("\n"),
        content: [
          { type: "input_text", text: "Identify this collectible." },
          { type: "input_image", image_url: data.image, detail: "high" },
        ],
        schemaName: "identification",
        schema,
        effort: "medium",
      });

      if (result.is_collectible && result.category === "cards") {
        const { justtcgConfigured, findCatalogCandidates } = await import("@/server/prices.server");
        if (justtcgConfigured()) {
          const { confidentMatch, baseName } = await import("@/lib/catalog");
          const ranked = await findCatalogCandidates(result);
          let card = confidentMatch(ranked);
          // Several plausible printings → let the AI compare them against the photo.
          const shortlist = ranked.filter((r) => r.score > 0).slice(0, 12);
          if (!card && shortlist.length > 1) {
            const pick = await streamJson<{ index: number }>({
              instructions:
                "You match a photographed trading card to an exact catalog entry. Compare the printed collector number, set total, set symbol and name. Answer -1 if none clearly match.",
              content: [
                {
                  type: "input_text",
                  text:
                    `Printed text read earlier: ${result.printed_text ?? ""}\nCandidates:\n` +
                    shortlist
                      .map((r, i) => `${i}. ${r.card.name} | set: ${r.card.set_name ?? "?"} | number: ${r.card.number ?? "?"} | rarity: ${r.card.rarity ?? "?"}`)
                      .join("\n"),
                },
                { type: "input_image", image_url: data.image, detail: "high" },
              ],
              schemaName: "catalog_pick",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["index"],
                properties: { index: { type: "integer", description: "Candidate index, or -1" } },
              },
            }).catch(() => ({ index: -1 }));
            card = shortlist[pick.index]?.card ?? null;
          } else if (!card && shortlist.length === 1 && shortlist[0]!.score >= 5) {
            card = shortlist[0]!.card;
          }
          if (card) {
            result.name = baseName(card.name) || result.name;
            result.set_name = card.set_name ?? result.set_name;
            result.number = card.number ?? result.number;
            result.catalog_id = card.id;
            result.confidence = Math.max(result.confidence, 0.85);
          }
        }
      }
      return { ok: true as const, result };
    } catch (e) {
      if (e instanceof AiError) return { ok: false as const, error: e.message, status: e.status };
      throw e;
    }
  });
