import { describe, expect, it } from "vitest";
import { collectionValueSeries } from "./collection-history";

const NOW = new Date("2026-10-10T12:00:00Z");

describe("collectionValueSeries", () => {
  it("returns empty with no items", () => {
    expect(collectionValueSeries([], [], NOW)).toEqual([]);
  });

  it("sums latest value per item per day, respecting quantity", () => {
    const items = [
      { id: "a", quantity: 2, created_at: "2026-10-08T10:00:00Z" },
      { id: "b", quantity: 1, created_at: "2026-10-09T10:00:00Z" },
    ];
    const events = [
      { item_id: "a", est_value: 5, recorded_at: "2026-10-08T11:00:00Z" },
      { item_id: "a", est_value: 7, recorded_at: "2026-10-10T09:00:00Z" },
      { item_id: "b", est_value: 3, recorded_at: "2026-10-09T12:00:00Z" },
    ];
    const pts = collectionValueSeries(items, events, NOW);
    expect(pts.map((p) => p.value)).toEqual([10, 13, 17]); // 2×5, +3, a→7
  });

  it("ignores items added after a day and null values", () => {
    const items = [{ id: "a", quantity: 1, created_at: "2026-10-09T10:00:00Z" }];
    const events = [{ item_id: "a", est_value: null, recorded_at: "2026-10-09T11:00:00Z" }];
    const pts = collectionValueSeries(items, events, NOW);
    expect(pts.map((p) => p.value)).toEqual([0, 0]);
  });
});
