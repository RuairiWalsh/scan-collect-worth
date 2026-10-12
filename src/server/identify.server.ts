// Server-only: identify a collectible photo, then pin it to an exact catalog card.
import type { Identification } from "@/lib/scan.functions";
import { identificationSchema as schema } from "@/lib/scan-schema";

export async function identifyImage(image: string, strip?: string | undefined, back?: string | undefined) {
  const stripInput = strip ? [{ type: "input_text", text: "Zoomed view of the bottom of the same card (collector number / set code):" }, { type: "input_image", image_url: strip, detail: "high" }] : [];
  const backInput = back ? [{ type: "input_text", text: "Other side (back / reverse) of this same item. Combine both sides: for cards use the printed number, copyright year and set; for coins use the date, mint mark, country and denomination shown on either side:" }, { type: "input_image", image_url: back, detail: "high" }] : [];
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
        "Coins: name = coin type and denomination (e.g. Kennedy Half Dollar, 2 Euro, Maple Leaf 1 oz); set_name = issuing country (e.g. United States, Canada); year = date on the coin; variant = mint mark and any special issue (e.g. 'D', 'S Proof', metal like Silver); subcategory us/world/bullion. Many coins show the date or mint mark on only one side: never guess — leave unknown fields null and list them in missing_info. Slabbed coins (PCGS, NGC, ANACS…): set condition graded, grader and grade from the label, and put the certification number printed on the label (digits only, e.g. 12345678.01 → 12345678) in `number`; null if unreadable.",
        "Stamps: name = design title (e.g. George Washington, Statue of Liberty); set_name = issuing country written out in full; variant = face value as printed plus colour (e.g. '3c purple'); year = issue year; number = Scott catalogue number ONLY if you are certain, else null.",
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
          const exact = csCard;
          let picked = csCard;
          // Image matching: CardSight compares the photo against its catalog pictures.
          const { cardsightIdentifyImage } = await import("@/server/cardsight.server");
          const visual = await cardsightIdentifyImage(data.image);
          if (!picked && visual?.card && visual.confidence !== "Low") {
            picked = visual.card;
            result.confidence = Math.max(result.confidence, visual.confidence === "High" ? 0.85 : 0.7);
          }
          // One-sided scan: no number/year. Let the AI pick using player, brand, set design and photo likeness.
          if (!picked) {
            const { cardsightCandidates } = await import("@/server/cardsight.server");
            const found = await cardsightCandidates({ name: result.name, set_name: visual?.releaseName ?? result.set_name });
            // Put the photo match (even low-confidence) first, and prefer the release/year the picture matched.
            const vis = visual?.card ? [visual.card] : [];
            const sameRelease = (c: { releaseName?: string | null; releaseYear?: string | null }) => Boolean(visual?.releaseName && c.releaseName === visual.releaseName && (!visual.year || c.releaseYear === visual.year));
            const rest = found.filter(c => !vis.some(v => v.id === c.id));
            const cands = [...vis, ...rest.filter(sameRelease), ...rest.filter(c => !sameRelease(c))].slice(0, 25);
            if (cands.length) {
              const pick = await streamJson<{ index: number }>({
                instructions:
                  "You match a photographed sports card to an exact catalog entry. Use the player, brand logo, card design/era, set name, team and uniform, and any visible text. The number may be on the back and not visible. Answer -1 only if no candidate is plausible.",
                content: [
                  { type: "input_text", text: `Read from the card: ${result.printed_text ?? ""}\nGuess: ${result.name} | ${result.set_name ?? "?"} | ${result.year ?? "?"}\n${visual ? `Photo recognition suggests: ${visual.year ?? "?"} ${visual.releaseName ?? "?"} (${visual.confidence} confidence)\n` : ""}Candidates:\n` + cands.map((c, i) => `${i}. ${c.name} | ${c.releaseYear ?? "?"} ${c.releaseName ?? ""} | set: ${c.setName ?? "?"} | #${c.number ?? "?"}`).join("\n") },
                  { type: "input_image", image_url: data.image, detail: "high" },
                  ...backInput,
                ],
                schemaName: "cardsight_pick",
                schema: { type: "object", additionalProperties: false, required: ["index"], properties: { index: { type: "integer" } } },
              }).catch(() => ({ index: -1 }));
              picked = cands[pick.index] ?? null;
              result.alternatives = cands.filter(c => c !== picked).slice(0, 8).map(c => ({ catalog_id: c.id, name: c.name || result.name, set_name: [c.releaseName, c.setName && c.setName !== "Base Set" ? c.setName : null].filter(Boolean).join(" ") || null, number: c.number ?? null, year: c.releaseYear ?? null }));
              if (picked) result.confidence = Math.min(Math.max(result.confidence, 0.6), 0.75);
            }
          }
          if (picked) {
            const csCard = picked;
            result.catalog_id = csCard.id;
            result.name = csCard.name || result.name;
            result.set_name = csCard.releaseName || csCard.setName || result.set_name;
            result.number = csCard.number || result.number;
            result.year = csCard.releaseYear || result.year;
            if (picked === exact) result.confidence = Math.max(result.confidence, 0.8);
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
    if (result.is_collectible && result.category === "coins") {
      await matchNumista(result, data.image, back, streamJson).catch((e) => console.error("Numista match failed", e));
    }
    if (result.is_collectible && result.category === "stamps") {
      const { matchStamp } = await import("@/server/stamps.server");
      await matchStamp(result).catch((e) => console.error("Stamp match failed", e));
    }
    return { ok: true as const, result };
  } catch (e) {
    if (e instanceof AiError) return { ok: false as const, error: e.message, status: e.status };
    throw e;
  }
}

