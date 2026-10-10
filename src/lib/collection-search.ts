import { TAXONOMY, conditionFor, type CategoryKey } from "@/lib/taxonomy";

/**
 * Everything a typed query can match about a saved item. Deliberately narrow:
 * only what identifies the thing itself, never prices or images.
 */
export type SearchableItem = {
  name?: string | null;
  number?: string | null;
  set_name?: string | null;
  line?: string | null;
  subcategory?: string | null;
  category?: string | null;
  year?: string | null;
  condition?: string | null;
  grader?: string | null;
  grade?: string | null;
  variant?: string | null;
  notes?: string | null;
};

/** Lower-case, drop accents and collapse whitespace so "pokemon" still finds "Pokémon". */
function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The searchable text for one item, including the readable labels behind stored codes. */
export function collectionSearchText(item: SearchableItem): string {
  const parts: (string | null | undefined)[] = [
    item.name,
    item.number,
    item.set_name,
    item.line,
    item.year,
    item.variant,
    item.notes,
    item.subcategory,
    item.grader && item.grade ? `${item.grader} ${item.grade}` : item.grader ?? item.grade,
  ];
  const cat = item.category as CategoryKey | null;
  if (cat && TAXONOMY[cat]) {
    parts.push(TAXONOMY[cat].label);
    if (item.subcategory) parts.push(TAXONOMY[cat].subcategories[item.subcategory]?.label ?? item.subcategory);
    parts.push(conditionFor(cat, item.condition ?? "").label);
  } else {
    parts.push(item.category, conditionFor("cards", item.condition ?? "").label);
  }
  return fold(parts.filter(Boolean).join(" "));
}

/**
 * A collection search: every word typed must appear somewhere in the item's
 * identity text. An empty query keeps the whole collection.
 */
export function matchesCollectionQuery(item: SearchableItem, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const text = collectionSearchText(item);
  return q.split(" ").every((term) => text.includes(term));
}
