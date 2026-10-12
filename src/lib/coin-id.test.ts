import { describe, expect, it } from "vitest";
import { coinMissingInfo } from "./coin-id";

describe("coinMissingInfo", () => {
  it("asks for the year when the scanned side has none", () => {
    expect(coinMissingInfo({ category: "coins", name: "Washington Quarter", set_name: "United States", year: null })).toEqual(["year"]);
  });
  it("passes through a missing mint mark reported by the scan", () => {
    expect(coinMissingInfo({ category: "coins", name: "Lincoln Cent", set_name: "United States", year: "1955", missing_info: ["Mint mark"] })).toEqual(["mint mark"]);
  });
  it("needs nothing when every detail is present", () => {
    expect(coinMissingInfo({ category: "coins", name: "Morgan Dollar", set_name: "United States", year: "1921", missing_info: [] })).toEqual([]);
  });
  it("never asks for another side on cards", () => {
    expect(coinMissingInfo({ category: "cards", name: "Pikachu", year: null })).toEqual([]);
  });
});
