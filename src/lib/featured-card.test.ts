import { describe, expect, it } from "vitest";
import { dailyCatalogIds, FEATURED_CARD_ID, featuredCardPrice } from "./featured-card";

describe("featured Pikachu market price", () => {
  it("includes the featured card in daily updates even when nobody owns it", () => {
    expect(dailyCatalogIds([])).toEqual([FEATURED_CARD_ID]);
    expect(dailyCatalogIds([FEATURED_CARD_ID, "another-card", "another-card"])).toEqual([FEATURED_CARD_ID, "another-card"]);
  });
  it("uses the exact Near Mint Holofoil price rather than another condition", () => {
    expect(featuredCardPrice([
      { condition: "Lightly Played", printing: "Holofoil", price: 1.43 },
      { condition: "Near Mint", printing: "Holofoil", price: 1.47 },
    ])).toBe(1.47);
  });
  it("does not invent a missing Near Mint Holofoil price", () => {
    expect(featuredCardPrice([{ condition: "Near Mint", printing: "Reverse Holofoil", price: 9 }])).toBeNull();
  });
});