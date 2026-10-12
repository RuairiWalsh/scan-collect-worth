import { describe, expect, it } from "vitest";
import { pcgsCertNo, pcgsGrade, pcgsRecent, pcgsSources } from "./pcgs";

describe("pcgs", () => {
  it("reads cert numbers and drops the holder suffix", () => {
    expect(pcgsCertNo("12345678.01")).toBe("12345678");
    expect(pcgsCertNo("#4 9")).toBeNull();
    expect(pcgsCertNo(null)).toBeNull();
  });
  it("normalizes slab grades for the PCGS API", () => {
    expect(pcgsGrade("69")).toBe("MS69");
    expect(pcgsGrade("ms 70")).toBe("MS70");
    expect(pcgsGrade("PR69")).toBe("PR69");
    expect(pcgsGrade("gem")).toBeNull();
    expect(pcgsGrade(null)).toBeNull();
  });
  it("counts only auctions from the last 12 months", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(pcgsRecent("05-2026", now)).toBe(true);
    expect(pcgsRecent("01-2023", now)).toBe(false);
  });
  it("prices from recent PCGS auction sales, with the price guide alongside", () => {
    const s = pcgsSources({ PCGSNo: "1", Grade: "MS69", PriceGuideValue: 300, AuctionList: [{ Date: "05-2026", Price: 250 }, { Date: "01-2020", Price: 9999 }] }, new Date("2026-10-12T00:00:00Z"));
    expect(s.map((x) => x.price)).toEqual([250, 300]);
  });
});

import { pcgsSalesSeries } from "./pcgs";
describe("pcgsSalesSeries", () => {
  it("groups auctions by month, oldest first", () => {
    const s = pcgsSalesSeries({ AuctionList: [{ Date: "03-2026", Price: 100 }, { Date: "01-2026", Price: 80 }, { Date: "03-2026", Price: 120 }, { Date: "01-2010", Price: 5 }] }, new Date("2026-10-01"));
    expect(s.map((p) => p.recorded_at.slice(0, 7))).toEqual(["2026-01", "2026-03"]);
    expect(s[1]?.count).toBe(2);
  });
});
