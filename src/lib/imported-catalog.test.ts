import { expect, it } from "vitest";
import { dailyTrackedIds, isLocalCatalogId, reviewedCatalogId, sameImportedIdentity } from "./imported-catalog";
it("tracks reviewed imported cards daily even when nobody owns them", () => {
  expect(dailyTrackedIds([], ["lymitz-new", "sports-id"], ["pikachu"])).toEqual(["lymitz-new", "sports-id", "pikachu"]);
});
it("creates shared identities for cards missing from provider catalogs", () => {
  expect(reviewedCatalogId("abc", null)).toBe("lymitz-abc");
  expect(isLocalCatalogId(reviewedCatalogId("abc"))).toBe(true);
  expect(reviewedCatalogId("abc", "exact-provider-id")).toBe("exact-provider-id");
});
it("does not retain a suggested catalog match after a printing correction", () => {
  const card = { name: "Jim Leyritz", number: "543", year: "1991", set_name: "Topps" };
  expect(sameImportedIdentity(card, { ...card })).toBe(true);
  expect(sameImportedIdentity(card, { ...card, year: "1992" })).toBe(false);
});