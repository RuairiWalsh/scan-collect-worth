import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { itemQuery, priceHistoryQuery, catalogHistoryForQuery, type Item } from "@/lib/items";
import { sportsSalesHistory } from "@/lib/sports-history.functions";
import { trimPresale } from "@/lib/collection-history";
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
import { parseNumistaId } from "@/lib/numista";
import { PriceSparkline } from "@/components/PriceSparkline";
import { useOfficialImages } from "@/hooks/use-official-images";
import { useCardVariants, VariantSelect, ConditionPrices, GradedPrices, gradedOptions } from "@/components/CardPricingControls";
import { cardPriceSources, selectedCardVariant } from "@/lib/card-pricing";
import { FolderPicker, itemFoldersQuery } from "@/components/FolderPicker";

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
  const { data: market } = useQuery(catalogHistoryForQuery(item?.catalog_id ? [item.catalog_id] : []));
  const fetchSales = useServerFn(sportsSalesHistory);
  const qc = useQueryClient();
  // Coins build their own daily trend line from nightly price checks; sports cards use CardSight sales.
  const isSports = item?.subcategory === "sports";
  const { data: sales } = useQuery({
    queryKey: ["sports_sales", id, item?.catalog_id, item?.condition, item?.variant, item?.grader, item?.grade],
    queryFn: async () => {
      const res = await fetchSales({ data: { itemId: id } });
      // The server may have just linked a hand-edited card to its catalog entry; reload its details.
      if (!item?.catalog_id) void qc.invalidateQueries({ queryKey: ["item", id] });
      return res;
    },
    enabled: isSports,
    staleTime: 24 * 60 * 60 * 1000,
  });
  useOfficialImages(item ? [item] : []);
  if (!item) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  // Matched cards: use the card's full market history, scaled to this copy's condition/printing.
  let points: HistoryPoint[] = history ?? [];
  if (isSports && sales && sales.points.length > 1) {
    points = sales.points.map((p) => ({ est_value: p.est_value, price_low: null, price_high: null, recorded_at: p.recorded_at }));
  } else if (item.catalog_id && market && market.length > 1) {
    const sorted = trimPresale([...market].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)));
    const latest = [...sorted].reverse().find((p) => p.nm_price != null)?.nm_price ?? null;
    const ratio = latest && item.est_value != null ? item.est_value / latest : 1;
    points = sorted.map((p) => ({
      est_value: p.nm_price == null ? null : Math.round(p.nm_price * ratio * 100) / 100,
      price_low: null,
      price_high: null,
      recorded_at: p.recorded_at,
    }));
  }
  return <ItemEditor item={item} history={points} />;
}

type HistoryPoint = { est_value: number | null; price_low: number | null; price_high: number | null; recorded_at: string };

