import { Button } from "@/components/ui/button";
import { usd } from "@/lib/image";
import { conditionFor } from "@/lib/taxonomy";
import type { MarketListing } from "@/lib/market";

export function listingCondition(l: MarketListing) {
  return l.condition === "graded" && l.grader ? `${l.grader} ${l.grade ?? ""}`.trim() : conditionFor(l.category, l.condition).label;
}

export function ListingCard({ listing: l, className = "" }: { listing: MarketListing; className?: string }) {
  return (
    <div className={`panel flex flex-col p-3 ${className}`}>
      {l.image ? (
        <img src={l.image} alt={l.name} className="aspect-[5/7] w-full rounded object-contain" loading="lazy" />
      ) : (
        <div className="aspect-[5/7] w-full rounded bg-muted" />
      )}
      <div className="mt-2 truncate text-sm font-bold">{l.name}</div>
      <div className="truncate text-xs text-muted-foreground">
        {[l.set_name, l.number && `#${l.number}`].filter(Boolean).join(" · ") || "\u00a0"}
      </div>
      <div className="truncate text-xs font-semibold">{listingCondition(l)}</div>
      <div className="truncate text-xs text-muted-foreground">Sold by {l.store_name ?? "Merchant"}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="tabular text-lg font-extrabold">{usd(Number(l.price))}</span>
        <Button size="sm" disabled title="Checkout coming soon">Buy</Button>
      </div>
    </div>
  );
}
