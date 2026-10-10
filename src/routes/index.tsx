import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Layers, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tickerCards, type TickerCard } from "@/lib/ticker.functions";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  loader: () => tickerCards(),
  head: () => ({
...
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
  const cards = Route.useLoaderData();
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
        <div className="panel shadow-hard overflow-hidden">
          <img src={hero} alt="Trading cards, a stamp and a coin under a scanner" className="aspect-[4/5] w-full object-cover" width={1024} height={1280} />
        </div>
      </main>
    </div>
  );
}
