import { describe, it, expect } from "vitest";
import { cardsightSalesSeries } from "./cardsight-pricing";
const data = { raw: { records: [
  { price: 2, listing_type: "fixed" as const, source: "ebay", date: "2026-10-05" },
  { price: 4, listing_type: "auction" as const, source: "ebay", date: "2026-10-06" },
  { price: 50, listing_type: "fixed" as const, source: "ebay", date: "2026-10-06", parallel_id: "g", parallel_name: "Gold" },
  { price: 9, listing_type: "fixed" as const, source: "ebay", date: "2026-09-01" },
] }, graded: [{ company_name: "PSA", grades: [{ grade_value: "10", records: [{ price: 100, listing_type: "auction" as const, source: "ebay", date: "2026-10-05" }] }] }] };
describe("cardsightSalesSeries", () => {
  it("groups base raw sales by week, excluding parallels", () => {
    const s = cardsightSalesSeries(data, { condition: "raw_ungraded" });
    expect(s.map(p => p.count)).toEqual([1, 2]);
    expect(s[0].est_value).toBe(9);
  });
  it("uses graded sales for the matching grade", () => {
    expect(cardsightSalesSeries(data, { condition: "graded", grader: "PSA", grade: "10" })[0].est_value).toBe(100);
  });
});
