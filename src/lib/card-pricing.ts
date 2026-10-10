import type { CatalogCard } from "./catalog";
import type { PriceSource } from "./pricing";

export type CardVariant = NonNullable<CatalogCard["variants"]>[number];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const printingKey = (s: string) => {
  const n = normalize(s);
  if (["normal", "nonfoil", "nonholo", "nonholofoil", "regular"].includes(n)) return "normal";
  if (["holo", "holofoil", "foil"].includes(n)) return "holo";
  if (["reverse", "reverseholo", "reverseholofoil", "reversefoil"].includes(n)) return "reverse";
  // Free-text scan descriptions ("Fireworks holofoil with stamp…") → classify by keyword.
  if (/reverse/.test(n)) return "reverse";
  if (/nonholo|nonfoil|normal|regular/.test(n)) return "normal";
  if (/holo|foil/.test(n)) return "holo";
  return n;
};
export const CARD_CONDITIONS = [
  { key: "raw_mint", label: "Mint" },
  { key: "raw_nm", label: "Near Mint" },
  { key: "raw_lp", label: "Lightly Played" },
  { key: "raw_mp", label: "Moderately Played" },
  { key: "raw_hp", label: "Heavily Played" },
  { key: "raw_dmg", label: "Damaged" },
];

export function cardVariants(value: unknown): CardVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is CardVariant => v != null && typeof v === "object" && typeof v.printing === "string" && !/sealed/i.test(`${v.printing} ${v.condition ?? ""}`));
}
export function availablePrintings(variants: CardVariant[]) {
  return [...new Set(variants.map((v) => v.printing).filter((p): p is string => Boolean(p)))];
}
export function printingLabel(printing: string) {
  const key = printingKey(printing);
  return key === "normal" ? "Normal" : key === "holo" ? "Holo" : key === "reverse" ? "Reverse Holo" : printing;
}
export function resolvePrinting(variants: CardVariant[], requested: string | null | undefined) {
  const options = availablePrintings(variants);
  if (requested?.trim()) return options.find((p) => printingKey(p) === printingKey(requested)) ?? null;
  return options.find((p) => printingKey(p) === "normal") ?? options.find((p) => printingKey(p) !== "reverse") ?? options[0] ?? null;
}
export function selectedCardVariant(variants: CardVariant[], condition: string, printing?: string | null) {
  const label = CARD_CONDITIONS.find((c) => c.key === condition)?.label;
  const resolved = resolvePrinting(variants, printing);
  if (!label || !resolved) return null;
  return variants.find((v) => v.printing === resolved && normalize(v.condition ?? "") === normalize(label) && typeof v.price === "number" && Number.isFinite(v.price) && v.price > 0) ?? null;
}
export function cardPriceSources(variants: CardVariant[], condition: string, printing?: string | null): PriceSource[] {
  const match = selectedCardVariant(variants, condition, printing);
  if (!match || typeof match.price !== "number") return [];
  return [{ source: "justtcg", label: `JustTCG · ${match.condition}, ${printingLabel(match.printing ?? "")}`, price: match.price, kind: "market" }];
}