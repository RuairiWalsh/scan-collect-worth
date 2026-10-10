import { describe, expect, it } from "vitest";
import { EMPTY_STAMP_FILTER, STAMP_LEVELS, STAMP_SUBJECTS, matchesStampFilter, pickStampLevel, stampDetails, stampOptions } from "./stamp-filters";
const stamp = { category: "stamps", subcategory: "us", line: "Animals", year: "1964" };
describe("stamp collection hierarchy", () => {
  it("uses country, century, decade, subject in order", () => {
    expect(STAMP_LEVELS).toEqual(["country", "century", "decade", "subject"]);
  });
  it("offers the five requested subjects", () => {
    expect(STAMP_SUBJECTS).toEqual(["Generic", "People", "Monuments/locations", "Commemorative", "Animals"]);
  });
  it("derives century and decade from the issue year", () => {
    expect(stampDetails(stamp)).toEqual({ country: "United States", century: "20th century", decade: "1960s", subject: "Animals" });
    expect(stampDetails({ ...stamp, year: "1900" }).century).toBe("19th century");
    expect(stampDetails({ ...stamp, year: "1901" }).century).toBe("20th century");
  });
  it("filters at every selected level", () => {
    const filter = { country: "United States", century: "20th century", decade: "1960s", subject: "Animals" };
    expect(matchesStampFilter(stamp, filter)).toBe(true);
    expect(matchesStampFilter({ ...stamp, line: "People" }, filter)).toBe(false);
    expect(matchesStampFilter({ ...stamp, year: "1974" }, filter)).toBe(false);
    expect(matchesStampFilter({ ...stamp, subcategory: "uk" }, filter)).toBe(false);
  });
  it("resets downstream levels when a parent changes", () => {
    expect(pickStampLevel({ country: "United States", century: "20th century", decade: "1960s", subject: "Animals" }, "century", "19th century")).toEqual({ country: "United States", century: "19th century", decade: "all", subject: "all" });
  });
  it("keeps missing information unknown rather than inventing it", () => {
    expect(stampDetails({ category: "stamps", subcategory: "world", line: "Europe", year: null })).toEqual({ country: "Unknown country", century: "Unknown century", decade: "Unknown decade", subject: "Unknown subject" });
  });
  it("only offers decades belonging to the selected country and century", () => {
    expect(stampOptions([stamp, { ...stamp, subcategory: "uk", year: "1980" }], { ...EMPTY_STAMP_FILTER, country: "United States", century: "20th century" }, "decade")).toEqual(["1960s"]);
  });
});
