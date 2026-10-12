// Pure Numista helpers (coins): matching, grade mapping and the 7-day cache rule.
export type NumistaTypeSummary = { id: number; title: string; issuer?: { name?: string } | null; min_year?: number | null; max_year?: number | null; object_type?: { name?: string } | null };
export type NumistaIssue = { id: number; year?: number | null; gregorian_year?: number | null; mint_letter?: string | null; comment?: string | null; references?: { number?: string | null; catalogue?: { code?: string | null } | null }[] | null };

const pcgsRef = (i: NumistaIssue | undefined) => i?.references?.find((r) => r.catalogue?.code === "PCGS" && r.number)?.number ?? null;

/**
 * PCGS CoinFacts number recorded on a Numista issue; null when the issue is unknown or unlisted.
 * Without an exact issue, falls back to the year: when every non-proof issue of that year
 * shares one PCGS number (e.g. same coin struck at two mints), that number is used.
 */
export function numistaPcgsNo(issues: NumistaIssue[] | null | undefined, issueId: number | null, year?: string | number | null): string | null {
  const list = issues ?? [];
  if (issueId) return pcgsRef(list.find((i) => i.id === issueId));
  const y = Number(String(year ?? "").match(/\d{4}/)?.[0]);
  if (!y) return null;
  const nums = new Set(
    list.filter((i) => (i.gregorian_year ?? i.year) === y && !/proof/i.test(i.comment ?? "")).map(pcgsRef),
  );
  if (nums.size !== 1) return null;
  return [...nums][0];
}

/** Numista's terms allow caching its data (including image links) for at most 7 days. */
export const NUMISTA_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export function numistaCacheFresh(fetchedAt: string | null | undefined, now = Date.now()) {
  return !!fetchedAt && now - new Date(fetchedAt).getTime() < NUMISTA_CACHE_MS;
}

/** Numista grade code for the app's coin condition; null for proofs (no circulated grade). */
export function numistaGrade(condition: string): string | null {
  const map: Record<string, string> = { ms65: "unc", ms60: "unc", au: "au", xf: "xf", vf: "vf", fine: "f", good: "g" };
  return map[condition] ?? null;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Candidates from the scanned country and year, standard circulation first. */
export function rankNumistaTypes(types: NumistaTypeSummary[], want: { country?: string | null; year?: string | null }): NumistaTypeSummary[] {
  const country = norm(want.country);
  const year = Number(want.year) || null;
  return types
    .filter((t) => !country || norm(t.issuer?.name).includes(country) || country.includes(norm(t.issuer?.name)))
    .filter((t) => !year || ((t.min_year ?? year) <= year && year <= (t.max_year ?? year)))
    .sort((a, b) => Number(/standard/i.test(b.object_type?.name ?? "")) - Number(/standard/i.test(a.object_type?.name ?? "")));
}

/** Exact issue for a year + mint mark; proofs only when asked. Null when ambiguous. */
export function pickNumistaIssue(issues: NumistaIssue[], want: { year?: string | null; mint?: string | null; proof?: boolean }): NumistaIssue | null {
  const year = Number(want.year) || null;
  const mint = (want.mint ?? "").match(/\b([A-Z]{1,2})\b/)?.[1] ?? null;
  let pool = issues.filter((i) => !year || (i.gregorian_year ?? i.year) === year);
  pool = pool.filter((i) => /proof/i.test(i.comment ?? "") === !!want.proof);
  if (mint) {
    const m = pool.filter((i) => (i.mint_letter ?? "").toUpperCase() === mint);
    if (m.length) pool = m;
  } else {
    const plain = pool.filter((i) => !i.mint_letter);
    if (plain.length) pool = plain;
  }
  return pool.length === 1 ? pool[0]! : null;
}

export const numistaCatalogId = (typeId: number, issueId?: number | null) => `numista:${typeId}${issueId ? `:${issueId}` : ""}`;
export function parseNumistaId(id: string | null | undefined): { typeId: number; issueId: number | null } | null {
  const m = /^numista:(\d+)(?::(\d+))?$/.exec(id ?? "");
  return m ? { typeId: Number(m[1]), issueId: m[2] ? Number(m[2]) : null } : null;
}
export const numistaImagePath = (typeId: number, side: "obverse" | "reverse" = "obverse") => `/api/public/coin-images/${typeId}?side=${side}`;
