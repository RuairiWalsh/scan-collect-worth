// Pure matching logic for CardSight catalog candidates (no fetching here).

export type CardsightCard = {
  id: string;
  number?: string | null;
  name?: string | null;
  setName?: string | null;
  releaseName?: string | null;
  releaseYear?: string | null;
};

export type CardsightQuery = {
  name: string;
  set_name?: string | null;
  number?: string | null;
  year?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Printed collector number without the set total: "025/165" → "025". */
export function cardsightNumber(number: string | null | undefined): string | null {
  const n = (number ?? "").split(/[;/,]/)[0]?.trim() ?? "";
  return n || null;
}

/**
 * Pick the candidate that is the scanned card, or null when nothing is
 * convincing. A printed number must match exactly when we have one; without
 * a number we need the set/release or year to line up so we don't pin the
 * wrong printing's image.
 */
export function pickCardsightCard(candidates: CardsightCard[], item: CardsightQuery): CardsightCard | null {
  if (!candidates.length) return null;
  const wantNum = cardsightNumber(item.number)?.replace(/^0+(?=\d)/, "") ?? null;
  const wantSet = norm(item.set_name);
  const wantYear = (item.year ?? "").trim();

  const scored = candidates.map((card) => {
    let score = 0;
    const name = norm(card.name);
    const wantedName = norm(item.name);
    if (!name || !(name === wantedName || name.includes(wantedName) || wantedName.includes(name))) return { card, score: -1 };
    if (wantYear && (card.releaseYear ?? "").trim() !== wantYear) return { card, score: -1 };
    const num = (card.number ?? "").trim().replace(/^0+(?=\d)/, "");
    if (wantNum) {
      if (num !== wantNum) return { card, score: -1 };
      score += 3;
    }
    const setBits = [norm(card.setName), norm(card.releaseName)].filter(Boolean);
    if (wantSet && !setBits.some((s) => s.includes(wantSet) || wantSet.includes(s))) return { card, score: -1 };
    if (wantSet) score += 2;
    if (wantYear && (card.releaseYear ?? "").trim() === wantYear) score += 1;
    return { card, score };
  });

  const ranked = scored.filter((s) => s.score >= 0).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  if (ranked[1]?.score === best.score) return null;
  // With a number, an exact number match alone is enough. Without one, require
  // set or year agreement so a same-named card from another set isn't used.
  return wantNum ? best.card : best.score >= 1 ? best.card : null;
}
