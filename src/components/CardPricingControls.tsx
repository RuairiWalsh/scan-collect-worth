import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { availablePrintings, cardVariants, CARD_CONDITIONS, printingLabel, resolvePrinting, selectedCardVariant, type CardVariant } from "@/lib/card-pricing";
import { usd } from "@/lib/image";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function useCardVariants(catalogId: string | null) {
  return useQuery({
    queryKey: ["card-variants", catalogId],
    enabled: Boolean(catalogId),
    queryFn: async () => {
      if (!catalogId) return [];
      const { data, error } = await supabase.from("catalog_prices").select("variants").eq("catalog_id", catalogId).maybeSingle();
      if (error) throw error;
      return cardVariants(data?.variants);
    },
    staleTime: 60_000,
  });
}
export function VariantSelect({ variants, value, onChange, className }: { variants: CardVariant[]; value: string | null; onChange: (v: string) => void; className?: string }) {
  const options = availablePrintings(variants);
  const resolved = resolvePrinting(variants, value);
  return <Select value={resolved ?? ""} onValueChange={onChange} disabled={!options.length}>
    <SelectTrigger className={className} aria-label="Card variant"><SelectValue placeholder={options.length ? "Choose variant" : "Variants unavailable"} /></SelectTrigger>
    <SelectContent>{options.map((p) => <SelectItem key={p} value={p}>{printingLabel(p)}</SelectItem>)}</SelectContent>
  </Select>;
}
export function ItemVariantSelect({ catalogId, ...props }: { catalogId: string | null; value: string | null; onChange: (v: string) => void; className?: string }) {
  const { data = [] } = useCardVariants(catalogId);
  return <VariantSelect variants={data} {...props} />;
}
export function ConditionPrices({ variants, printing }: { variants: CardVariant[]; printing: string | null }) {
  return <div className="mt-4 border-t border-border pt-3">
    <p className="mb-2 text-xs font-semibold text-muted-foreground">CONDITION PRICES{resolvePrinting(variants, printing) ? ` · ${printingLabel(resolvePrinting(variants, printing) ?? "")}` : ""}</p>
    <dl className="space-y-1 text-sm">{CARD_CONDITIONS.map((c) => <div key={c.key} className="flex justify-between gap-3"><dt>{c.label}</dt><dd className="tabular font-semibold">{selectedCardVariant(variants, c.key, printing)?.price != null ? usd(selectedCardVariant(variants, c.key, printing)?.price ?? null) : "Unavailable"}</dd></div>)}</dl>
  </div>;
}