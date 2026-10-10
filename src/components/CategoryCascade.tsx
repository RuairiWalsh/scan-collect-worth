import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { CATEGORY_KEYS, TAXONOMY, type CategoryKey } from "@/lib/taxonomy";

export type FilterPath = { cat: CategoryKey | "all"; sub: string; line: string };

type Row = { category: string; subcategory: string | null; line: string | null };

type Option = { key: string; label: string; count: number; active: boolean };

type Props = {
  items: Row[];
  cat: CategoryKey | "all";
  sub: string;
  line: string;
  onChange: (next: FilterPath) => void;
};

/**
 * One dropdown that walks the taxonomy: Cards › TCG › Pokémon, Sports › Baseball, …
 * Picking a level keeps the panel open so you can drill one level deeper.
 */
export function CategoryCascade({ items, cat, sub, line, onChange }: Props) {
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

  const showSub = cat !== "all";
  const showLine = showSub && sub !== "all";

  // On phones the panel scrolls sideways — keep the newest level in view.
  useEffect(() => {
    if (open) deepest.current?.scrollIntoView({ block: "nearest", inline: "end" });
  }, [open, cat, sub]);

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

  const shown = count({ cat, sub, line });

  const path = useMemo(() => {
    if (cat === "all") return "All collectibles";
    const c = TAXONOMY[cat];
    if (sub === "all") return c.label;
    const s = c.subcategories[sub];
    const parts = [c.label, s?.label ?? sub, line === "all" ? null : line];
    return parts.filter(Boolean).join(" › ");
  }, [cat, sub, line]);

  return (
    <div ref={box} className="relative">
      <button
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
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 flex max-w-[92vw] overflow-x-auto rounded-md border-2 border-ink bg-card shadow-hard">
          <Column
            label="Category"
            last={!showSub}
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
              if (k === "all") setOpen(false);
            }}
          />
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
            <button
              type="button"
              onClick={() => onPick(o.key)}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold transition ${
                o.active ? "bg-ink text-ink-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="truncate">{o.label}</span>
              <span
                className={`tabular shrink-0 text-[10px] ${o.active ? "text-ink-foreground/70" : "text-muted-foreground"}`}
              >
                {o.count}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
