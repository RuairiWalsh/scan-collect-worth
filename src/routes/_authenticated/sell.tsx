import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { itemsQuery } from "@/lib/items";
import { usd } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemArtwork } from "@/components/ItemArtwork";

export const Route = createFileRoute("/_authenticated/sell")({
  head: () => ({
    meta: [
      { title: "Sell — Lymitz" },
      { name: "description", content: "List items from your collection for sale on the Lymitz market." },
      { property: "og:title", content: "Sell — Lymitz" },
      { property: "og:description", content: "List items from your collection for sale on the Lymitz market." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SellPage,
});

function SellPage() {
  const { isMerchant, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="font-display text-3xl font-black">Sell</h1>
      {isMerchant ? <MerchantListings /> : <ApplyForm />}
    </main>
  );
}

function ApplyForm() {
  const qc = useQueryClient();
  const [store, setStore] = useState("");
  const [about, setAbout] = useState("");
  const { data: apps = [] } = useQuery({
    queryKey: ["my-application"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_applications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("merchant_applications").insert({ store_name: store.trim(), about: about.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Application sent"); qc.invalidateQueries({ queryKey: ["my-application"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const latest = apps[0];
  if (latest?.status === "pending")
    return (
      <div className="panel mt-6 p-6">
        <h2 className="text-xl font-extrabold">Application under review</h2>
        <p className="mt-2 text-muted-foreground">We're reviewing "{latest.store_name}". You'll be able to list items here once approved.</p>
      </div>
    );
  return (
    <form className="panel mt-6 max-w-lg space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
      <h2 className="text-xl font-extrabold">Become a merchant</h2>
      <p className="text-sm text-muted-foreground">Apply to sell items from your collection on the Lymitz market. An admin will review your application.</p>
      {latest?.status === "rejected" && <p className="text-sm font-semibold text-destructive">Your last application wasn't approved. You can apply again.</p>}
      <div className="space-y-1.5">
        <Label htmlFor="store">Store name</Label>
        <Input id="store" required maxLength={80} value={store} onChange={(e) => setStore(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="about">What do you sell?</Label>
        <Textarea id="about" maxLength={1000} value={about} onChange={(e) => setAbout(e.target.value)} />
      </div>
      <Button type="submit" disabled={submit.isPending || !store.trim()}>Send application</Button>
    </form>
  );
}

function MerchantListings() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery(itemsQuery("collection"));
  const { data: listings = [] } = useQuery({
    queryKey: ["my-listings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("listings").select("*").eq("seller_id", u.user!.id).eq("status", "active");
      if (error) throw error;
      return data;
    },
  });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["my-listings"] }); qc.invalidateQueries({ queryKey: ["market"] }); };
  const list = useMutation({
    mutationFn: async ({ itemId, price }: { itemId: string; price: number }) => {
      const { error } = await supabase.from("listings").insert({ item_id: itemId, price });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Listed for sale"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const unlist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").update({ status: "removed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed from sale"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const byItem = new Map(listings.map((l) => [l.item_id, l]));

  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-muted-foreground">{listings.length} item{listings.length === 1 ? "" : "s"} listed. Set a price and tap List to put an item on the market.</p>
      {items.length === 0 && <p className="text-muted-foreground">Your collection is empty — scan something first.</p>}
      {items.map((it) => {
        const l = byItem.get(it.id);
        const val = prices[it.id] ?? (it.est_value ? String(it.est_value) : "");
        return (
          <div key={it.id} className="panel flex items-center gap-3 p-3">
            <div className="w-14 shrink-0"><ItemArtwork item={it} /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{it.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[it.set_name, it.number && `#${it.number}`].filter(Boolean).join(" · ")} · Est. {it.est_value != null ? usd(it.est_value) : "—"}
              </div>
            </div>
            {l ? (
              <div className="flex items-center gap-2">
                <span className="font-extrabold">{usd(Number(l.price))}</span>
                <Button size="sm" variant="outline" onClick={() => unlist.mutate(l.id)}>Unlist</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input aria-label={`Price for ${it.name}`} className="w-24" inputMode="decimal" placeholder="$"
                  value={val} onChange={(e) => setPrices({ ...prices, [it.id]: e.target.value })} />
                <Button size="sm" disabled={!(Number(val) > 0) || list.isPending}
                  onClick={() => list.mutate({ itemId: it.id, price: Math.round(Number(val) * 100) / 100 })}>List</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
