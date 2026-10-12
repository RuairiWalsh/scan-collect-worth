// Pure helpers for Lymitz's own stamp database (no good public stamp API exists).
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const COUNTRY_ALIASES: Record<string, string> = { us: "united states", usa: "united states", "united states of america": "united states", uk: "united kingdom", gb: "united kingdom", "great britain": "united kingdom" };
export const stampCountry = (c: string | null | undefined) => COUNTRY_ALIASES[norm(c)] ?? norm(c);

export type StampIdentity = { country: string | null; year: string | null; name: string; denomination: string | null };

/** Same stamp = same country + year + design title + face value. Null when too vague to share. */
export function stampMatchKey(s: StampIdentity): string | null {
  const country = stampCountry(s.country);
  const name = norm(s.name);
  const year = /^\d{4}$/.test(s.year?.trim() ?? "") ? s.year!.trim() : "";
  if (!country || country === "world" || !name || !year) return null;
  return [country, year, name, norm(s.denomination)].join("|");
}

/** Catalog numbers like "Scott 704" / "#704" / "SG 1" → normalized system + number. */
export function parseStampNumber(raw: string | null | undefined): { system: string; number: string } | null {
  const m = /^\s*(scott|sg|stanley gibbons|michel|yvert)?\s*#?\s*([A-Z]{0,2}\d+[A-Za-z]?)\s*$/i.exec(raw ?? "");
  if (!m) return null;
  const sys = (m[1] ?? "scott").toLowerCase();
  return { system: sys === "stanley gibbons" ? "sg" : sys, number: m[2]!.toUpperCase() };
}

export const stampCatalogId = (id: string) => `stamp:${id}`;
export const parseStampCatalogId = (id: string | null | undefined) => /^stamp:([0-9a-f-]{36})$/.exec(id ?? "")?.[1] ?? null;
export const stampImagePath = (id: string) => `/api/public/stamp-images/${id}`;
