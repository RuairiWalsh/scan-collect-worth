import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Loader2, SearchIcon } from "lucide-react";
import { searchCards, type SearchResult } from "@/lib/search.functions";
import { usd } from "@/lib/image";
import { useQuery } from "@tanstack/react-query";
import { groupListings, marketQuery } from "@/lib/market";
import { ListingCard } from "@/components/ListingCard";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Browse collectables for sale — Lymitz" },
      { name: "description", content: "Browse cards, stamps and coins for sale, newest first, and look up any item's price." },
      { property: "og:title", content: "Browse collectables for sale — Lymitz" },
      { property: "og:description", content: "Browse cards, stamps and coins for sale, newest first, and look up any item's price." },
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
    <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24">
      <h1 className="font-display text-2xl font-black">Browse Collectables</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Shop items for sale, or search any card, stamp or coin to see its price and listings.
      </p>
      <div className="relative mt-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Pikachu 025/165 or Charizard Base Set"
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

      {q.trim().length < 2 && <Carousels />}

      <ul className="mt-4 space-y-3">
        {results.map((r) => (
          <SearchResultCard key={r.catalog_id} result={r} />
        ))}
      </ul>
    </main>
  );
}

function SearchResultCard({ result: r }: { result: SearchResult }) {
  return (
    <li className="rounded-md border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--foreground)]">
      <Link to="/card/$catalogId" params={{ catalogId: r.catalog_id }} className="flex w-full items-center gap-3 p-3 text-left">
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
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.price_provider && r.price_provider !== "justtcg" ? "ungraded" : "near mint"}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function Carousels() {
  const { data = [], isLoading } = useQuery(marketQuery());
  if (isLoading) return <p className="mt-6 text-sm text-muted-foreground">Loading listings…</p>;
  if (!data.length) return <p className="mt-6 text-sm text-muted-foreground">Nothing for sale yet. Merchants' listings will show up here.</p>;
  const groups = [{ label: "Just listed", items: groupListings(data).flatMap((g) => g.items).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20) }, ...groupListings(data)];
  return (
    <div className="mt-6 space-y-8">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-2 font-display text-lg font-black">
            {g.label} <span className="text-sm font-semibold text-muted-foreground">· {g.items.length}</span>
          </h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3">
            {g.items.map((l) =>
              l.catalog_id ? (
                <Link key={l.listing_id} to="/card/$catalogId" params={{ catalogId: l.catalog_id }} className="w-40 shrink-0 snap-start">
                  <ListingCard listing={l} />
                </Link>
              ) : (
                <ListingCard key={l.listing_id} listing={l} className="w-40 shrink-0 snap-start" />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
