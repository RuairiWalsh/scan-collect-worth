import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usd } from "@/lib/image";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({
    meta: [
      { title: "Market — Lymitz" },
      { name: "description", content: "Browse cards, stamps and coins listed for sale by Lymitz merchants." },
      { property: "og:title", content: "Market — Lymitz" },
      { property: "og:description", content: "Browse cards, stamps and coins listed for sale by Lymitz merchants." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketPage,
});

function MarketPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["market"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("market_listings");
      if (error) throw error;
      return data;
    },
  });
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="font-display text-3xl font-black">Market</h1>
      <p className="mt-1 text-sm text-muted-foreground">Items for sale from approved merchants.</p>
      {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {!isLoading && data.length === 0 && <p className="mt-6 text-muted-foreground">Nothing listed yet.</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.map((l) => (
          <div key={l.listing_id} className="panel flex flex-col p-3">
            {l.image ? (
              <img src={l.image} alt={l.name} className="aspect-[5/7] w-full rounded object-contain" loading="lazy" />
            ) : (
              <div className="aspect-[5/7] w-full rounded bg-muted" />
            )}
            <div className="mt-2 truncate font-bold">{l.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[l.set_name, l.number && `#${l.number}`].filter(Boolean).join(" · ")}
            </div>
            <div className="truncate text-xs text-muted-foreground">Sold by {l.store_name ?? "Merchant"}</div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-lg font-extrabold">{usd(Number(l.price))}</span>
              <Button size="sm" disabled title="Checkout coming soon">Buy</Button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
