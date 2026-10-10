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

import { catalogValueEvents as cve, collectionValueSeries as cvs } from "./collection-history";
describe("migrated history", () => {
  it("scales market history to the copy's value and shows it before the add date", () => {
    const ev = cve([{ id: "a", catalog_id: "c", est_value: 4 }], [
      { catalog_id: "c", nm_price: 1, recorded_at: "2026-01-01T00:00:00Z" },
      { catalog_id: "c", nm_price: 2, recorded_at: "2026-01-03T00:00:00Z" },
    ]);
    expect(ev.map((e) => e.est_value)).toEqual([2, 4]);
    const pts = cvs([{ id: "a", quantity: 1, created_at: "2026-01-03T00:00:00Z" }], ev, new Date("2026-01-03T12:00:00Z"), { includePreAddHistory: true });
    expect(pts.map((p) => p.value)).toEqual([2, 2, 4]);
  });
});
