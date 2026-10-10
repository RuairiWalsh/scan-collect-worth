import { describe, expect, it } from "vitest";
import { availablePrintings, cardPriceSources, selectedCardVariant } from "./card-pricing";
import { estimateValue } from "./pricing";

const variants = [
  { printing: "Normal", condition: "Near Mint", price: 10 },
  { printing: "Normal", condition: "Lightly Played", price: 6.25 },
  { printing: "Normal", condition: "Heavily Played", price: 2.1 },
  { printing: "Normal", condition: "Damaged", price: 0.8 },
  { printing: "Holofoil", condition: "Near Mint", price: 25 },
  { printing: "Reverse Holofoil", condition: "Near Mint", price: 17 },
];
describe("exact card quality and printing prices", () => {
  it("uses the provider's lightly played price, not 85% of NM", () => {
    expect(estimateValue(cardPriceSources(variants, "raw_lp", "Normal"), 0.85)?.est).toBe(6.25);
  });
  it("uses actual heavily played pricing", () => expect(selectedCardVariant(variants, "raw_hp", "Normal")?.price).toBe(2.1));
  it("uses actual damaged pricing", () => expect(selectedCardVariant(variants, "raw_dmg", "Normal")?.price).toBe(0.8));
  it("does not substitute NM when Mint is unavailable", () => expect(selectedCardVariant(variants, "raw_mint", "Normal")).toBeNull());
  it("does not substitute a different condition", () => expect(selectedCardVariant(variants, "raw_mp", "Normal")).toBeNull());
  it("matches holo aliases without choosing reverse holo", () => expect(selectedCardVariant(variants, "raw_nm", "Holo")?.price).toBe(25));
  it("selects reverse holo pricing", () => expect(selectedCardVariant(variants, "raw_nm", "Reverse Holo")?.price).toBe(17));
  it("does not fall back from unavailable printings", () => expect(selectedCardVariant(variants, "raw_nm", "1st Edition")).toBeNull());
  it("only offers printings belonging to the card", () => expect(availablePrintings(variants)).toEqual(["Normal", "Holofoil", "Reverse Holofoil"]));
  it("does not price graded cards from raw prices", () => expect(cardPriceSources(variants, "graded", "Normal")).toEqual([]));
});