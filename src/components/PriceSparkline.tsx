import { useRef, useState } from "react";
import { usd } from "@/lib/image";

export type SparkPoint = { recorded_at: string; value: number | null };

/** Price-history line chart with touch/pointer scrubbing, like a stock app. */
const RANGES = [
  { key: "1D", days: 1 },
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "All", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/** Points within the last `days` days, plus the last point before that so the line starts at the window edge. */
export function pointsInRange(points: SparkPoint[], days: number, now = Date.now()): SparkPoint[] {
  const pts = points.filter((p) => p.value != null);
  if (!Number.isFinite(days)) return pts;
  const cutoff = now - days * 86400000;
  const i = pts.findIndex((p) => new Date(p.recorded_at).getTime() >= cutoff);
  if (i === -1) return pts.slice(-1);
  return i > 0 ? pts.slice(i - 1) : pts;
}

export function PriceSparkline({ points, emptyHint, tall = false }: { points: SparkPoint[]; emptyHint: string; tall?: boolean }) {
  const [range, setRange] = useState<RangeKey>("1W");
  const pts = pointsInRange(points, RANGES.find((r) => r.key === range)!.days);
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (pts.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">{emptyHint}</p>;
  }
  const rangeBar = (
    <div className="mt-2 flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => setRange(r.key)}
          className={`tabular flex-1 rounded border-2 px-1 py-0.5 text-xs font-bold ${range === r.key ? "border-ink bg-ink text-ink-foreground" : "border-transparent text-muted-foreground hover:border-ink"}`}
        >
          {r.key}
        </button>
      ))}
    </div>
  );

  const W = 1000,
    H = tall ? 360 : 180,
    PAD = 12;
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
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const shown = active != null ? pts[active]! : last;
  const shownIdx = active != null ? active : pts.length - 1;

  const scrubTo = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(frac * (pts.length - 1)));
  };

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
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="tabular text-sm font-bold">{usd(shown.value as number)}</p>
            <p className="tabular text-xs text-muted-foreground">{fmtDate(shown.recorded_at)}</p>
          </div>
          <div
            ref={wrapRef}
            className="relative touch-none select-none"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              scrubTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0 || e.pointerType === "touch") scrubTo(e.clientX);
            }}
            onPointerUp={() => setActive(null)}
            onPointerCancel={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Price history chart">
              <path
                d={line}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {active != null && (
                <>
                  <line
                    x1={x(shownIdx)}
                    y1={PAD}
                    x2={x(shownIdx)}
                    y2={H - PAD}
                    stroke="var(--foreground)"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                    opacity="0.4"
                  />
                  <circle
                    cx={x(shownIdx)}
                    cy={y(shown.value as number)}
                    r="12"
                    fill="var(--primary)"
                    stroke="var(--background)"
                    strokeWidth="4"
                  />
                </>
              )}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtDate(first.recorded_at)}</span>
            <span>{fmtDate(last.recorded_at)}</span>
          </div>
        </>
      )}
      {rangeBar}
    </div>
  );
}
