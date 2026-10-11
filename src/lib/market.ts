import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TAXONOMY, type CategoryKey } from "@/lib/taxonomy";

export type MarketListing = {
  listing_id: string;
  price: number;
  created_at: string;
  store_name: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  line: string | null;
  catalog_id: string | null;
  set_name: string | null;
  number: string | null;
  condition: string;
  grader: string | null;
  grade: string | null;
  image: string | null;
  photos?: string[] | null;
  scan_image?: string | null;
  uploaded_image?: string | null;
};

export function listingImage(l: Pick<MarketListing, "image" | "uploaded_image" | "scan_image">, sellerPhoto = false): string | null {
  return sellerPhoto ? l.uploaded_image || l.scan_image || l.image : l.image;
}

export const marketQuery = () =>
  queryOptions({
    queryKey: ["market"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("market_listings_with_photos");
      if (error) throw error;
      const rows = data as MarketListing[];
      const paths = [...new Set(rows.flatMap(l => l.photos?.slice(0, 1) ?? []))];
      const images = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("listing-photos").createSignedUrls(paths, 3600);
        for (const photo of signed ?? []) {
          if (photo.path && photo.signedUrl && !photo.error) images.set(photo.path, photo.signedUrl);
        }
      }
      return rows.map(l => ({ ...l, uploaded_image: l.photos?.[0] ? images.get(l.photos[0]) ?? null : null }));
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

/** Carousel label: card game/sport line (e.g. Pokémon, Baseball), else the category (Stamps, Coins). */
export function listingGroup(l: Pick<MarketListing, "category" | "subcategory" | "line">): string {
  const cat = TAXONOMY[l.category as CategoryKey];
  if (!cat) return "Other";
  if (l.category === "cards") {
    if (l.line) return l.line;
    return (l.subcategory && cat.subcategories[l.subcategory]?.label) || "Other cards";
  }
  return cat.label;
}

/** Groups listings into carousels; each carousel and the carousel order are newest-listed first. */
export function groupListings<T extends Pick<MarketListing, "category" | "subcategory" | "line" | "created_at">>(
  listings: T[],
): { label: string; items: T[] }[] {
  const sorted = [...listings].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups = new Map<string, T[]>();
  for (const l of sorted) {
    const k = listingGroup(l);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
