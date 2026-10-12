import type { PriceSource } from "@/lib/pricing";
import { trimmedMedian } from "@/lib/pricing";

export type PcgsAuction = { Date?: string | null; Price?: number | null };
export type PcgsFacts = { PCGSNo?: string; Grade?: string; PriceGuideValue?: number | null; AuctionList?: PcgsAuction[] | null };

/** PCGS cert number from the item's number field: digits before any dot, 6–10 long. */
export function pcgsCertNo(number: string | null | undefined): string | null {
  const m = String(number ?? "").replace(/[\s#]/g, "").match(/^(\d{6,10})(?:\.\d+)?$/);
  return m?.[1] ?? null;
}

/** PCGS API grade code from the slab's grade: bare numbers are mint state ("69" → "MS69"). */
export function pcgsGrade(grade: string | null | undefined): string | null {
  const g = String(grade ?? "").replace(/[\s#]/g, "").toUpperCase();
  if (!g) return null;
  if (/^\d+$/.test(g)) return `MS${g}`;
  return /^[A-Z]+\d+$/.test(g) ? g : null;
}

/** PCGS auction dates are "MM-YYYY"; true when within `months` of `now`. */
export function pcgsRecent(date: string | null | undefined, now: Date, months = 12): boolean {
  const m = String(date ?? "").match(/^(\d{1,2})-(\d{4})$/);
  if (!m) return false;
  const age = (now.getUTCFullYear() - Number(m[2])) * 12 + (now.getUTCMonth() + 1 - Number(m[1]));
  return age >= 0 && age <= months;
}

/** Price sources from a PCGS CoinFacts response: recent auction sales first, price guide as reference. */
export function pcgsSources(f: PcgsFacts, now = new Date()): PriceSource[] {
  const out: PriceSource[] = [];
  const sales = (f.AuctionList ?? []).filter((a) => (a.Price ?? 0) > 0 && pcgsRecent(a.Date, now)).map((a) => a.Price as number);
  if (sales.length) out.push({ source: "pcgs", label: `PCGS auction sales · ${f.Grade ?? ""}`.trim(), price: trimmedMedian(sales), kind: "market", count: sales.length });
  if ((f.PriceGuideValue ?? 0) > 0)
    out.push({
      source: "pcgs", label: `PCGS price guide · ${f.Grade ?? ""}`.trim(), price: f.PriceGuideValue as number, kind: "market",
      ...(f.PCGSNo ? { url: `https://www.pcgs.com/coinfacts/coin/detail/${f.PCGSNo}` } : {}),
    });
  return out;
}

/** Monthly auction history from PCGS CoinFacts ("MM-YYYY" dates): median sale per month, oldest first. */
export function pcgsSalesSeries(f: PcgsFacts | null | undefined, now = new Date(), months = 60): { recorded_at: string; est_value: number; count: number }[] {
  const byMonth = new Map<string, number[]>();
  for (const a of f?.AuctionList ?? []) {
    const m = String(a.Date ?? "").match(/^(\d{1,2})-(\d{4})$/);
    if (!m || !(Number(a.Price) > 0) || !pcgsRecent(a.Date, now, months)) continue;
    const key = `${m[2]}-${m[1].padStart(2, "0")}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), Number(a.Price)]);
  }
  return [...byMonth.keys()].sort().map((k) => {
    const v = byMonth.get(k)!;
    return { recorded_at: `${k}-15T00:00:00.000Z`, est_value: Math.round(trimmedMedian(v) * 100) / 100, count: v.length };
  });
}
