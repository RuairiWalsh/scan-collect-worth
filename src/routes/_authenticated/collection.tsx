import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { itemsQuery } from "@/lib/items";
import { usd } from "@/lib/image";
import { CATEGORY_KEYS, TAXONOMY, conditionFor, type CategoryKey } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/collection")({
  head: () => ({
    meta: [
      { title: "My collection — Vaultscan" },
      { name: "description", content: "Your cards, stamps and coins with live estimated value." },
      { property: "og:title", content: "My collection — Vaultscan" },
      { property: "og:description", content: "Your cards, stamps and coins with live estimated value." },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { data: items = [], isLoading } = useQuery(itemsQuery("collection"));
  const [cat, setCat] = useState<CategoryKey | "all">("all");
  const [sub, setSub] = useState<string | "all">("all");
  const [line, setLine] = useState<string | "all">("all");

  const total = items.reduce((s, i) => s + (i.est_value ?? 0) * i.quantity, 0);
  const byCat = CATEGORY_KEYS.map((k) => ({
    k,
    value: items.filter((i) => i.category === k).reduce((s, i) => s + (i.est_value ?? 0) * i.quantity, 0),
    count: items.filter((i) => i.category === k).reduce((s, i) => s + i.quantity, 0),
  }));

  const lines = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => (cat === "all" || i.category === cat) && (sub === "all" || i.subcategory === sub))
            .map((i) => i.line)
            .filter(Boolean) as string[],
        ),
      ),
    [items, cat, sub],
  );

  const shown = items.filter(
    (i) =>
      (cat === "all" || i.category === cat) &&
      (sub === "all" || i.subcategory === sub) &&
      (line === "all" || i.line === line),
  );

  const chip = (active: boolean) =>
    `rounded-full border-2 px-3 py-1 text-xs font-semibold transition ${
      active ? "border-ink bg-ink text-ink-foreground" : "border-border bg-card hover:border-ink"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <section className="panel shadow-hard grid gap-6 p-6 md:grid-cols-[1.2fr_2fr]">
        <div>
          <p className="tabular text-xs text-muted-foreground">TOTAL COLLECTION VALUE</p>
          <p className="tabular mt-1 text-4xl font-bold md:text-5xl">{usd(total)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.reduce((s, i) => s + i.quantity, 0)} items
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {byCat.map(({ k, value, count }) => (
            <button
              key={k}
              onClick={() => {
                setCat(cat === k ? "all" : k);
                setSub("all");
                setLine("all");
              }}
              className={`rounded-md border-2 p-3 text-left transition ${cat === k ? "border-primary bg-primary/5" : "border-border hover:border-ink"}`}
            >
              <p className="text-xs font-semibold text-muted-foreground">{TAXONOMY[k].label}</p>
              <p className="tabular mt-1 text-lg font-bold">{usd(value)}</p>
              <p className="text-xs text-muted-foreground">{count} items</p>
            </button>
          ))}
        </div>
      </section>

      {cat !== "all" && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button className={chip(sub === "all")} onClick={() => { setSub("all"); setLine("all"); }}>
            All {TAXONOMY[cat].label}
          </button>
          {Object.entries(TAXONOMY[cat].subcategories).map(([k, v]) => (
            <button key={k} className={chip(sub === k)} onClick={() => { setSub(k); setLine("all"); }}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      {cat !== "all" && lines.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={chip(line === "all")} onClick={() => setLine("all")}>All lines</button>
          {lines.map((l) => (
            <button key={l} className={chip(line === l)} onClick={() => setLine(l)}>{l}</button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Loading…</p>
      ) : !items.length ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-12 text-center">
          <p className="text-lg font-semibold">Your vault is empty.</p>
          <p className="text-sm text-muted-foreground">Scan your first card, stamp or coin to get started.</p>
          <Button asChild>
            <Link to="/scan"><ScanLine /> Open scanner</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((i) => (
            <li key={i.id}>
              <Link to="/item/$id" params={{ id: i.id }} className="panel block overflow-hidden transition hover:shadow-hard-sm">
                {i.thumbnail ? (
                  <img src={i.thumbnail} alt={i.name} loading="lazy" className="aspect-square w-full border-b-2 border-ink object-cover" />
                ) : (
                  <div className="aspect-square w-full border-b-2 border-ink bg-muted" />
                )}
                <div className="p-3">
                  <p className="truncate font-semibold">{i.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[i.line, i.set_name].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {i.condition === "graded" && i.grader ? `${i.grader} ${i.grade ?? ""}` : conditionFor(i.category, i.condition).label}
                    </span>
                    <span className="tabular text-sm font-bold">{usd(i.est_value)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
