import { describe, it, expect } from "vitest";
import { NEXT_STEPS, orderStats, revenueSeries } from "./orders";

describe("order rules", () => {
  it("new orders can only be accepted or declined", () => {
    expect(NEXT_STEPS.pending).toEqual(["accepted", "declined"]);
  });
  it("accepted orders can be shipped or cancelled", () => {
    expect(NEXT_STEPS.accepted).toEqual(["shipped", "cancelled"]);
  });
  it("shipped orders can be refunded", () => {
    expect(NEXT_STEPS.shipped).toEqual(["refunded"]);
  });
  it("revenue excludes declined, cancelled and refunded orders", () => {
    const s = orderStats([
      { status: "accepted", price: 10, created_at: "2026-10-01" },
      { status: "shipped", price: "5.5", created_at: "2026-10-01" },
      { status: "declined", price: 100, created_at: "2026-10-01" },
      { status: "refunded", price: 100, created_at: "2026-10-01" },
      { status: "pending", price: 7, created_at: "2026-10-01" },
    ]);
    expect(s.revenue).toBe(15.5);
    expect(s.open).toBe(2);
  });
  it("revenue series is cumulative", () => {
    const s = revenueSeries([{ status: "accepted", price: 4, created_at: "2026-10-09T12:00:00Z" }], 3, new Date("2026-10-10T12:00:00Z"));
    expect(s.map((p) => p.value)).toEqual([0, 4, 4]);
  });
});
