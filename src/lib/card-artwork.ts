import type { CatalogCard } from "@/lib/catalog";

/** Artwork comes only from the external ID on the exact matched catalog entry. */
export function officialCardImage(card: CatalogCard): string | null {
  const scryfallId = card.scryfallId;
  if (scryfallId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scryfallId)) {
    return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=large`;
  }
  const productId = String(card.tcgplayerId ?? "");
  return /^[1-9]\d*$/.test(productId) ? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg` : null;
}