import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { itemsQuery } from "@/lib/items";
import { usd } from "@/lib/image";
import { CATEGORY_KEYS, TAXONOMY, conditionFor, type CategoryKey } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { ItemArtwork } from "@/components/ItemArtwork";
import { EMPTY_STAMP_FILTER, matchesStampFilter, type StampFilter } from "@/lib/stamp-filters";
import { CategoryCascade } from "@/components/CategoryCascade";
import { useOfficialImages } from "@/hooks/use-official-images";

type SortKey = "added_desc" | "added_asc" | "value_desc" | "value_asc" | "year_desc" | "year_asc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "added_desc", label: "Recently added" },
  { key: "added_asc", label: "Oldest added" },
  { key: "value_desc", label: "Value: high to low" },
  { key: "value_asc", label: "Value: low to high" },
  { key: "year_desc", label: "Release year: newest" },
  { key: "year_asc", label: "Release year: oldest" },
];

export const Route = createFileRoute("/_authenticated/collection")({
  head: () => ({
    meta: [
      { title: "My collection — Lymitz" },
      { name: "description", content: "Your cards, stamps and coins with live estimated value." },
      { property: "og:title", content: "My collection — Lymitz" },
      { property: "og:description", content: "Your cards, stamps and coins with live estimated value." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { data: items = [], isLoading } = useQuery(itemsQuery("collection"));
  useOfficialImages(items);
  const [cat, setCat] = useState<CategoryKey | "all">("all");
  const [sub, setSub] = useState<string | "all">("all");
  const [line, setLine] = useState<string | "all">("all");
  const [stamp, setStamp] = useState<StampFilter>({ ...EMPTY_STAMP_FILTER });
  const [year, setYear] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("added_desc");

  const total = items.reduce((s, i) => s + (i.est_value ?? 0) * i.quantity, 0);
  const byCat = CATEGORY_KEYS.map((k) => ({
    k,
    value: items.filter((i) => i.category === k).reduce((s, i) => s + (i.est_value ?? 0) * i.quantity, 0),
    count: items.filter((i) => i.category === k).reduce((s, i) => s + i.quantity, 0),
  }));

  const filtered = items.filter(
    (i) =>
      (cat === "all" || i.category === cat) &&
      (cat === "stamps" ? matchesStampFilter(i, stamp) : (sub === "all" || i.subcategory === sub) && (line === "all" || i.line === line)) &&
      (year === "all" || i.year === year),
  );

  const years = useMemo(
    () =>
      Array.from(
        new Set(
          filtered
            .map((i) => i.year)
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => Number(b) - Number(a)),
    [filtered],
  );

  const shown = useMemo(() => {
    const val = (i: (typeof items)[number]) => (i.est_value ?? 0) * i.quantity;
    const added = (i: (typeof items)[number]) => new Date(i.created_at).getTime();
    const yr = (i: (typeof items)[number]) => Number(i.year) || 0;
    const sorted = [...filtered];
    switch (sort) {
      case "value_desc":
        return sorted.sort((a, b) => val(b) - val(a));
      case "value_asc":
        return sorted.sort((a, b) => val(a) - val(b));
      case "year_desc":
        return sorted.sort((a, b) => yr(b) - yr(a) || val(b) - val(a));
      case "year_asc":
        return sorted.sort((a, b) => yr(a) - yr(b) || val(b) - val(a));
      case "added_asc":
        return sorted.sort((a, b) => added(a) - added(b));
      default:
        return sorted.sort((a, b) => added(b) - added(a));
    }
  }, [filtered, sort]);

  const filteredTotal = filtered.reduce((s, i) => s + (i.est_value ?? 0) * i.quantity, 0);

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
                setYear("all");
                setStamp({ ...EMPTY_STAMP_FILTER });
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

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-muted-foreground">FILTER</label>
        <CategoryCascade
          items={items}
          cat={cat}
          sub={sub}
          line={line}
          stamp={stamp}
          onStampChange={(next) => { setStamp(next); setYear("all"); }}
          onChange={(next) => {
            setCat(next.cat);
            setSub(next.sub);
            setLine(next.line);
            setYear("all");
                setStamp({ ...EMPTY_STAMP_FILTER });
          }}
        />
        <label className="ml-2 text-xs font-semibold text-muted-foreground">SORT</label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border-2 border-border bg-card px-2 py-1.5 text-xs font-semibold focus:border-ink focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {years.length > 1 && (
          <>
            <label className="ml-2 text-xs font-semibold text-muted-foreground">YEAR</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-md border-2 border-border bg-card px-2 py-1.5 text-xs font-semibold focus:border-ink focus:outline-none"
            >
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}
        {cat !== "all" && (
          <p className="tabular ml-auto text-xs font-semibold text-muted-foreground">
            {filtered.length} shown · {usd(filteredTotal)}
          </p>
        )}
      </div>

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
      ) : !shown.length ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-12 text-center">
          <p className="text-lg font-semibold">Nothing matches that filter.</p>
          <p className="text-sm text-muted-foreground">Try a different category, or show everything again.</p>
          <Button
            variant="outline"
            onClick={() => {
              setCat("all");
              setSub("all");
              setLine("all");
              setYear("all");
                setStamp({ ...EMPTY_STAMP_FILTER });
            }}
          >
            Show everything
          </Button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((i) => (
            <li key={i.id}>
              <Link to="/item/$id" params={{ id: i.id }} className="panel block overflow-hidden transition hover:shadow-hard-sm">
                <ItemArtwork item={i} className="aspect-[63/88] w-full border-b-2 border-ink" />
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
