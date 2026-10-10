// Pure helpers for matching a scanned card against catalog (JustTCG) candidates.

export type CatalogCard = {
  id: string;
  tcgplayerId?: string | number | null;
  scryfallId?: string | null;
  name: string;
  set_name?: string | null;
  number?: string | null;
  rarity?: string | null;
  variants?: {
    condition?: string;
    printing?: string;
    price?: number;
    priceHistory?: { p: number; t: number }[];
  }[];
};

export type ScanGuess = {
  name: string;
  set_name: string | null;
  number: string | null;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "025/165" → { num: "25", total: "165" }; "LOB-EN001" → { num: "lob-en001" } */
export function parseNumber(raw: string | null | undefined): { num: string; total: string | null } | null {
  const first = String(raw ?? "").split(/[;,]/)[0]!.trim();
  if (!first || /^n\/?a$/i.test(first)) return null;
  const [a, b] = first.split("/");
  const strip = (s: string) => s.trim().toLowerCase().replace(/^0+(?=\w)/, "");
  return { num: strip(a!), total: b ? strip(b) : null };
}

/** Catalog names carry suffixes like "Pikachu - 025/165 (Holiday Calendar)". */
export function baseName(name: string) {
  return name.replace(/\s+-\s+[^()]*\d[^()]*$/, "").replace(/\s+-\s+\d.*$/, "").trim();
}

export function isSealedProduct(c: CatalogCard) {
  if (/\b(booster|box|pack|tin|bundle|case|deck|collection|display|blister)\b/i.test(c.name) && !c.rarity)
    return true;
  const vs = c.variants ?? [];
  return vs.length > 0 && vs.every((v) => /sealed/i.test(`${v.condition ?? ""} ${v.printing ?? ""}`));
}

export function scoreCandidate(guess: ScanGuess, c: CatalogCard): number {
  let score = 0;
  const g = parseNumber(guess.number);
  const n = parseNumber(c.number);
  if (g && n) {
    if (g.num === n.num) {
      score += 4;
      if (g.total && n.total) score += g.total === n.total ? 3 : -3;
    } else {
      score -= 4;
    }
  }
  const gn = norm(guess.name);
  const cn = norm(baseName(c.name));
  if (gn && cn) {
    if (gn === cn) score += 3;
    else if (cn.includes(gn) || gn.includes(cn)) score += 1;
    else score -= 2;
  }
  if (guess.set_name && c.set_name) {
    const gs = norm(guess.set_name);
    const cs = norm(c.set_name);
    if (gs && cs && (cs.includes(gs) || gs.includes(cs))) score += 2;
  }
  return score;
}

export function rankCandidates(guess: ScanGuess, cands: CatalogCard[]) {
  return cands
    .filter((c) => !isSealedProduct(c))
    .map((c) => ({ card: c, score: scoreCandidate(guess, c) }))
    .sort((a, b) => b.score - a.score);
}

/** A confident single match: strong score and clearly ahead of the runner-up. */
export function confidentMatch(ranked: { card: CatalogCard; score: number }[]) {
  const [top, next] = ranked;
  if (!top || top.score < 7) return null;
  if (next && top.score - next.score < 2) return null;
  return top.card;
}
