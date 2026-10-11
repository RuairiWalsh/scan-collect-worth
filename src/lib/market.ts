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
};

export const marketQuery = () =>
  queryOptions({
    queryKey: ["market"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("market_listings");
      if (error) throw error;
      return data as MarketListing[];
    },
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
