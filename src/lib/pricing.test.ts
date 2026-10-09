import { describe, expect, it } from "vitest";
import { estimateValue, trimmedMedian } from "./pricing";
import { conditionFor } from "./taxonomy";

describe("pricing", () => {
  it("applies condition multiplier only to reference prices", () => {
    const r = estimateValue(
      [
        { source: "a", label: "A", price: 100, kind: "reference" },
        { source: "b", label: "B", price: 40, kind: "market" },
      ],
      0.5,
    );
    expect(r).toEqual({ est: 45, low: 40, high: 50 });
  });

  it("returns null with no usable prices", () => {
    expect(estimateValue([], 1)).toBeNull();
  });

  it("lightly played cards are worth 85% of near mint", () => {
    expect(conditionFor("cards", "raw_lp").mult).toBe(0.85);
  });

  it("trims listing outliers", () => {
    expect(trimmedMedian([10, 11, 12, 100])).toBe(11);
  });
});
