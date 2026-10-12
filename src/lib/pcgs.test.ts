import { describe, expect, it } from "vitest";
import { pcgsCertNo, pcgsRecent, pcgsSources } from "./pcgs";

describe("pcgs", () => {
  it("reads cert numbers and drops the holder suffix", () => {
    expect(pcgsCertNo("12345678.01")).toBe("12345678");
    expect(pcgsCertNo("#4 9")).toBeNull();
    expect(pcgsCertNo(null)).toBeNull();
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
