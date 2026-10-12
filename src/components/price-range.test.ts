import { describe, expect, it } from "vitest";
import { pointsInRange, defaultRange } from "./PriceSparkline";

const now = Date.parse("2026-10-10T12:00:00Z");
const day = (d: number, v: number) => ({ recorded_at: new Date(now - d * 86400000).toISOString(), value: v });
const pts = [day(40, 50), day(10, 5), day(6, 4), day(1, 3)];

describe("pointsInRange", () => {
  it("1W keeps the last 7 days plus the point just before, ignoring the early drop", () => {
    expect(pointsInRange(pts, 7, now).map((p) => p.value)).toEqual([5, 4, 3]);
  });
  it("All keeps everything", () => {
    expect(pointsInRange(pts, Infinity, now)).toHaveLength(4);
  });
});

describe("defaultRange", () => {
  it("picks the smallest range with at least 2 points", () => {
    expect(defaultRange(pts, now)).toBe("1D");
  });
  it("widens past 1W when sales are sparse (weekly sports sales)", () => {
    const sparse = [day(300, 2), day(200, 3), day(100, 4), day(20, 5)];
    expect(defaultRange(sparse, now)).toBe("1M");
  });
  it("falls back to All when only one point exists at all", () => {
    expect(defaultRange([day(400, 9)], now)).toBe("All");
  });
});

import { dailyPoints, availableRanges } from "./PriceSparkline";
describe("coin trend building", () => {
  it("two checks on the same day count as one point with no ranges", () => {
    const pts = dailyPoints([
      { recorded_at: "2026-10-12T10:00:00Z", value: 30 },
      { recorded_at: "2026-10-12T19:00:00Z", value: 31 },
    ]);
    expect(pts.length).toBe(1);
    expect(availableRanges(pts)).toEqual([]);
  });
  it("a week of history unlocks the week view", () => {
    const pts = [{ recorded_at: "2026-10-01T03:00:00Z", value: 30 }, { recorded_at: "2026-10-08T03:00:00Z", value: 32 }];
    expect(availableRanges(pts)).toEqual(["1W", "All"]);
  });
});
