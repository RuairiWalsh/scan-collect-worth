import { describe, expect, it } from "vitest";
import { featuredCardPrice } from "./featured-card";

describe("featured Pikachu market price", () => {
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