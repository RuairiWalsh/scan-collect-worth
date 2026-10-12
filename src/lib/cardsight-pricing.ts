import { trimmedMedian, type PriceSource } from "./pricing";
import type { CardVariant } from "./card-pricing";

export type CardsightPriceRecord = { price: number; listing_type?: "auction" | "fixed" | null; source: string; url?: string | null; parallel_id?: string | null; parallel_name?: string | null; date?: string | null };
export type CardsightPricing = {
  raw: { records: CardsightPriceRecord[] };
  graded: { company_name: string; grades: { grade_value: string; records: CardsightPriceRecord[] }[] }[];
};
function sourceFor(records: CardsightPriceRecord[]): PriceSource | null {
  const sales = records.filter(r => (r.listing_type === "auction" || r.listing_type === "fixed") && Number.isFinite(r.price) && r.price > 0);
  if (!sales.length) return null;
  const marketplaces = [...new Set(sales.map(r => r.source))].join(", ");
  return { source: "cardsight", label: `CardSight · completed sales (${marketplaces})`, price: trimmedMedian(sales.map(r => r.price)), kind: "market", count: sales.length };
}
export function cardsightVariants(data: CardsightPricing): CardVariant[] {
  const out: CardVariant[] = [];
  const add = (records: CardsightPriceRecord[], condition: string, grader?: string, grade?: string) => {
    const groups = new Map<string, CardsightPriceRecord[]>();
    for (const r of records) {
      const key = r.parallel_id ?? "base";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const rows of groups.values()) {
      const source = sourceFor(rows);
      if (source) out.push({ printing: rows[0]?.parallel_name || "Normal", condition, price: source.price, sources: [source], ...(grader ? { grader } : {}), ...(grade ? { grade } : {}) });
    }
  };
  add(data.raw?.records ?? [], "Ungraded");
  for (const company of data.graded ?? []) for (const grade of company.grades ?? []) add(grade.records, "Graded", company.company_name, grade.grade_value);
  return out;
}