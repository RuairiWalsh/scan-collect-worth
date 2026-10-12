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
