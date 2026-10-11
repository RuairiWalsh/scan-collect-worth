import type { CardImageIdentity } from "./card-product-images";

export function isLocalCatalogId(id: string) { return id.startsWith("lymitz-"); }
export function isCardsightId(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }
export function reviewedCatalogId(key: string, providerId?: string | null) { return providerId || `lymitz-${key}`; }
export function sameImportedIdentity(a: CardImageIdentity, b: CardImageIdentity) {
  return (["name", "set_name", "number", "year", "line", "subcategory", "variant", "language"] as const)
    .every(k => String(a[k] ?? "").normalize("NFKC").trim().toLowerCase() === String(b[k] ?? "").normalize("NFKC").trim().toLowerCase());
}
export function dailyTrackedIds(owned: string[], imported: string[], featured: string[]) {
  return [...new Set([...owned, ...imported, ...featured])];
}