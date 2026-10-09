// Pure pricing math shared by the server and tests.
export type PriceSource = {
  source: string;
  label: string;
  price: number;
  /** "reference" = catalog near-mint price (condition multiplier applies);
   *  "market" = listing price already matching the item's condition/grade. */
  kind: "reference" | "market";
  url?: string;
  count?: number;
};

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Combine sources into a single per-unit estimate with a low/high band. */
export function estimateValue(sources: PriceSource[], conditionMult: number) {
  const adjusted = sources
    .filter((s) => s.price > 0)
    .map((s) => (s.kind === "reference" ? s.price * conditionMult : s.price));
  if (!adjusted.length) return null;
  return {
    est: round2(median(adjusted)),
    low: round2(Math.min(...adjusted)),
    high: round2(Math.max(...adjusted)),
  };
}

/** Trim outliers (outside 0.5x–2x of median) from a list of listing prices. */
export function trimmedMedian(prices: number[]): number {
  const m = median(prices);
  if (!m) return 0;
  const kept = prices.filter((p) => p >= m * 0.5 && p <= m * 2);
  return round2(median(kept.length ? kept : prices));
}
