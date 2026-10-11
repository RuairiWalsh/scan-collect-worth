import { describe, expect, it } from "vitest";
import { groupListings, listingGroup } from "./market";

const l = (category: string, line: string | null, created_at: string, subcategory: string | null = null) => ({
  category, line, subcategory, created_at,
});

describe("market carousels", () => {
  it("groups cards by game or sport and other categories by category", () => {
    expect(listingGroup(l("cards", "Pokémon", "x"))).toBe("Pokémon");
    expect(listingGroup(l("cards", null, "x", "sports"))).toBe("Sports");
    expect(listingGroup(l("coins", "Dimes", "x"))).toBe("Coins");
  });

  it("sorts items and carousels by most recently listed", () => {
    const groups = groupListings([
      l("cards", "Pokémon", "2026-10-01"),
      l("stamps", null, "2026-10-05"),
      l("cards", "Pokémon", "2026-10-09"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Pokémon", "Stamps"]);
    expect(groups[0]!.items.map((i) => i.created_at)).toEqual(["2026-10-09", "2026-10-01"]);
  });
});
