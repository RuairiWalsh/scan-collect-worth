import { describe, expect, it } from "vitest";
import { parseStampNumber, stampMatchKey, parseStampCatalogId } from "./stamp-catalog";

describe("stamp catalog", () => {
  it("treats US/USA/United States as the same country", () => {
    const a = stampMatchKey({ country: "US", year: "1932", name: "Washington", denomination: "3c" });
    const b = stampMatchKey({ country: "United States", year: "1932", name: "washington", denomination: "3C" });
    expect(a).toBe(b);
  });
  it("keeps different face values apart", () => {
    expect(stampMatchKey({ country: "US", year: "1932", name: "Washington", denomination: "2c" }))
      .not.toBe(stampMatchKey({ country: "US", year: "1932", name: "Washington", denomination: "3c" }));
  });
  it("won't share a stamp without a country and year", () => {
    expect(stampMatchKey({ country: "world", year: "1932", name: "Queen", denomination: null })).toBeNull();
    expect(stampMatchKey({ country: "Canada", year: null, name: "Queen", denomination: null })).toBeNull();
  });
  it("reads catalog numbers, defaulting to Scott", () => {
    expect(parseStampNumber("Scott #704")).toEqual({ system: "scott", number: "704" });
    expect(parseStampNumber("704")).toEqual({ system: "scott", number: "704" });
    expect(parseStampNumber("SG 1")).toEqual({ system: "sg", number: "1" });
    expect(parseStampNumber("no idea")).toBeNull();
  });
  it("parses stamp catalog ids only", () => {
    expect(parseStampCatalogId("stamp:3b86c07a-ed41-4558-abc2-55d41bf72b62")).toBe("3b86c07a-ed41-4558-abc2-55d41bf72b62");
    expect(parseStampCatalogId("numista:1")).toBeNull();
  });
});
