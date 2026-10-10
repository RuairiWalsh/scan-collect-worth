// Server-only: identify a collectible photo, then pin it to an exact catalog card.
import type { Identification } from "@/lib/scan.functions";
import { identificationSchema as schema } from "@/lib/scan-schema";
import { officialCardImage } from "@/lib/card-artwork";

export async function identifyImage(image: string) {
  const data = { image };
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
      effort: "low",
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
          result.official_image = officialCardImage(card);
          result.confidence = Math.max(result.confidence, 0.85);
        }
      }
    }
    return { ok: true as const, result };
  } catch (e) {
    if (e instanceof AiError) return { ok: false as const, error: e.message, status: e.status };
    throw e;
  }
}
