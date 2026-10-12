import { expect, it } from "vitest";
import { cardsightVariants } from "./cardsight-pricing";
import { cardPriceSources } from "./card-pricing";
const data = { raw: { records: [{ price: 10, source: "ebay", listing_type: "auction" as const }, { price: 12, source: "ebay", listing_type: "auction" as const }, { price: 500, source: "ebay", listing_type: "fixed" as const }] }, graded: [] };
it("uses completed auction and fixed-price sales", () => {
  const variants = cardsightVariants(data);
  expect(variants[0]?.price).toBe(12);
  expect(cardPriceSources(variants, "raw_ungraded")[0]?.source).toBe("cardsight");
});
it("does not invent a near-mint price from unspecified raw comps", () => {
  expect(cardPriceSources(cardsightVariants(data), "raw_nm")).toEqual([]);
});
it("separates parallels and exact grading company and grade", () => {
  const variants = cardsightVariants({ raw: { records: [] }, graded: [{ company_name: "PSA", grades: [{ grade_value: "10", records: [{ price: 90, source: "ebay", listing_type: "auction" }] }] }] });
  expect(cardPriceSources(variants, "graded", null, "PSA", "10")[0]?.price).toBe(90);
  expect(cardPriceSources(variants, "graded", null, "PSA", "9")).toEqual([]);
});