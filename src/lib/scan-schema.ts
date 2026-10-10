const nullableStr = { type: ["string", "null"] };

export const identificationSchema = {
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

