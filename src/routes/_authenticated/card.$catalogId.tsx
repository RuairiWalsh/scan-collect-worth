import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { catalogCardDetail } from "@/lib/search.functions";
import { usd } from "@/lib/image";
import { PriceSparkline } from "@/components/PriceSparkline";

export const Route = createFileRoute("/_authenticated/card/$catalogId")({
  head: () => ({
    meta: [
      { title: "Card details & price history — Lymitz" },
      { name: "description", content: "Full card artwork, near-mint price and price history." },
      { property: "og:title", content: "Card details & price history — Lymitz" },
      { property: "og:description", content: "Full card artwork, near-mint price and price history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CardPage,
});

function CardPage() {
  const { catalogId } = Route.useParams();
  const fetchDetail = useServerFn(catalogCardDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-card", catalogId],
    queryFn: () => fetchDetail({ data: { catalog_id: catalogId } }),
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
      <Link to="/search" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Link>
      {isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading card…
        </div>
      ) : !data?.card ? (
        <p className="mt-8 text-sm text-muted-foreground">Card not found.</p>
      ) : (
        <>
          {data.card.image ? (
            <img
              src={data.card.image}
              alt={data.card.name}
              className="mx-auto mt-4 w-full max-w-sm rounded-md border-2 border-foreground object-contain shadow-[4px_4px_0_0_var(--foreground)]"
            />
          ) : (
            <div className="mx-auto mt-4 flex aspect-[63/88] w-full max-w-sm items-center justify-center rounded-md border-2 border-foreground bg-muted text-sm text-muted-foreground">
              No image
            </div>
          )}
          <h1 className="mt-6 font-display text-2xl font-black">{data.card.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[data.card.set_name, data.card.number ? `#${data.card.number}` : null, data.card.rarity]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-4 rounded-md border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--foreground)]">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Near mint price</p>
            <p className="font-display text-3xl font-black text-primary">
              {data.card.nm_price != null ? usd(data.card.nm_price) : "—"}
            </p>
            <PriceSparkline
              tall
              points={data.history.map((h) => ({ recorded_at: h.recorded_at, value: h.nm_price }))}
              emptyHint="No price history available for this card yet."
            />
          </div>
        </>
      )}
    </main>
  );
}
