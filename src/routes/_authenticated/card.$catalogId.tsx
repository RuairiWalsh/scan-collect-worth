import { trimPresale } from "@/lib/collection-history";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { catalogCardDetail } from "@/lib/search.functions";
import { usd } from "@/lib/image";
import { PriceSparkline } from "@/components/PriceSparkline";
import { useState } from "react";
import { ConditionSelect } from "@/components/ConditionSelect";
import { ConditionPrices, VariantSelect } from "@/components/CardPricingControls";
import { resolvePrinting, selectedCardVariant } from "@/lib/card-pricing";
import { marketQuery } from "@/lib/market";
import { ListingCard } from "@/components/ListingCard";

export const Route = createFileRoute("/_authenticated/card/$catalogId")({
  head: () => ({
    meta: [
      { title: "Card details & price history — Lymitz" },
      { name: "description", content: "Full card artwork, condition and variant market prices, and price history." },
      { property: "og:title", content: "Card details & price history — Lymitz" },
      { property: "og:description", content: "Full card artwork, condition and variant market prices, and price history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CardPage,
});

function CardPage() {
  const { catalogId } = Route.useParams();
  const [condition, setCondition] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const fetchDetail = useServerFn(catalogCardDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-card", catalogId],
    queryFn: () => fetchDetail({ data: { catalog_id: catalogId } }),
  });
  const variants = data?.card?.variants ?? [];
  const resolvedCondition = condition ?? (data?.card?.price_provider === "justtcg" ? "raw_nm" : "raw_ungraded");
  const resolved = resolvePrinting(variants, printing);
  const selected = selectedCardVariant(variants, resolvedCondition, printing);
  // Saved historical series is NM/base only; never relabel it as another quality.
  const baseHistory = (resolvedCondition === "raw_nm" || resolvedCondition === "raw_ungraded") && resolved === resolvePrinting(variants, null);
  const points = baseHistory ? trimPresale(data?.history ?? []).map((h) => ({ recorded_at: h.recorded_at, value: h.nm_price })) : (selected?.priceHistory ?? []).map((p) => ({ recorded_at: new Date(p.t * 1000).toISOString(), value: p.p }));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
      <Link to="/search" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Browse Collectables
      </Link>
      {isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading card…
        </div>
      ) : !data?.card ? (
        <p className="mt-8 text-sm text-muted-foreground">Card not found.</p>
      ) : (
        <>
          <div className="mx-auto mt-4 w-full max-w-sm">
            {side === "back" && data.card.back_image ? (
              <img
                src={data.card.back_image}
                alt={`Back of ${data.card.name}`}
                className="aspect-[63/88] w-full rounded-md border-2 border-foreground bg-muted object-contain shadow-[4px_4px_0_0_var(--foreground)]"
              />
            ) : data.card.image ? (
              <img
                src={data.card.image}
                alt={data.card.name}
                className="w-full rounded-md border-2 border-foreground object-contain shadow-[4px_4px_0_0_var(--foreground)]"
              />
            ) : (
              <div className="flex aspect-[63/88] items-center justify-center rounded-md border-2 border-foreground bg-muted text-sm text-muted-foreground">
                No image
              </div>
            )}
            {data.card.back_image && (
              <div className="mt-2 flex justify-center gap-2">
                <Button size="sm" variant={side === "front" ? "default" : "outline"} aria-pressed={side === "front"} onClick={() => setSide("front")}>Front</Button>
                <Button size="sm" variant={side === "back" ? "default" : "outline"} aria-pressed={side === "back"} onClick={() => setSide("back")}>Back</Button>
              </div>
            )}
          </div>
          <h1 className="mt-6 font-display text-2xl font-black">{data.card.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[data.card.set_name, data.card.number ? `#${data.card.number}` : null, data.card.rarity]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-4 rounded-md border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--foreground)]">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><p className="text-xs font-semibold">Variant</p><VariantSelect variants={variants} value={printing} onChange={setPrinting} /></div>
              <div className="space-y-1"><p className="text-xs font-semibold">Condition</p><ConditionSelect category="cards" subcategory={data.card.price_provider === "cardsight" ? "sports" : null} value={resolvedCondition} onChange={setCondition} /></div>
            </div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Market price</p>
            {data.card.price_provider === "cardsight" && <p className="text-xs text-muted-foreground">CardSight · completed sales · USD</p>}
            {data.card.price_status === "failed" && <p className="text-xs text-destructive">{variants.length ? "Latest price check unavailable; showing the last saved price." : "No exact price match available yet; daily checks will retry."}</p>}
            {data.card.price_status === "pending" && <p className="text-xs text-muted-foreground">Awaiting daily price check.</p>}
            {data.card.price_status === "no_comps" && <p className="text-xs text-muted-foreground">No matching sale prices available yet.</p>}
            <p className="font-display text-3xl font-black text-primary">
              {usd(selected?.price ?? null)}
            </p>
            {!selected && <p className="text-xs text-muted-foreground">No market price for this condition and variant.</p>}
            <PriceSparkline
              tall
              points={points}
              emptyHint="No price history available for this condition and variant."
            />
            <ConditionPrices variants={variants} printing={printing} />
          </div>
          <CardListings catalogId={catalogId} />
        </>
      )}
    </main>
  );
}

function CardListings({ catalogId }: { catalogId: string }) {
  const { data = [] } = useQuery(marketQuery());
  const forSale = data.filter((l) => l.catalog_id === catalogId).sort((a, b) => Number(a.price) - Number(b.price));
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-black">For sale <span className="text-sm font-semibold text-muted-foreground">· {forSale.length}</span></h2>
      {forSale.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No one is selling this card right now.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {forSale.map((l) => <ListingCard key={l.listing_id} listing={l} />)}
        </div>
      )}
    </section>
  );
}
