import { cardVariants, selectedCardVariant } from "@/lib/card-pricing";

export const FEATURED_CARD_ID = "pokemon-me-30th-celebration-pikachu-036-128-pikachu-rare";
export function dailyCatalogIds(ownedIds: string[]): string[] {
  return [...new Set([...ownedIds, FEATURED_CARD_ID])];
}
export function featuredCardPrice(variants: unknown): number | null {
  return selectedCardVariant(cardVariants(variants), "raw_nm", "Holofoil")?.price ?? null;
}