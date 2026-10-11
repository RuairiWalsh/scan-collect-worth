export type OrderStatus = "pending" | "accepted" | "declined" | "shipped" | "delivered" | "cancelled" | "refunded";

export const ORDER_LABEL: Record<OrderStatus, string> = {
  pending: "New", accepted: "Accepted", declined: "Declined", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};

/** Merchant-allowed moves; mirrors public.merchant_update_order. Delivery comes from shipping webhooks later. */
export const NEXT_STEPS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "declined"],
  accepted: ["shipped", "cancelled"],
  shipped: ["refunded"],
  delivered: [], declined: [], cancelled: [], refunded: [],
};

export const OPEN_STATUSES: OrderStatus[] = ["pending", "accepted"];
const REVENUE_STATUSES: OrderStatus[] = ["accepted", "shipped", "delivered"];

export type OrderLike = { status: string; price: number | string; created_at: string };

export function orderStats(orders: OrderLike[]) {
  const by = (s: OrderStatus[]) => orders.filter((o) => s.includes(o.status as OrderStatus));
  const revenue = by(REVENUE_STATUSES).reduce((t, o) => t + Number(o.price), 0);
  return {
    revenue: Math.round(revenue * 100) / 100,
    open: by(OPEN_STATUSES).length,
    shipped: by(["shipped"]).length,
    completed: by(["delivered"]).length,
  };
}

/** Daily cumulative revenue for the last `days` days (oldest first). */
export function revenueSeries(orders: OrderLike[], days = 30, now = new Date()) {
  const out: { date: string; value: number }[] = [];
  const counted = orders.filter((o) => REVENUE_STATUSES.includes(o.status as OrderStatus));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setUTCHours(23, 59, 59, 999); d.setUTCDate(d.getUTCDate() - i);
    const v = counted.filter((o) => new Date(o.created_at) <= d).reduce((t, o) => t + Number(o.price), 0);
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(v * 100) / 100 });
  }
  return out;
}