function ItemEditor({ item, history }: { item: Item; history: HistoryPoint[] }) {
  const [f, setF] = useState(item);
  const { data: itemFolders = new Map<string, string[]>() } = useQuery(itemFoldersQuery());
  const { data: variants = [] } = useCardVariants(item.category === "cards" ? item.catalog_id : null);
  const numistaTypeId = item.category === "coins" ? parseNumistaId(item.catalog_id)?.typeId ?? null : null;
  // Catalog-matched cards: the shared image table keeps the scanned back; the collector's own back scan wins.
  const catalogBackId = item.catalog_id;
  const { data: catalogBack } = useQuery({
    queryKey: ["card_back", catalogBackId],
    queryFn: async () => {
      if (!catalogBackId) return null;
      const { data } = await supabase
        .from("card_product_images")
        .select("card_key")
        .eq("catalog_id", catalogBackId)
        .eq("status", "ready")
        .eq("review_status", "approved")
        .limit(1)
        .maybeSingle();
      return data?.card_key ? `/api/public/card-images/${data.card_key}?side=back` : null;
    },
    enabled: item.category === "cards" && !!catalogBackId,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const backImage = item.back_image ?? catalogBack ?? null;
  const [busy, setBusy] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [priceStatus, setPriceStatus] = useState<{ ebay: boolean; justtcg: boolean } | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reprice = useServerFn(refreshItemPrice);
  const status = useServerFn(pricingStatus);

  useEffect(() => setF(item), [item]);
  useEffect(() => {
    status().then((s) => setPriceStatus(s)).catch(() => {});
  }, [status]);

  // Auto-refresh the price when the card is opened (skip if already updated in the last hour).
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const last = item.price_updated_at ? new Date(item.price_updated_at).getTime() : 0;
    if (Date.now() - last < 3600000) return;
    setRefreshing(true);
    reprice({ data: { id: item.id } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["item", item.id] });
        qc.invalidateQueries({ queryKey: ["price_history", item.id] });
        qc.invalidateQueries({ queryKey: ["catalog_history_for"] });
        qc.invalidateQueries({ queryKey: ["items"] });
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF((p) => ({ ...p, [k]: v }));
  const cat = (f.category as CategoryKey) in TAXONOMY ? (f.category as CategoryKey) : "cards";
  const subs = TAXONOMY[cat].subcategories;
  const lines = f.subcategory ? subs[f.subcategory]?.lines ?? [] : [];

  // Folder tags save straight away — no need to press Save changes.
  async function setFolders(ids: string[]) {
    const prev = itemFolders.get(item.id) ?? [];
    const added = ids.filter((id) => !prev.includes(id));
    const removed = prev.filter((id) => !ids.includes(id));
    if (removed.length) {
      const { error } = await supabase.from("item_folders").delete().eq("item_id", item.id).in("folder_id", removed);
      if (error) { toast.error(error.message); return; }
    }
    if (added.length) {
      const { error } = await supabase.from("item_folders").upsert(added.map((folder_id) => ({ item_id: item.id, folder_id })), { onConflict: "item_id,folder_id" });
      if (error) { toast.error(error.message); return; }
    }
    await qc.invalidateQueries({ queryKey: ["item-folders"] });
    toast.success("Folders updated");
  }

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
          ? { catalog_id: null, official_image: null, product_image: null }
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
    qc.invalidateQueries({ queryKey: ["price_history", item.id] });
    qc.invalidateQueries({ queryKey: ["items"] });
    setBusy(false);
    toast.success("Saved & repriced");
  }

  async function del() {
    await supabase.from("items").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["items"] });
    navigate({ to: item.status === "batch" ? "/scan" : "/collection" });
  }

  const mult = conditionFor(item.category, item.condition).mult;
  const str = (v: string | null) => v ?? "";
  const nul = (v: string) => (v.trim() ? v : null);
  const identityUnchanged = f.category === item.category && f.name === item.name && f.number === item.number && f.set_name === item.set_name && f.line === item.line;
  const exactPricing = f.category === "cards" && variants.length > 0 && identityUnchanged;
  const selectedPrice = exactPricing ? selectedCardVariant(variants, f.condition, f.variant, f.grader, f.grade)?.price ?? null : item.est_value;
  const sources = exactPricing ? cardPriceSources(variants, f.condition, f.variant, f.grader, f.grade) : (item.price_sources as unknown as PriceSource[]) ?? [];
  const hasGraded = exactPricing && gradedOptions(variants).length > 0;
  const [priceTab, setPriceTab] = useState<"raw" | "graded">("raw");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={item.status === "batch" ? "/scan" : "/collection"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-xs text-muted-foreground">FOLDERS</span>
          <FolderPicker value={itemFolders.get(item.id) ?? []} onChange={setFolders} />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[300px_1fr]">

        <div className="space-y-4">
          <div className="space-y-2">
            {item.category === "cards" && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Card images">
                <Button size="sm" variant={showScan || showBack ? "outline" : "default"} aria-pressed={!showScan && !showBack} onClick={() => { setShowScan(false); setShowBack(false); }}>Product image</Button>
                <Button size="sm" variant={showScan ? "default" : "outline"} aria-pressed={showScan} disabled={!item.thumbnail} onClick={() => { setShowScan(true); setShowBack(false); }}>Your scan</Button>
                {item.category === "cards" && backImage && (
                  <Button size="sm" variant={showBack ? "default" : "outline"} aria-pressed={showBack} onClick={() => { setShowBack(true); setShowScan(false); }}>Back</Button>
                )}
              </div>
            )}
            {showBack && backImage ? (
              <img src={backImage} alt={`Back of ${item.name}`} className="aspect-[63/88] w-full border-2 border-ink bg-muted object-contain" />
            ) : showScan && item.thumbnail ? (
              <img src={item.thumbnail} alt={`Your scan of ${item.name}`} className="aspect-[63/88] w-full border-2 border-ink bg-muted object-contain" />
            ) : (
              <ItemArtwork item={item} className="aspect-[63/88] w-full border-2 border-ink" />
            )}
            {numistaTypeId != null && item.product_image && !item.product_image.includes("src=lymitz") && (
              <p className="text-xs text-muted-foreground">Image from Numista</p>
            )}
            {item.category === "cards" && !showScan && !showBack && !item.product_image && <p className="text-xs text-muted-foreground">{item.thumbnail ? "Original scan" : "Image unavailable"}</p>}
          </div>
          <div className="panel shadow-hard p-4">
            {(() => {
              const askingOnly = !exactPricing && sources.length > 0 && sources.every((s) => s.source === "ebay");
              return (
                <>
                  <p className="tabular text-xs text-muted-foreground">{askingOnly ? "CURRENT AVERAGE ASKING PRICE" : "ESTIMATED VALUE"}</p>
                  <p className="tabular text-3xl font-bold">{usd(selectedPrice)}</p>
                  {askingOnly && <p className="text-xs text-muted-foreground">Based on active eBay listings. Recent sold prices may be lower.</p>}
                </>
              );
            })()}
            {exactPricing && selectedPrice == null && <p className="text-xs text-muted-foreground">No market price for this condition and variant.</p>}
            {!exactPricing && item.price_low != null && item.price_high != null && item.price_low !== item.price_high && (
              <p className="tabular text-xs text-muted-foreground">
                range {usd(item.price_low)} – {usd(item.price_high)}
              </p>
            )}
            <PriceHistoryChart history={history} />
            {exactPricing && (hasGraded || item.subcategory === "sports") && (
              <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Price type">
                <Button size="sm" variant={priceTab === "raw" ? "default" : "outline"} aria-pressed={priceTab === "raw"} onClick={() => setPriceTab("raw")}>Ungraded</Button>
                <Button size="sm" variant={priceTab === "graded" ? "default" : "outline"} aria-pressed={priceTab === "graded"} onClick={() => setPriceTab("graded")}>Graded</Button>
              </div>
            )}
            {exactPricing && priceTab === "raw" && (
              <ConditionPrices
                variants={variants}
                printing={f.variant}
                conditions={item.subcategory === "sports" ? [{ key: "raw_ungraded", label: "Raw (ungraded)" }] : undefined}
              />
            )}
            {exactPricing && priceTab === "graded" && (hasGraded
              ? <GradedPrices variants={variants} printing={f.variant} />
              : <p className="mt-4 border-2 border-foreground p-3 text-sm text-muted-foreground">No graded sales found for this card yet. Prices appear here once PSA, BGS, SGC or CGC copies sell.</p>)}
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
            {refreshing && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="size-3 animate-spin" /> Updating price…
              </p>
            )}
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
            <Field label="Variant">{f.category === "cards" ? <VariantSelect variants={identityUnchanged ? variants : []} value={f.variant} onChange={(v) => set("variant", v)} /> : <Input value={str(f.variant)} onChange={(e) => set("variant", nul(e.target.value))} />}</Field>
            <Field label="Condition">
              <ConditionSelect category={f.category} subcategory={f.subcategory} value={f.condition} onChange={(v) => set("condition", v)} />
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
  return (
    <PriceSparkline
      points={history.map((h) => ({ recorded_at: h.recorded_at, value: h.est_value }))}
      emptyHint="No price history yet — refresh the price to start tracking."
    />
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
