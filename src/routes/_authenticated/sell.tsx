import { createFileRoute, Link } from "@tanstack/react-router";
import { conditionFor } from "@/lib/taxonomy";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { NEXT_STEPS, OPEN_STATUSES, ORDER_LABEL, orderStats, revenueSeries, type OrderStatus } from "@/lib/orders";

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
      <h1 className="font-display text-3xl font-black">{isMerchant ? "Seller portal" : "Sell"}</h1>
      {isMerchant ? (
        <Tabs defaultValue="overview" className="mt-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><SellerOverview /></TabsContent>
          <TabsContent value="orders"><SellerOrders /></TabsContent>
          <TabsContent value="listings"><MerchantListings /></TabsContent>
        </Tabs>
      ) : <ApplyForm />}
    </main>
  );
}

const myOrdersQuery = {
  queryKey: ["my-orders"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("orders").select("*")
      .eq("seller_id", u.user!.id).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

const myActiveListingsQuery = {
  queryKey: ["my-listings"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("listings").select("*").eq("seller_id", u.user!.id).eq("status", "active");
    if (error) throw error;
    return data;
  },
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function SellerOverview() {
  const { data: orders = [] } = useQuery(myOrdersQuery);
  const { data: listings = [] } = useQuery(myActiveListingsQuery);
  const s = orderStats(orders);
  const series = revenueSeries(orders, 30);
  const listedValue = listings.reduce((t, l) => t + Number(l.price), 0);
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenue" value={usd(s.revenue)} />
        <Stat label="Open orders" value={s.open} />
        <Stat label="Shipped" value={s.shipped} />
        <Stat label="Completed" value={s.completed} />
        <Stat label="Active listings" value={listings.length} />
        <Stat label="Listed value" value={usd(listedValue)} />
      </div>
      <div className="panel p-4">
        <div className="text-sm font-extrabold">Revenue — last 30 days</div>
        <div className="mt-2 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip formatter={(v: number) => usd(v)} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {orders.length === 0 && <p className="text-sm text-muted-foreground">No sales yet — revenue appears here once orders come in.</p>}
      </div>
    </div>
  );
}

const STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: "Accept", declined: "Decline", shipped: "Mark shipped", cancelled: "Cancel", refunded: "Refund",
};

function SellerOrders() {
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useQuery(myOrdersQuery);
  const [filter, setFilter] = useState<"open" | "shipped" | "all">("open");
  const update = useMutation({
    mutationFn: async (v: { id: string; status: OrderStatus; carrier?: string | undefined; tracking?: string | undefined }) => {
      const { error } = await supabase.rpc("merchant_update_order", {
        _id: v.id, _status: v.status, ...(v.carrier ? { _carrier: v.carrier } : {}), ...(v.tracking ? { _tracking: v.tracking } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Order updated"); qc.invalidateQueries({ queryKey: ["my-orders"] }); qc.invalidateQueries({ queryKey: ["my-listings"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const shown = orders.filter((o) =>
    filter === "all" ? true : filter === "open" ? OPEN_STATUSES.includes(o.status as OrderStatus) : o.status === "shipped");
  const act = (o: (typeof orders)[number], step: OrderStatus) => {
    if (step === "shipped") {
      const carrier = window.prompt("Carrier (optional)") ?? undefined;
      const tracking = window.prompt("Tracking number (optional)") ?? undefined;
      update.mutate({ id: o.id, status: step, carrier: carrier || undefined, tracking: tracking || undefined });
    } else if (["declined", "cancelled", "refunded"].includes(step)) {
      if (window.confirm(`${STEP_LABEL[step]} this order? The item goes back on sale.`)) update.mutate({ id: o.id, status: step });
    } else update.mutate({ id: o.id, status: step });
  };
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        {(["open", "shipped", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "open" ? "To do" : f === "shipped" ? "Shipped" : "All"}
          </Button>
        ))}
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : shown.length === 0 ? (
        <div className="panel p-6 text-center">
          <div className="font-extrabold">No orders here yet</div>
          <p className="mt-1 text-sm text-muted-foreground">When buyers purchase your listings, their orders land here for you to accept and ship.</p>
        </div>
      ) : shown.map((o) => {
        const st = o.status as OrderStatus;
        return (
          <div key={o.id} className="panel flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{o.item_name || "Item"}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleDateString()} · #{o.id.slice(0, 8)}
                {o.tracking_number && ` · ${o.carrier ?? "Tracking"} ${o.tracking_number}`}
              </div>
            </div>
            <span className="rounded border-2 border-foreground px-2 py-0.5 text-xs font-bold">{ORDER_LABEL[st] ?? o.status}</span>
            <span className="tabular font-extrabold">{usd(Number(o.price))}</span>
            <div className="flex gap-2">
              {(NEXT_STEPS[st] ?? []).map((step) => (
                <Button key={step} size="sm" variant={["declined", "cancelled", "refunded"].includes(step) ? "outline" : "default"}
                  disabled={update.isPending} onClick={() => act(o, step)}>{STEP_LABEL[step]}</Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
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
  const { data: listings = [] } = useQuery(myActiveListingsQuery);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["my-listings"] }); qc.invalidateQueries({ queryKey: ["market"] }); };
  const unlist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").update({ status: "removed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed from sale"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const byItem = new Map(listings.map((l) => [l.item_id, l]));

  const listedItems = items.filter((it) => byItem.has(it.id));
  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-muted-foreground">
        {listings.length} item{listings.length === 1 ? "" : "s"} listed. To list more, open your{" "}
        <Link to="/collection" className="font-semibold text-primary underline">collection</Link> and tap "Select items to list".
      </p>
      {listedItems.map((it) => {
        const l = byItem.get(it.id)!;
        return (
          <div key={it.id} className="panel flex items-center gap-3 p-3">
            <ItemArtwork item={it} className="aspect-[63/88] w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{it.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {conditionFor(it.category, it.condition).label} · Market {it.est_value != null ? usd(it.est_value) : "—"}
              </div>
            </div>
            <span className="tabular font-extrabold">{usd(Number(l.price))}</span>
            <Button size="sm" variant="outline" onClick={() => unlist.mutate(l.id)}>Unlist</Button>
          </div>
        );
      })}
    </div>
  );
}
