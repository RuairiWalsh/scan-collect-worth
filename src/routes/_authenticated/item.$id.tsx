import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { itemQuery, priceHistoryQuery, type Item } from "@/lib/items";
import { usd } from "@/lib/image";
import { TAXONOMY, CATEGORY_KEYS, conditionFor, type CategoryKey } from "@/lib/taxonomy";
import type { PriceSource } from "@/lib/pricing";
import { refreshItemPrice, pricingStatus } from "@/lib/prices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConditionSelect } from "@/components/ConditionSelect";
import { ItemArtwork } from "@/components/ItemArtwork";
import { useOfficialImages } from "@/hooks/use-official-images";

export const Route = createFileRoute("/_authenticated/item/$id")({
  head: () => ({
    meta: [
      { title: "Item details — Lymitz" },
      { name: "description", content: "Edit details, condition and see price sources for this collectible." },
      { property: "og:title", content: "Item details — Lymitz" },
      { property: "og:description", content: "Edit details, condition and see price sources for this collectible." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ItemPage,
});

function ItemPage() {
  const { id } = Route.useParams();
  const { data: item } = useQuery(itemQuery(id));
  const { data: history } = useQuery(priceHistoryQuery(id));
  useOfficialImages(item ? [item] : []);
  if (!item) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  return <ItemEditor item={item} history={history ?? []} />;
}

type HistoryPoint = { est_value: number | null; price_low: number | null; price_high: number | null; recorded_at: string };

function ItemEditor({ item, history }: { item: Item; history: HistoryPoint[] }) {
  const [f, setF] = useState(item);
  const [busy, setBusy] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [priceStatus, setPriceStatus] = useState<{ ebay: boolean; justtcg: boolean } | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reprice = useServerFn(refreshItemPrice);
  const status = useServerFn(pricingStatus);

  useEffect(() => setF(item), [item]);
  useEffect(() => {
    status().then((s) => setPriceStatus(s)).catch(() => {});
  }, [status]);

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF((p) => ({ ...p, [k]: v }));
  const cat = (f.category as CategoryKey) in TAXONOMY ? (f.category as CategoryKey) : "cards";
  const subs = TAXONOMY[cat].subcategories;
  const lines = f.subcategory ? subs[f.subcategory]?.lines ?? [] : [];

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("items")
      .update({
        category: f.category, subcategory: f.subcategory, line: f.line, name: f.name,
        set_name: f.set_name, number: f.number, year: f.year, variant: f.variant,
        condition: f.condition, grader: f.grader, grade: f.grade, quantity: f.quantity, notes: f.notes,
        // Identity edited by hand → re-match the catalog card from the new details.
        ...(f.name !== item.name || f.number !== item.number || f.set_name !== item.set_name || f.line !== item.line
          ? { catalog_id: null, official_image: null }
          : {}),
      })
      .eq("id", item.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    try {
      await reprice({ data: { id: item.id } });
    } catch {
      toast.error("Saved, but price lookup failed.");
    }
    await qc.invalidateQueries({ queryKey: ["item", item.id] });
    qc.invalidateQueries({ queryKey: ["items"] });
    setBusy(false);
    toast.success("Saved & repriced");
  }

  async function del() {
    await supabase.from("items").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["items"] });
    navigate({ to: item.status === "batch" ? "/scan" : "/collection" });
  }

  const sources = (item.price_sources as unknown as PriceSource[]) ?? [];
  const mult = conditionFor(item.category, item.condition).mult;
  const str = (v: string | null) => v ?? "";
  const nul = (v: string) => (v.trim() ? v : null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to={item.status === "batch" ? "/scan" : "/collection"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            {item.category === "cards" && (
              <div className="flex gap-2" role="group" aria-label="Card images">
                <Button size="sm" variant={showScan ? "outline" : "default"} aria-pressed={!showScan} onClick={() => setShowScan(false)}>Official image</Button>
                <Button size="sm" variant={showScan ? "default" : "outline"} aria-pressed={showScan} disabled={!item.thumbnail} onClick={() => setShowScan(true)}>Your scan</Button>
              </div>
            )}
            {showScan && item.thumbnail ? (
              <img src={item.thumbnail} alt={`Your scan of ${item.name}`} className="aspect-[63/88] w-full border-2 border-ink bg-muted object-contain" />
            ) : (
              <ItemArtwork item={item} className="aspect-[63/88] w-full border-2 border-ink" />
            )}
            {item.category === "cards" && !showScan && !item.official_image && <p className="text-xs text-muted-foreground">Official image unavailable for this printing.</p>}
          </div>
          <div className="panel shadow-hard p-4">
            <p className="tabular text-xs text-muted-foreground">ESTIMATED VALUE</p>
            <p className="tabular text-3xl font-bold">{usd(item.est_value)}</p>
            {item.price_low != null && item.price_high != null && item.price_low !== item.price_high && (
              <p className="tabular text-xs text-muted-foreground">
                range {usd(item.price_low)} – {usd(item.price_high)}
              </p>
            )}
            <PriceHistoryChart history={history} />
            <ul className="mt-4 space-y-2 text-sm">
              {sources.map((s) => (
                <li key={s.source} className="flex items-center justify-between gap-2">
                  <span>
                    {s.label}
                    {s.count ? <span className="text-muted-foreground"> ({s.count})</span> : null}
                    {s.kind === "reference" && mult !== 1 && (
                      <span className="text-muted-foreground"> ×{mult}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 tabular">
                    {usd(s.price)}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" aria-label={`Open ${s.label}`}>
                        <ExternalLink className="size-3.5 text-secondary" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
              {!sources.length && <li className="text-muted-foreground">No market matches found yet.</li>}
            </ul>
            {priceStatus && !priceStatus.justtcg && !priceStatus.ebay && (
              <p className="mt-3 rounded bg-accent p-2 text-xs text-accent-foreground">
                No pricing APIs connected yet — add a JustTCG or eBay key to see live prices.
              </p>
            )}
            <Button variant="outline" size="sm" className="mt-4 w-full" disabled={busy} onClick={save}>
              <RefreshCw className={busy ? "animate-spin" : ""} /> Refresh price
            </Button>
          </div>
        </div>

        <div className="panel space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category">
              <Select value={f.category} onValueChange={(v) => setF((p) => ({ ...p, category: v, subcategory: null, line: null, condition: conditionFor(v, "").key }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_KEYS.map((k) => <SelectItem key={k} value={k}>{TAXONOMY[k].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={f.subcategory ?? ""} onValueChange={(v) => setF((p) => ({ ...p, subcategory: v, line: null }))}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(subs).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Line">
              <Input list="lines" value={str(f.line)} onChange={(e) => set("line", nul(e.target.value))} />
              <datalist id="lines">{lines.map((l) => <option key={l} value={l} />)}</datalist>
            </Field>
          </div>
          <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Set / series"><Input value={str(f.set_name)} onChange={(e) => set("set_name", nul(e.target.value))} /></Field>
            <Field label="Number"><Input value={str(f.number)} onChange={(e) => set("number", nul(e.target.value))} /></Field>
            <Field label="Year"><Input value={str(f.year)} onChange={(e) => set("year", nul(e.target.value))} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Variant"><Input value={str(f.variant)} onChange={(e) => set("variant", nul(e.target.value))} /></Field>
            <Field label="Condition">
              <ConditionSelect category={f.category} value={f.condition} onChange={(v) => set("condition", v)} />
            </Field>
            <Field label="Quantity">
              <Input type="number" min={1} value={f.quantity} onChange={(e) => set("quantity", Math.max(1, parseInt(e.target.value) || 1))} />
            </Field>
          </div>
          {f.condition === "graded" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Grader"><Input placeholder="PSA, BGS, CGC…" value={str(f.grader)} onChange={(e) => set("grader", nul(e.target.value))} /></Field>
              <Field label="Grade"><Input placeholder="10" value={str(f.grade)} onChange={(e) => set("grade", nul(e.target.value))} /></Field>
            </div>
          )}
          <Field label="Notes"><Textarea value={str(f.notes)} onChange={(e) => set("notes", nul(e.target.value))} /></Field>
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={del} className="text-destructive"><Trash2 /> Delete</Button>
            <Button onClick={save} disabled={busy}>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceHistoryChart({ history }: { history: HistoryPoint[] }) {
  const pts = history.filter((h) => h.est_value != null);
  if (pts.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">No price history yet — refresh the price to start tracking.</p>;
  }
  const W = 260, H = 90, PAD = 6;
  const vals = pts.map((p) => p.est_value as number);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.est_value as number).toFixed(1)}`).join(" ");
  const first = pts[0]!, last = pts[pts.length - 1]!;
  const delta = (last.est_value as number) - (first.est_value as number);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <p className="tabular text-xs text-muted-foreground">PRICE HISTORY</p>
        {pts.length > 1 && (
          <p className={`tabular text-xs font-semibold ${delta > 0 ? "text-secondary" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {delta > 0 ? "+" : ""}{usd(delta)} since {fmtDate(first.recorded_at)}
          </p>
        )}
      </div>
      {pts.length === 1 ? (
        <p className="mt-1 text-xs text-muted-foreground">First recorded {fmtDate(first.recorded_at)} — refresh again later to see the trend.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Price history chart">
            <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={p.recorded_at} cx={x(i)} cy={y(p.est_value as number)} r="3" fill="var(--primary)" stroke="var(--background)" strokeWidth="1.5" />
            ))}
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtDate(first.recorded_at)}</span>
            <span>{fmtDate(last.recorded_at)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
