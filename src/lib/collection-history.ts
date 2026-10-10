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
export function collectionValueSeries(
  items: CollectionItem[],
  events: ValueEvent[],
  now = new Date(),
  opts: { includePreAddHistory?: boolean } = {},
): CollectionPoint[] {
  if (!items.length) return [];
  const byItem = new Map<string, { t: number; v: number }[]>();
  for (const e of events) {
    if (e.est_value == null) continue;
    const list = byItem.get(e.item_id) ?? [];
    list.push({ t: new Date(e.recorded_at).getTime(), v: e.est_value });
    byItem.set(e.item_id, list);
  }
  for (const list of byItem.values()) list.sort((a, b) => a.t - b.t);

  const starts = items.map((i) => {
    const added = new Date(i.created_at).getTime();
    const firstEvent = byItem.get(i.id)?.[0]?.t;
    const t = opts.includePreAddHistory && firstEvent != null ? Math.min(added, firstEvent) : added;
    return { id: i.id, qty: i.quantity, t };
  });
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

/**
 * Drop pre-release placeholder prices: a card listed before release often sits
 * at one flat preorder price for days. Trim that leading flat run (3+ points)
 * so history starts when real sales begin.
 */
export function trimPresale<T extends { nm_price: number | null }>(sorted: T[]): T[] {
  let run = 1;
  while (run < sorted.length && sorted[run]!.nm_price === sorted[0]!.nm_price) run++;
  return run >= 3 && run < sorted.length ? sorted.slice(run) : sorted;
}

export type CatalogPoint = { catalog_id: string; nm_price: number | null; recorded_at: string };

/**
 * Turn a card's market history into value events for one owned copy, scaled so
 * the latest market point equals the copy's current value (keeps its condition
 * and variant ratio). Lets migrated collections show their past growth.
 */
export function catalogValueEvents(
  items: { id: string; catalog_id: string | null; est_value: number | null }[],
  history: CatalogPoint[],
): ValueEvent[] {
  const byCard = new Map<string, CatalogPoint[]>();
  for (const h of history) {
    if (h.nm_price == null || h.nm_price <= 0) continue;
    const list = byCard.get(h.catalog_id) ?? [];
    list.push(h);
    byCard.set(h.catalog_id, list);
  }
  const out: ValueEvent[] = [];
  for (const it of items) {
    if (!it.catalog_id || it.est_value == null) continue;
    const raw = byCard.get(it.catalog_id);
    if (!raw?.length) continue;
    raw.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const list = trimPresale(raw);
    const ratio = it.est_value / list[list.length - 1]!.nm_price!;
    for (const h of list) {
      out.push({ item_id: it.id, est_value: Math.round(h.nm_price! * ratio * 100) / 100, recorded_at: h.recorded_at });
    }
  }
  return out;
}
