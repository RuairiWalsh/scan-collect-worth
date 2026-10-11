import type { CatalogCard } from "@/lib/catalog";

/** Provider photographs are not licensed for display. Never resolve catalog artwork. */
export function officialCardImage(_card: CatalogCard): null {
  return null;
}