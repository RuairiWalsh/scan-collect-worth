import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, SearchIcon } from "lucide-react";
import { catalogPriceHistory, searchCards, type CatalogHistoryPoint, type SearchResult } from "@/lib/search.functions";
import { usd } from "@/lib/image";
import { PriceSparkline } from "@/components/PriceSparkline";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Card price search — Lymitz" },
      { name: "description", content: "Look up the current price of any trading card without scanning it." },
      { property: "og:title", content: "Card price search — Lymitz" },
      { property: "og:description", content: "Look up the current price of any trading card without scanning it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const search = useServerFn(searchCards);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const { results: r } = await search({ data: { q: query } });
        setResults(r);
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, search]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
      <h1 className="font-display text-2xl font-black">Card price search</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Look up any trading card's current price — no scanning needed.
      </p>
      <div className="relative mt-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Pikachu 025/165 or Charizard Base Set"
          autoFocus
          className="w-full rounded-md border-2 border-foreground bg-background py-3 pl-10 pr-4 text-sm font-medium shadow-[4px_4px_0_0_var(--foreground)] outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {searching && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No cards found. Try the exact card name, or add the set or card number.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {results.map((r) => (
          <SearchResultCard key={r.catalog_id} result={r} />
        ))}
      </ul>
    </main>
  );
}

function SearchResultCard({ result: r }: { result: SearchResult }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<CatalogHistoryPoint[] | null>(null);
  const loadHistory = useServerFn(catalogPriceHistory);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && history === null) {
      try {
        const { history: h } = await loadHistory({ data: { catalog_id: r.catalog_id } });
        setHistory(h);
      } catch {
        setHistory([]);
      }
    }
  }

  return (
    <li className="rounded-md border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--foreground)]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {r.image ? (
          <img src={r.image} alt={r.name} className="h-20 w-14 rounded-sm border border-foreground object-cover" />
        ) : (
          <div className="flex h-20 w-14 items-center justify-center rounded-sm border border-foreground bg-muted text-[10px] text-muted-foreground">
            No image
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[r.set_name, r.number ? `#${r.number}` : null, r.rarity].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-black text-primary">
            {r.nm_price != null ? usd(r.nm_price) : "—"}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">near mint</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t-2 border-foreground px-3 pb-3">
          {history === null ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading price history…
            </div>
          ) : (
            <PriceSparkline
              points={history.map((h) => ({ recorded_at: h.recorded_at, value: h.nm_price }))}
              emptyHint="No price history yet for this card — it builds up each day its price is checked."
            />
          )}
        </div>
      )}
    </li>
  );
}
