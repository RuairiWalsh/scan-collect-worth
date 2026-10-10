import { usd } from "@/lib/image";

export type SparkPoint = { recorded_at: string; value: number | null };

/** Compact price-history line chart shared by the item page and card search. */
export function PriceSparkline({ points, emptyHint, tall = false }: { points: SparkPoint[]; emptyHint: string; tall?: boolean }) {
  const pts = points.filter((p) => p.value != null);
  if (pts.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">{emptyHint}</p>;
  }
  const W = 260,
    H = tall ? 180 : 90,
    PAD = 6;
  const vals = pts.map((p) => p.value as number);
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value as number).toFixed(1)}`)
    .join(" ");
  const first = pts[0]!,
    last = pts[pts.length - 1]!;
  const delta = (last.value as number) - (first.value as number);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <p className="tabular text-xs text-muted-foreground">PRICE HISTORY</p>
        {pts.length > 1 && (
          <p
            className={`tabular text-xs font-semibold ${delta > 0 ? "text-secondary" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {delta > 0 ? "+" : ""}
            {usd(delta)} since {fmtDate(first.recorded_at)}
          </p>
        )}
      </div>
      {pts.length === 1 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          First recorded {fmtDate(first.recorded_at)} — check back later to see the trend.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Price history chart">
            <path
              d={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {pts.map((p, i) => (
              <circle
                key={p.recorded_at}
                cx={x(i)}
                cy={y(p.value as number)}
                r="3"
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth="1.5"
              />
            ))}
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtDate(first.recorded_at)}</span>
            <span>{fmtDate(last.recorded_at)}</span>
          </div>
        </>
      )}
    </div>
  );
}
