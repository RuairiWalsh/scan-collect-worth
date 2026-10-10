import { describe, expect, it } from "vitest";
import { COIN_LEVELS, COIN_ISSUES, EMPTY_COIN_FILTER, coinDetails, coinOptions, matchesCoinFilter, pickCoinLevel } from "./coin-filters";
const coin = { category: "coins", subcategory: "us", line: "Dollars", name: "Silver 1 dollar commemorative", variant: null };
describe("coin collection filters", () => {
  it("follows country, metal, denomination, issue type", () => {
    expect(COIN_LEVELS).toEqual(["country", "metal", "denomination", "issue"]);
    expect(coinDetails(coin)).toEqual({ country: "United States", metal: "Silver", denomination: "1 dollars", issue: "Commemorative" });
  });
  it("includes commemorative without quality or circulation categories", () => {
    expect(COIN_ISSUES).toContain("Commemorative");
    const values = coinOptions([coin], { ...EMPTY_COIN_FILTER }, "issue");
    for (const forbidden of ["Proof", "Mint", "Graded", "Circulated", "Uncirculated"]) expect(values).not.toContain(forbidden);
    expect(coinDetails({ ...coin, name: "Proof mint uncirculated", line: null, variant: "MS65" }).issue).toBe("Unknown issue type");
  });
  it("does not derive metal from grading, or confuse a nickel denomination with metal", () => {
    expect(coinDetails({ ...coin, name: "Jefferson", line: "Nickels" }).metal).toBe("Unknown metal");
    expect(coinDetails({ ...coin, name: "Copper-nickel 2 euros", line: null }).metal).toBe("Copper-nickel");
  });
  it("filters each identity facet", () => {
    const filter = coinDetails(coin);
    expect(matchesCoinFilter(coin, filter)).toBe(true);
    expect(matchesCoinFilter({ ...coin, subcategory: "uk" }, filter)).toBe(false);
    expect(matchesCoinFilter({ ...coin, name: "Gold 1 dollar commemorative" }, filter)).toBe(false);
    expect(matchesCoinFilter({ ...coin, name: "Silver 5 dollars commemorative" }, filter)).toBe(false);
    expect(matchesCoinFilter({ ...coin, name: "Silver 1 dollar bullion" }, filter)).toBe(false);
  });
  it("resets descendants when a parent selection changes", () => {
    expect(pickCoinLevel(coinDetails(coin), "metal", "Gold")).toEqual({ country: "United States", metal: "Gold", denomination: "all", issue: "all" });
  });
  it("does not invent missing countries or metals", () => {
    expect(coinDetails({ category: "coins", subcategory: "world", line: null }).country).toBe("Unknown country");
    expect(coinDetails({ category: "coins", subcategory: "bullion", line: "Gold" }).country).toBe("Unknown country");
  });
  it("limits denomination options to the parent country and metal", () => {
    expect(coinOptions([coin, { ...coin, subcategory: "uk", name: "Silver 2 pounds" }], { ...EMPTY_COIN_FILTER, country: "United States", metal: "Silver" }, "denomination")).toEqual(["1 dollars"]);
  });
});
