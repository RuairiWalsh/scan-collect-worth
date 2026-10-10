// Server-only: identify a collectible photo, then pin it to an exact catalog card.
import type { Identification } from "@/lib/scan.functions";
import { identificationSchema as schema } from "@/lib/scan-schema";
import { officialCardImage } from "@/lib/card-artwork";

export async function identifyImage(image: string, strip?: string) {
  const stripInput = strip ? [{ type: "input_text", text: "Zoomed view of the bottom of the same card (collector number / set code):" }, { type: "input_image", image_url: strip, detail: "high" }] : [];
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
        ...stripInput,
      ],
      schemaName: "identification",
      schema,
      effort: "low",
    });

    if (result.is_collectible && result.category === "cards") {
      const { justtcgConfigured, findCatalogCandidates } = await import("@/server/prices.server");
      if (justtcgConfigured()) {
        const { confidentMatch, baseName } = await import("@/lib/catalog");
        // Number unreadable → one quick focused read of the zoomed strip before searching.
        if (!result.number && strip) {
          const read = await streamJson<{ number: string | null }>({
            instructions: "Read the collector number exactly as printed (e.g. 025/165, SWSH020, LOB-EN001). Return null if not legible.",
            content: [{ type: "input_image", image_url: strip, detail: "high" }],
            schemaName: "number_read",
            schema: { type: "object", additionalProperties: false, required: ["number"], properties: { number: { type: ["string", "null"] } } },
          }).catch(() => ({ number: null }));
          if (read.number) result.number = read.number;
        }
        const ranked = await findCatalogCandidates(result);
        let card = confidentMatch(ranked);
        // Several plausible printings → let the AI compare them against the photo.
        const positive = ranked.filter((r) => r.score > 0);
        const shortlist = (positive.length ? positive : ranked).slice(0, 20);
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
              ...stripInput,
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
