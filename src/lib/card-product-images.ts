export type CardImageIdentity = {
  catalog_id?: string | null;
  category?: string;
  subcategory?: string | null;
  line?: string | null;
  name: string;
  set_name?: string | null;
  number?: string | null;
  year?: string | null;
  variant?: string | null;
  language?: string | null;
};

/** Missing printing identifiers must not cause unrelated cards to share a photograph. */
export function cardImageIdentity(item: CardImageIdentity): string | null {
  const normalize = (s?: string | null) => (s ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const variant = normalize(item.variant);
  const language = normalize(item.language);
  if (item.catalog_id) return JSON.stringify(["catalog", item.catalog_id, variant, language]);
  if (!item.name || !item.set_name || !item.number || !item.year || !item.line) return null;
  return JSON.stringify(["identity", item.subcategory, item.line, item.name, item.set_name, item.number, item.year, variant, language].map(normalize));
}

export function cardProductImage(item: { category: string; product_image?: string | null; thumbnail?: string | null }): string | null {
  return item.category === "cards" ? item.product_image || item.thumbnail || null : item.thumbnail || null;
}

export function canReuseCardImage(reviewStatus: string, submittedBy: string | null, userId: string): boolean {
  return reviewStatus === "approved" || (reviewStatus === "pending" && submittedBy === userId);
}