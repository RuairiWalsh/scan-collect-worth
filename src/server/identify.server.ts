// Server-only: identify a collectible photo, then pin it to an exact catalog card.
import type { Identification } from "@/lib/scan.functions";
import { identificationSchema as schema } from "@/lib/scan-schema";

export async function identifyImage(image: string, strip?: string | undefined, back?: string | undefined) {
  const stripInput = strip ? [{ type: "input_text", text: "Zoomed view of the bottom of the same card (collector number / set code):" }, { type: "input_image", image_url: strip, detail: "high" }] : [];
  const backInput = back ? [{ type: "input_text", text: "Back of this same card. Use its printed card number, copyright year and set details to identify the front precisely:" }, { type: "input_image", image_url: back, detail: "high" }] : [];
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
        "Sports: player name, brand (Topps, Panini, Upper Deck…), card number on the back or corner. ALWAYS give `year`: use the copyright line (©1999), the year in the set name, or the season/stat line; only null if none is visible. Put the brand/product in set_name (e.g. 1999 Topps Chrome).",
        "Copy the number exactly as printed into `number` (keep leading zeros and the /total). If you can't read it, use null — do not guess numbers.",
        "Non-English cards (e.g. Japanese): set `language` accordingly, but write `name` and `set_name` as the official ENGLISH names (e.g. ピカチュウ → Pikachu) so the catalog can match; copy the number exactly as printed.",
        "If it's packaging (box, pack, tin) rather than a single card, set is_collectible false.",
        "Use confidence below 0.5 when the text is unreadable.",
      ].join("\n"),
      content: [
        { type: "input_text", text: "Identify this collectible." },
        { type: "input_image", image_url: data.image, detail: "high" },
        ...stripInput,
        ...backInput,
      ],
      schemaName: "identification",
      schema,
      effort: "low",
    });

    if (!result.year) result.year = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(`${result.set_name ?? ""} ${result.printed_text ?? ""}`)?.[1] ?? null;
    if (result.is_collectible && result.category === "cards") {
      const { cardsightConfigured, cardsightFindCard } = await import("@/server/cardsight.server");
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
              ...backInput,
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
        } else if (!card && shortlist.length === 1 && shortlist[0] && shortlist[0].score >= 5) {
          card = shortlist[0].card;
        }
        if (!card && cardsightConfigured()) {
          const csCard = await cardsightFindCard({
            name: result.name,
            set_name: result.set_name,
            number: result.number,
            year: result.year,
          });
          if (csCard) {
            result.catalog_id = csCard.id;
            result.name = csCard.name || result.name;
            result.set_name = csCard.releaseName || csCard.setName || result.set_name;
            result.number = csCard.number || result.number;
            result.year = csCard.releaseYear || result.year;
            result.confidence = Math.max(result.confidence, 0.8);
            // For sports, we often dont have a JustTCG match, so this is our primary identity.
          }
        }

        if (card) {
          // Keep the language in the saved variant so the Japanese printing is priced and shown.
          const lang = result.language && result.language !== "English" ? result.language : null;
          if (lang && !new RegExp(lang, "i").test(result.variant ?? "")) result.variant = [result.variant, lang].filter(Boolean).join(" ");
          result.name = baseName(card.name) || result.name;
          result.set_name = card.set_name ?? result.set_name;
          result.number = card.number ?? result.number;
          result.catalog_id = card.id;
          result.confidence = Math.max(result.confidence, 0.85);
        }
      }
      // All card images come from the scanned front, never from a provider catalog.
    }
    return { ok: true as const, result };
  } catch (e) {
    if (e instanceof AiError) return { ok: false as const, error: e.message, status: e.status };
    throw e;
  }
}
