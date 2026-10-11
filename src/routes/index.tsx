import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Layers, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tickerCards, type TickerCard } from "@/lib/ticker.functions";
import hero from "@/assets/celebration-pikachu.jpg.asset.json";
import { featuredCard } from "@/lib/featured-card.functions";

export const Route = createFileRoute("/")({
  // A failed price lookup must never blank the landing page — fall back to the sample ticker.
  loader: async () => {
    try {
      const [cards, featured] = await Promise.all([tickerCards().catch(() => [] as TickerCard[]), featuredCard().catch(() => null)]);
      return { cards, featured };
    } catch {
      return { cards: [] as TickerCard[], featured: null };
    }
  },
  head: () => ({
    meta: [
      { title: "Lymitz — Live scanner for cards, stamps & coins" },
      {
        name: "description",
        content: "Point your camera at TCG, sports cards, stamps or coins. Lymitz identifies them and tracks real market value.",
      },
      { property: "og:title", content: "Lymitz — Live scanner for cards, stamps & coins" },
      { property: "og:description", content: "Scan collectibles in batches and see what your whole collection is worth." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FALLBACK_TICKER = [
  "CHARIZARD BASE 4/102 · $412.00 ▲",
  "1952 TOPPS MANTLE · PSA 3 · $38,500 ▲",
  "INVERTED JENNY · SCOTT C3a · $1.35M",
  "1909-S VDB CENT · VF · $1,240 ▼",
  "BLACK LOTUS · ALPHA · $28,000 ▲",
  "LUKA ROOKIE PRIZM · PSA 10 · $1,890 ▼",
  "1893-S MORGAN · XF · $9,800 ▲",
];

function tickerLabel(c: TickerCard): string {
  const parts = [c.name.toUpperCase()];
  if (c.setName) parts.push(c.setName.toUpperCase());
  if (c.number) parts.push(`#${c.number}`);
  return `${parts.join(" · ")} · $${c.price.toFixed(2)}`;
}

function Index() {
  const { cards, featured } = Route.useLoaderData();
  const items = cards.length > 0 ? cards.map(tickerLabel) : FALLBACK_TICKER;
  return (
    <div className="min-h-screen bg-background">
      <div className="overflow-hidden border-b-2 border-ink bg-ink py-2 text-ink-foreground">
        <div className="animate-ticker flex w-max gap-10 whitespace-nowrap tabular text-xs">
          {[...items, ...items].map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-2xl font-black tracking-tight">
          LYM<span className="text-primary">ITZ</span>
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 md:grid-cols-2">
        <div>
          <p className="tabular mb-4 inline-block rounded border-2 border-ink bg-card px-2 py-1 text-xs">
            CARDS · STAMPS · COINS
          </p>
          <h1 className="font-display text-5xl font-black leading-[0.95] md:text-7xl">
            Scan it.
            <br />
            Know what
            <br />
            it's <span className="text-primary">worth.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Point your camera at a stack of collectibles. We identify each one, drop it into a batch,
            and price it against live market data.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start scanning</Link>
            </Button>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-4 text-sm">
            {[
              { icon: ScanLine, t: "Live scanner" },
              { icon: Layers, t: "Batch review" },
              { icon: TrendingUp, t: "Market prices" },
            ].map(({ icon: Icon, t }) => (
              <div key={t} className="flex items-center gap-2 font-semibold">
                <Icon className="size-4 text-secondary" /> {t}
              </div>
            ))}
          </div>
        </div>
        <div>
          <img src={hero.url} alt="Official Pikachu 036/128 — ME: 30th Celebration Pokémon card" className="mx-auto h-auto w-full max-w-sm object-contain" width={733} height={1024} />
          <div className="mt-5 flex items-end justify-between gap-4 border-t-2 border-ink pt-4">
            <div>
              <p className="font-display text-lg font-bold">Pikachu · 036/128</p>
              <p className="text-sm text-muted-foreground">ME: 30th Celebration · Near Mint · Holofoil</p>
              <p className="mt-1 text-xs text-muted-foreground">JustTCG · Updated {featured?.updatedAt ? new Date(featured.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}</p>
            </div>
            <p className="tabular shrink-0 text-3xl font-bold">{featured?.price != null ? `$${featured.price.toFixed(2)}` : "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">USD</span></p>
          </div>
        </div>
      </main>
    </div>
  );
}