type StreamJson = typeof import("@/server/ai.server").streamJson;

/** Pin a coin to its exact Numista type/issue; images then come from Numista (cached ≤7 days). */
async function matchNumista(result: Identification, image: string, back: string | undefined, streamJson: StreamJson) {
  const { numistaConfigured, numistaSearch, numistaType, rankNumistaTypes, pickNumistaIssue } = await import("@/server/numista.server");
  const { numistaCatalogId, numistaImagePath } = await import("@/lib/numista");
  if (!numistaConfigured() || !result.name) return;
  const types = rankNumistaTypes(await numistaSearch(result.name, result.year), { country: result.set_name, year: result.year }).slice(0, 10);
  if (!types.length) return;
  let picked = types.length === 1 ? types[0]! : null;
  if (!picked) {
    const pick = await streamJson<{ index: number }>({
      instructions: "Match a photographed coin to an exact catalog type. Compare country, denomination, design, metal and date range. Answer -1 if none clearly match.",
      content: [
        { type: "input_text", text: `Read: ${result.printed_text ?? ""}\nGuess: ${result.year ?? "?"} ${result.set_name ?? "?"} ${result.name} ${result.variant ?? ""}\nCandidates:\n` + types.map((t, i) => `${i}. ${t.title} | ${t.issuer?.name ?? "?"} | ${t.min_year ?? "?"}-${t.max_year ?? "?"} | ${t.object_type?.name ?? ""}`).join("\n") },
        { type: "input_image", image_url: image, detail: "high" },
        ...(back ? [{ type: "input_image", image_url: back, detail: "high" }] : []),
      ],
      schemaName: "numista_pick",
      schema: { type: "object", additionalProperties: false, required: ["index"], properties: { index: { type: "integer" } } },
    }).catch(() => ({ index: -1 }));
    picked = types[pick.index] ?? null;
  }
  if (!picked) return;
  const type = await numistaType(picked.id);
  const issue = type?.issues ? pickNumistaIssue(type.issues, { year: result.year, mint: result.variant, proof: /proof/i.test(result.variant ?? "") }) : null;
  result.catalog_id = numistaCatalogId(picked.id, issue?.id ?? null);
  // Prefer an admin-uploaded mint image for this exact year. Numista has one sample picture per type,
  // so for multi-year types it would show a different date — keep the user's scan instead.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const uploaded = result.year
    ? (await supabaseAdmin.from("coin_images").select("type_id").eq("type_id", picked.id).eq("year", result.year).eq("side", "obverse").maybeSingle()).data
    : null;
  const singleYear = (type?.min_year ?? picked.min_year) != null && (type?.min_year ?? picked.min_year) === (type?.max_year ?? picked.max_year);
  result.product_image = uploaded ? `${numistaImagePath(picked.id)}&year=${result.year}&src=lymitz` : singleYear ? numistaImagePath(picked.id) : null;
  result.name = picked.title;
  result.set_name = picked.issuer?.name ?? result.set_name;
  result.confidence = Math.max(result.confidence, issue ? 0.85 : 0.7);
}
