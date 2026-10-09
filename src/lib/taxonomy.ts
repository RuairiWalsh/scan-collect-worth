// Collectible taxonomy: category -> subcategory -> line
export type CategoryKey = "cards" | "stamps" | "coins";

export const TAXONOMY: Record<
  CategoryKey,
  { label: string; subcategories: Record<string, { label: string; lines: string[] }> }
> = {
  cards: {
    label: "Cards",
    subcategories: {
      tcg: {
        label: "TCG",
        lines: ["Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!", "One Piece", "Lorcana", "Other TCG"],
      },
      sports: {
        label: "Sports",
        lines: ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Other Sports"],
      },
      nonsport: { label: "Non-Sport", lines: ["Entertainment", "Other"] },
    },
  },
  stamps: {
    label: "Stamps",
    subcategories: {
      us: { label: "United States", lines: ["Definitive", "Commemorative", "Airmail", "Other"] },
      world: { label: "World", lines: ["UK & Commonwealth", "Europe", "Asia", "Other"] },
    },
  },
  coins: {
    label: "Coins",
    subcategories: {
      us: { label: "US Coins", lines: ["Cents", "Nickels", "Dimes", "Quarters", "Halves", "Dollars", "Gold"] },
      world: { label: "World Coins", lines: ["Europe", "Asia", "Americas", "Ancient", "Other"] },
      bullion: { label: "Bullion", lines: ["Silver", "Gold", "Platinum"] },
    },
  },
};

export const CATEGORY_KEYS = Object.keys(TAXONOMY) as CategoryKey[];

// Conditions per category. `mult` scales a near-mint / reference catalog price.
export type Condition = { key: string; label: string; mult: number };

export const CONDITIONS: Record<CategoryKey, Condition[]> = {
  cards: [
    { key: "raw_nm", label: "Near Mint", mult: 1 },
    { key: "raw_lp", label: "Lightly Played", mult: 0.85 },
    { key: "raw_mp", label: "Moderately Played", mult: 0.7 },
    { key: "raw_hp", label: "Heavily Played", mult: 0.5 },
    { key: "raw_dmg", label: "Damaged", mult: 0.3 },
    { key: "graded", label: "Graded (PSA/BGS/CGC)", mult: 1 },
  ],
  stamps: [
    { key: "superb", label: "Superb", mult: 1.5 },
    { key: "xf", label: "Extremely Fine", mult: 1.2 },
    { key: "vf", label: "Very Fine", mult: 1 },
    { key: "fine", label: "Fine", mult: 0.6 },
    { key: "good", label: "Good", mult: 0.3 },
    { key: "poor", label: "Poor", mult: 0.1 },
  ],
  coins: [
    { key: "ms65", label: "MS-65+ (Gem)", mult: 2 },
    { key: "ms60", label: "MS-60 (Unc)", mult: 1.3 },
    { key: "au", label: "About Unc", mult: 1 },
    { key: "xf", label: "Extremely Fine", mult: 0.8 },
    { key: "vf", label: "Very Fine", mult: 0.6 },
    { key: "fine", label: "Fine", mult: 0.45 },
    { key: "good", label: "Good", mult: 0.3 },
    { key: "proof", label: "Proof", mult: 1.5 },
  ],
};

export function defaultCondition(cat: CategoryKey): string {
  return cat === "cards" ? "raw_nm" : cat === "stamps" ? "vf" : "au";
}

export function conditionFor(cat: string, key: string): Condition {
  const list = CONDITIONS[(cat as CategoryKey) in CONDITIONS ? (cat as CategoryKey) : "cards"];
  return list.find((c) => c.key === key) ?? list[0]!;
}

export function categoryLabel(cat: string, sub?: string | null) {
  const c = TAXONOMY[cat as CategoryKey];
  if (!c) return cat;
  if (!sub) return c.label;
  return `${c.label} · ${c.subcategories[sub]?.label ?? sub}`;
}
