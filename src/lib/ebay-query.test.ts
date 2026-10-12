import { describe, expect, it } from "vitest";
import { buildSearchQuery, ebayEstimate } from "@/server/prices.server";

describe("buildSearchQuery — coins", () => {
  it("uses short collector wording, not the full catalog name", () => {
    const q = buildSearchQuery({
      category: "coins",
      year: 1991,
      set_name: "United States",
      name: '1 Dollar "American Silver Eagle" (Bullion Coin) Silver',
      variant: "WTC Ground Zero Recovery",
      condition: "graded",
      grader: "PCGS",
      grade: "69",
      number: "12345678",
    } as any);
    expect(q).toBe("1991 American Silver Eagle WTC Ground Zero Recovery PCGS 69");
    expect(q).not.toContain("United States");
    expect(q).not.toContain("Dollar");
    expect(q).not.toContain("12345678");
  });

  it("keeps the design name for a plain coin", () => {
    const q = buildSearchQuery({
      category: "coins",
      year: 1971,
      set_name: "United States",
      name: '1 Dollar "Eisenhower Dollar"',
      variant: null,
      condition: "raw_ungraded",
      number: null,
    } as any);
    expect(q).toBe("1971 Eisenhower Dollar");
  });

  it("adds proof for proof coins", () => {
    const q = buildSearchQuery({
      category: "coins",
      year: 1964,
      set_name: "United States",
      name: "50 Cents Kennedy Half Dollar",
      condition: "proof",
    } as any);
    expect(q).toBe("1964 Kennedy Half Dollar proof");
  });
});

describe("ebayEstimate", () => {
  it("prices graded coins at 75% of the median asking price", () => {
    const price = ebayEstimate(
      { category: "coins", condition: "graded" } as any,
      [300, 320, 340],
    );
    expect(price).toBe(240); // median 320 × 0.75
  });

  it("keeps the full median for ungraded coins and other items", () => {
    expect(ebayEstimate({ category: "coins", condition: "raw_ungraded" } as any, [100, 200, 300])).toBe(200);
    expect(ebayEstimate({ category: "cards", condition: "graded" } as any, [100, 200, 300])).toBe(200);
  });
});
