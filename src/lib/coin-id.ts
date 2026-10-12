// Which details a coin scan still needs before it can be identified (and priced) reliably.
export type CoinIdFields = { category: string; name?: string | null; set_name?: string | null; year?: string | null; missing_info?: string[] | null };

const LABELS = ["country", "denomination", "year", "mint mark", "design"] as const;

/** Missing required coin details: the AI's list (limited to known labels) plus a hard check for year and country. */
export function coinMissingInfo(r: CoinIdFields): string[] {
  if (r.category !== "coins") return [];
  const out = new Set<string>();
  for (const m of r.missing_info ?? []) {
    const label = LABELS.find((l) => m.toLowerCase().includes(l));
    if (label) out.add(label);
  }
  if (!r.year?.trim()) out.add("year");
  if (!r.set_name?.trim()) out.add("country");
  if (!r.name?.trim()) out.add("denomination");
  return LABELS.filter((l) => out.has(l));
}
