export type ValueEvent = { item_id: string; est_value: number | null; recorded_at: string };
export type CollectionItem = { id: string; quantity: number; created_at: string };
export type CollectionPoint = { recorded_at: string; value: number };

const DAY = 24 * 60 * 60 * 1000;

function dayStart(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Total collection value over time: for each day from the earliest event to
 * today, sum the latest known value of every item that existed by then,
 * times its quantity. Items only count once added; value 0 before first price.
 */
export function collectionValueSeries(items: CollectionItem[], events: ValueEvent[], now = new Date()): CollectionPoint[] {
  if (!items.length) return [];
  const byItem = new Map<string, { t: number; v: number }[]>();
  for (const e of events) {
    if (e.est_value == null) continue;
    const list = byItem.get(e.item_id) ?? [];
    list.push({ t: new Date(e.recorded_at).getTime(), v: e.est_value });
    byItem.set(e.item_id, list);
  }
  for (const list of byItem.values()) list.sort((a, b) => a.t - b.t);

  const starts = items.map((i) => ({ id: i.id, qty: i.quantity, t: new Date(i.created_at).getTime() }));
  const firstDay = Math.min(...starts.map((s) => dayStart(new Date(s.t).toISOString())));
  const lastDay = dayStart(now.toISOString());

  const points: CollectionPoint[] = [];
  for (let day = firstDay; day <= lastDay; day += DAY) {
    const endOfDay = day + DAY - 1;
    let total = 0;
    for (const s of starts) {
      if (s.t > endOfDay) continue;
      const hist = byItem.get(s.id);
      if (!hist) continue;
      let v: number | null = null;
      for (const h of hist) {
        if (h.t <= endOfDay) v = h.v;
        else break;
      }
      if (v != null) total += v * s.qty;
    }
    points.push({ recorded_at: new Date(day).toISOString(), value: Math.round(total * 100) / 100 });
  }
  return points;
}
