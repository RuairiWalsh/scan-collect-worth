import { describe, expect, it } from "vitest";
import { printingLabel, selectedCardVariant } from "./card-pricing";

const variants = [
  { condition: "Near Mint", printing: "Holofoil - Japanese", price: 12 },
  { condition: "Near Mint", printing: "Normal - Japanese", price: 3 },
];

describe("Japanese printings", () => {
  it("labels the Japanese holo printing", () => {
    expect(printingLabel("Holofoil - Japanese")).toBe("Holo (Japanese)");
  });
  it("prices a scanned 'Holo Japanese' variant from the Japanese holofoil", () => {
    expect(selectedCardVariant(variants, "raw_nm", "Holo Japanese")?.price).toBe(12);
  });
});
