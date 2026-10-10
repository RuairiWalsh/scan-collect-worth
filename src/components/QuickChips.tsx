import { useMemo } from "react";
import {
  EMPTY_STAMP_FILTER,
  matchesStampFilter,
  pickStampLevel,
  stampOptions,
  STAMP_LEVELS,
  type StampFilter,
  type StampRow,
} from "@/lib/stamp-filters";
import {
  COIN_LABELS,
  COIN_LEVELS,
  EMPTY_COIN_FILTER,
  matchesCoinFilter,
  pickCoinLevel,
  coinOptions,
  type CoinFilter,
  type CoinRow,
} from "@/lib/coin-filters";
import { TAXONOMY, type CategoryKey } from "@/lib/taxonomy";

type Row = StampRow & CoinRow;

type Chip = { key: string; label: string; count: number; active: boolean; onPick: () => void };

type Props = {
  items: Row[];
  cat: CategoryKey;
  sub: string;
  line: string;
  stamp: StampFilter;
  coin: CoinFilter;
  onCatChange: (cat: CategoryKey | "all") => void;
  onCardsChange: (sub: string, line: string) => void;
  onStampChange: (next: StampFilter) => void;
  onCoinChange: (next: CoinFilter) => void;
};

/**
 * One-tap chips under the filter row so phone users can hop between subtypes
 * (TCG ↔ Sports ↔ Pokémon) without opening the full cascade dropdown.
 */
export function QuickChips({ items, cat, sub, line, stamp, coin, onCatChange, onCardsChange, onStampChange, onCoinChange }: Props) {
  const countFor = (f: { cat: string; sub?: string; line?: string }) =>
    items.filter(
      (i) =>
        i.category === f.cat &&
        (!f.sub || i.subcategory === f.sub) &&
        (!f.line || i.line === f.line),
    ).length;

  const lines = useMemo(() => {
    if (cat !== "cards" || sub === "all") return [] as string[];
    const tax = TAXONOMY.cards.subcategories[sub]?.lines ?? [];
    const extra = Array.from(
      new Set(
        items
          .filter((i) => i.category === cat && i.subcategory === sub && i.line)
          .map((i) => i.line as string),
      ),
    ).filter((l) => !tax.includes(l));
    return [...tax, ...extra.sort()];
  }, [items, cat, sub]);

  const stampCount = (filter: StampFilter) => items.filter((i) => matchesStampFilter(i, filter)).length;
  const coinCount = (filter: CoinFilter) => items.filter((i) => matchesCoinFilter(i, filter)).length;

  let rows: Chip[][] = [];
  if (cat === "cards") {
    rows = [
      [
        { key: "all", label: `All ${TAXONOMY.cards.label.toLowerCase()}`, count: countFor({ cat }), active: sub === "all", onPick: () => onCardsChange("all", "all") },
        ...Object.entries(TAXONOMY.cards.subcategories).map(([k, v]) => ({
          key: k,
          label: v.label,
          count: countFor({ cat, sub: k }),
          active: sub === k && line === "all",
          onPick: () => onCardsChange(k, "all"),
        })),
      ],
    ];
    if (sub !== "all" && lines.length > 0) {
      rows.push([
        {
          key: "all",
          label: `All ${TAXONOMY.cards.subcategories[sub]?.label ?? sub}`,
          count: countFor({ cat, sub }),
          active: line === "all",
          onPick: () => onCardsChange(sub, "all"),
        },
        ...lines.map((l) => ({
          key: l,
          label: l,
          count: countFor({ cat, sub, line: l }),
          active: line === l,
          onPick: () => onCardsChange(sub, l),
        })),
      ]);
    }
  } else if (cat === "stamps") {
    rows = [];
    STAMP_LEVELS.forEach((level, index) => {
      const parents = STAMP_LEVELS.slice(0, index);
      if (parents.some((p) => stamp[p] === "all")) return;
      const base = { ...EMPTY_STAMP_FILTER };
      for (const p of parents) base[p] = stamp[p];
      const allLabel = `All ${level === "country" ? "countries" : level === "century" ? "centuries" : level === "decade" ? "decades" : "subjects"}`;
      rows.push([
        { key: "all", label: allLabel, count: stampCount(base), active: stamp[level] === "all", onPick: () => onStampChange(pickStampLevel(stamp, level, "all")) },
        ...stampOptions(items, base, level).map((value) => ({
          key: value,
          label: value,
          count: stampCount({ ...base, [level]: value }),
          active: stamp[level] === value,
          onPick: () => onStampChange(pickStampLevel(stamp, level, value)),
        })),
      ]);
    });
  } else if (cat === "coins") {
    rows = [];
    COIN_LEVELS.forEach((level, index) => {
      const parents = COIN_LEVELS.slice(0, index);
      if (parents.some((p) => coin[p] === "all")) return;
      const base = { ...EMPTY_COIN_FILTER };
      for (const p of parents) base[p] = coin[p];
      rows.push([
        { key: "all", label: COIN_LABELS[level].all, count: coinCount(base), active: coin[level] === "all", onPick: () => onCoinChange(pickCoinLevel(coin, level, "all")) },
        ...coinOptions(items, base, level).map((value) => ({
          key: value,
          label: value,
          count: coinCount({ ...base, [level]: value }),
          active: coin[level] === value,
          onPick: () => onCoinChange(pickCoinLevel(coin, level, value)),
        })),
      ]);
    });
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {row.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onPick}
              aria-pressed={chip.active}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold transition ${
                chip.active ? "border-ink bg-ink text-ink-foreground" : "border-border bg-card text-ink hover:border-ink"
              }`}
            >
              <span className="whitespace-nowrap">{chip.label}</span>
              <span className={`tabular text-[10px] ${chip.active ? "text-ink-foreground/70" : "text-muted-foreground"}`}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
