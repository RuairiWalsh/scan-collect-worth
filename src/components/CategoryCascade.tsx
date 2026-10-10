import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMPTY_STAMP_FILTER, STAMP_LEVELS, matchesStampFilter, pickStampLevel, stampOptions, type StampFilter, type StampRow } from "@/lib/stamp-filters";
import { CATEGORY_KEYS, TAXONOMY, type CategoryKey } from "@/lib/taxonomy";

export type FilterPath = { cat: CategoryKey | "all"; sub: string; line: string };

type Row = StampRow;

type Option = { key: string; label: string; count: number; active: boolean };

type Props = {
  items: Row[];
  cat: CategoryKey | "all";
  sub: string;
  line: string;
  onChange: (next: FilterPath) => void;
  stamp: StampFilter;
  onStampChange: (next: StampFilter) => void;
};

/**
 * One dropdown that walks the taxonomy: Cards › TCG › Pokémon, Sports › Baseball, …
 * Picking a level keeps the panel open so you can drill one level deeper.
 */
export function CategoryCascade({ items, cat, sub, line, onChange, stamp, onStampChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const deepest = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showSub = cat !== "all" && cat !== "stamps";
  const showLine = showSub && sub !== "all";

  // On phones the panel scrolls sideways — keep the newest level in view.
  useEffect(() => {
    if (open) deepest.current?.scrollIntoView({ block: "nearest", inline: "end" });
  }, [open, cat, sub, stamp]);

  const count = (f: Partial<FilterPath>) =>
    items.filter(
      (i) =>
        (!f.cat || f.cat === "all" || i.category === f.cat) &&
        (!f.sub || f.sub === "all" || i.subcategory === f.sub) &&
        (!f.line || f.line === "all" || i.line === f.line),
    ).length;

  const lineOptions = useMemo(() => {
    if (!showLine) return [] as string[];
    const tax = TAXONOMY[cat as CategoryKey].subcategories[sub]?.lines ?? [];
    const extra = Array.from(
      new Set(
        items
          .filter((i) => i.category === cat && i.subcategory === sub && i.line)
          .map((i) => i.line as string),
      ),
    )
      .filter((l) => !tax.includes(l))
      .sort();
    return [...tax, ...extra];
  }, [items, cat, sub, showLine]);

  const shown = cat === "stamps" ? items.filter((item) => matchesStampFilter(item, stamp)).length : count({ cat, sub, line });

  const path = useMemo(() => {
    if (cat === "all") return "All collectibles";
    const c = TAXONOMY[cat];
    if (cat === "stamps") return [c.label, ...STAMP_LEVELS.map((level) => stamp[level]).filter((v) => v !== "all")].join(" › ");
    if (sub === "all") return c.label;
    const s = c.subcategories[sub];
    const parts = [c.label, s?.label ?? sub, line === "all" ? null : line];
    return parts.filter(Boolean).join(" › ");
  }, [cat, sub, line, stamp]);

  return (
    <div ref={box} className="relative">
      <Button
        variant="outline"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-xs font-semibold transition ${
          cat === "all" ? "border-border bg-card hover:border-ink" : "border-primary bg-primary/5"
        }`}
      >
        <span className="max-w-[46vw] truncate sm:max-w-none">{path}</span>
        <span className="tabular text-[11px] font-bold text-muted-foreground">{shown}</span>
        <ChevronDown className={`size-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 flex max-w-[92vw] overflow-x-auto rounded-md border-2 border-ink bg-card shadow-hard">
          <Column
            label="Category"
            last={!showSub && cat !== "stamps"}
            options={[
              { key: "all", label: "All collectibles", count: items.length, active: cat === "all" },
              ...CATEGORY_KEYS.map((k) => ({
                key: k,
                label: TAXONOMY[k].label,
                count: count({ cat: k }),
                active: cat === k,
              })),
            ]}
            onPick={(k) => {
              onChange({ cat: k as CategoryKey | "all", sub: "all", line: "all" });
              onStampChange({ ...EMPTY_STAMP_FILTER });
              if (k === "all") setOpen(false);
            }}
          />
          {cat === "stamps" && STAMP_LEVELS.map((level, index) => {
            if (STAMP_LEVELS.slice(0, index).some((parent) => stamp[parent] === "all")) return null;
            const isLast = index === STAMP_LEVELS.length - 1 || stamp[level] === "all";
            const parent = { ...EMPTY_STAMP_FILTER };
            for (const key of STAMP_LEVELS.slice(0, index)) parent[key] = stamp[key];
            const stampCount = (filter: StampFilter) => items.filter((item) => matchesStampFilter(item, filter)).length;
            return <Column
              key={level}
              label={level.charAt(0).toUpperCase() + level.slice(1)}
              last={isLast}
              innerRef={isLast ? deepest : undefined}
              options={[
                { key: "all", label: `All ${level === "country" ? "countries" : level === "century" ? "centuries" : level === "decade" ? "decades" : "subjects"}`, count: stampCount(parent), active: stamp[level] === "all" },
                ...stampOptions(items, stamp, level).map((value) => ({ key: value, label: value, count: stampCount({ ...parent, [level]: value }), active: stamp[level] === value })),
              ]}
              onPick={(value) => {
                onStampChange(pickStampLevel(stamp, level, value));
                if (value === "all" || level === "subject") setOpen(false);
              }}
            />;
          })}
          {showSub && (
            <Column
              label="Type"
              last={!showLine}
              innerRef={showLine ? undefined : deepest}
              options={[
                { key: "all", label: `All ${TAXONOMY[cat].label}`, count: count({ cat }), active: sub === "all" },
                ...Object.entries(TAXONOMY[cat].subcategories).map(([k, v]) => ({
                  key: k,
                  label: v.label,
                  count: count({ cat, sub: k }),
                  active: sub === k,
                })),
              ]}
              onPick={(k) => {
                onChange({ cat, sub: k, line: "all" });
                if (k === "all") setOpen(false);
              }}
            />
          )}
          {showLine && (
            <Column
              label="Line"
              last
              innerRef={deepest}
              options={[
                {
                  key: "all",
                  label: `All ${TAXONOMY[cat].subcategories[sub]?.label ?? sub}`,
                  count: count({ cat, sub }),
                  active: line === "all",
                },
                ...lineOptions.map((l) => ({
                  key: l,
                  label: l,
                  count: count({ cat, sub, line: l }),
                  active: line === l,
                })),
              ]}
              onPick={(k) => {
                onChange({ cat, sub, line: k });
                setOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Column({
  label,
  options,
  onPick,
  last,
  innerRef,
}: {
  label: string;
  options: Option[];
  onPick: (key: string) => void;
  last?: boolean;
  innerRef?: RefObject<HTMLDivElement | null> | undefined;
}) {
  return (
    <div
      ref={innerRef}
      className={`w-44 shrink-0 p-1 max-h-72 overflow-y-auto ${last ? "" : "border-r-2 border-border"}`}
    >
      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <ul className="space-y-0.5">
        {options.map((o) => (
          <li key={o.key}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => onPick(o.key)}
              className={`flex w-full items-center justify-between gap-2 h-auto whitespace-normal rounded px-2 py-1.5 text-left text-xs font-semibold transition ${
                o.active ? "bg-ink text-ink-foreground" : "hover:bg-muted"
              }`}
            >
              <span>{o.label}</span>
              <span
                className={`tabular shrink-0 text-[10px] ${o.active ? "text-ink-foreground/70" : "text-muted-foreground"}`}
              >
                {o.count}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
