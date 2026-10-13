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

/** Exact normalized set match for the bulk-import set shortcut: "2002 Topps" must not satisfy "2002 Topps Gold Label". */
export function cardsightSameSet(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a), y = norm(b);
  return Boolean(x && y && x === y);
}

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

/**
 * Rank broad name-search candidates for a one-sided scan. Cards whose name
 * contains the scanned first name always outrank same-surname players, so a
 * search for "Earl Snyder" never offers Cory Snyder above Earl. Set-word
 * overlap breaks ties so "Topps Gold Label" beats plain "Topps".
 */
export function rankCardsightCandidates(cards: CardsightCard[], item: CardsightQuery): CardsightCard[] {
  const nameParts = item.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const firstName = nameParts[0] ?? "";
  const setWords = (item.set_name ?? "").toLowerCase().replace(/\b(19|20)\d\d\b/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const nameScore = (c: CardsightCard) => {
    const n = (c.name ?? "").toLowerCase();
    let s = 0;
    if (firstName && n.includes(firstName)) s += 10;
    for (const w of nameParts) if (n.includes(w)) s += 1;
    return s;
  };
  const setScore = (c: CardsightCard) => {
    const hay = `${c.setName ?? ""} ${c.releaseName ?? ""}`.toLowerCase();
    return setWords.filter((w) => hay.includes(w)).length;
  };
  const hasSetMatch = setWords.length > 0 && cards.some((c) => setScore(c) > 0);
  const pool = hasSetMatch ? cards.filter((c) => setScore(c) > 0) : cards;
  return [...pool].sort((a, b) => nameScore(b) - nameScore(a) || setScore(b) - setScore(a)).slice(0, 25);
}

/**
 * Bulk import with an admin-chosen set: match a read card number against that
 * set's checklist. Several cards can share a number (parallels); the read name
 * breaks the tie, otherwise no pin so the admin reviews it.
 */
export function matchSetCardByNumber(cards: CardsightCard[], number: string | null | undefined, name?: string | null): CardsightCard | null {
  const norm = (v: string | null | undefined) => (cardsightNumber(v) ?? "").replace(/^(no\.?|#)\s*/i, "").replace(/^0+(?=\w)/, "").toUpperCase();
  const num = norm(number);
  if (!num) return null;
  const hits = cards.filter((c) => norm(c.number) === num);
  if (hits.length <= 1) return hits[0] ?? null;
  const n = (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return null;
  const named = hits.filter((c) => (c.name ?? "").toLowerCase().replace(/[^a-z]/g, "") === n);
  return named.length === 1 ? named[0]! : null;
}
