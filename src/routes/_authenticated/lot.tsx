import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { itemsQuery, type Item } from "@/lib/items";
import { usd } from "@/lib/image";
import { conditionFor } from "@/lib/taxonomy";
import { selectedCardVariant, printingLabel, resolvePrinting } from "@/lib/card-pricing";
import { refreshItemPrice } from "@/lib/prices.functions";
import { useCardVariants } from "@/components/CardPricingControls";
import { ConditionSelect } from "@/components/ConditionSelect";
import { ItemArtwork } from "@/components/ItemArtwork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoles } from "@/hooks/use-roles";

export const Route = createFileRoute("/_authenticated/lot")({
  validateSearch: (s: Record<string, unknown>) => ({ items: typeof s["items"] === "string" ? s["items"] : "" }),
  head: () => ({
    meta: [
      { title: "New listing lot — Lymitz" },
      { name: "description", content: "Set prices, condition and photos for the items you're listing." },
      { property: "og:title", content: "New listing lot — Lymitz" },
      { property: "og:description", content: "Set prices, condition and photos for the items you're listing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LotPage,
});

type Draft = { price: string; photos: { path: string; preview: string }[]; uploading: boolean };

function LotPage() {
  const { items: idsParam } = Route.useSearch();
  const ids = useMemo(() => idsParam.split(",").filter(Boolean), [idsParam]);
  const { isMerchant, isLoading: rolesLoading } = useRoles();
  const { data: all = [], isLoading } = useQuery(itemsQuery("collection"));
  const items = all.filter((i) => ids.includes(i.id));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const draft = (id: string): Draft => drafts[id] ?? { price: "", photos: [], uploading: false };
  const patch = (id: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...d[id], ...p } }));

  if (rolesLoading || isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isMerchant)
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-extrabold">Merchants only</h1>
        <Link to="/sell" className="mt-4 inline-block text-primary underline">Apply to become a merchant</Link>
      </main>
    );

  const ready = items.length > 0 && items.every((i) => Number(draft(i.id).price) > 0) && !items.some((i) => draft(i.id).uploading);
  const total = items.reduce((s, i) => s + (Number(draft(i.id).price) || 0), 0);

  async function publish() {
    setBusy(true);
    try {
      const { data: lot, error } = await supabase
        .from("listing_lots").insert({ title: title.trim() || null, status: "published" }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("listings").insert(
        items.map((i) => ({
          item_id: i.id,
          lot_id: lot.id,
          price: Math.round(Number(draft(i.id).price) * 100) / 100,
          photos: draft(i.id).photos.map((p) => p.path),
        })),
      );
      if (e2) throw e2;
      await qc.invalidateQueries({ queryKey: ["my-listings"] });
      qc.invalidateQueries({ queryKey: ["market"] });
      toast.success(`${items.length} item${items.length === 1 ? "" : "s"} listed`);
      navigate({ to: "/collection" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-32">
      <Link to="/collection" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← Back to collection</Link>
      <h1 className="mt-2 font-display text-3xl font-black">New listing lot</h1>
      <p className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"} · set your price next to each market price.</p>
      <Input className="mt-4 max-w-md" placeholder="Lot name (optional)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      {items.length === 0 && <p className="mt-8 text-muted-foreground">No items selected. Go back and tick the items you want to list.</p>}
      <ul className="mt-6 space-y-4">
        {items.map((i) => (
          <LotRow key={i.id} item={i} draft={draft(i.id)} patch={(p) => patch(i.id, p)} />
        ))}
      </ul>
      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t-2 border-ink bg-background md:bottom-0">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <span className="tabular text-sm font-semibold">Lot total {usd(total)}</span>
            <Button disabled={!ready || busy} onClick={publish}>
              {busy ? "Listing…" : `List ${items.length} item${items.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function LotRow({ item, draft, patch }: { item: Item; draft: Draft; patch: (p: Partial<Draft>) => void }) {
  const qc = useQueryClient();
  const reprice = useServerFn(refreshItemPrice);
  const { data: variants = [] } = useCardVariants(item.category === "cards" ? item.catalog_id : null);
  const [condition, setCondition] = useState(item.condition);
  const exact = item.category === "cards" && item.catalog_id && variants.length > 0;
  const market = exact ? selectedCardVariant(variants, condition, item.variant)?.price ?? null : item.est_value;
  const printing = exact ? resolvePrinting(variants, item.variant) : null;
  const price = draft.price;

  async function changeCondition(v: string) {
    setCondition(v);
    const { error } = await supabase.from("items").update({ condition: v }).eq("id", item.id);
    if (error) { toast.error(error.message); setCondition(item.condition); return; }
    reprice({ data: { id: item.id } }).catch(() => {}).finally(() => qc.invalidateQueries({ queryKey: ["items"] }));
    toast.success("Condition updated");
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    patch({ uploading: true });
    const { data: u } = await supabase.auth.getUser();
    const added: Draft["photos"] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${u.user!.id}/${item.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("listing-photos").upload(path, file, { contentType: file.type });
      if (error) { toast.error(error.message); continue; }
      added.push({ path, preview: URL.createObjectURL(file) });
    }
    patch({ uploading: false, photos: [...draft.photos, ...added] });
  }

  async function removePhoto(path: string) {
    await supabase.storage.from("listing-photos").remove([path]);
    patch({ photos: draft.photos.filter((p) => p.path !== path) });
  }

  return (
    <li className="panel p-4">
      <div className="flex gap-4">
        <ItemArtwork item={item} className="aspect-[63/88] w-20 shrink-0 rounded border-2 border-ink" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="truncate font-bold">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[item.set_name, item.number && `#${item.number}`, printing && printingLabel(printing)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">CONDITION</p>
              {condition === "graded" && item.grader ? (
                <p className="font-semibold">{item.grader} {item.grade}</p>
              ) : (
                <ConditionSelect category={item.category} subcategory={item.subcategory} value={condition} onChange={changeCondition} />
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">MARKET PRICE</p>
              <p className="tabular text-lg font-extrabold">{market != null ? usd(market) : "Unavailable"}</p>
              <p className="text-xs text-muted-foreground">{conditionFor(item.category, condition).label}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">YOUR PRICE</p>
              <div className="flex items-center gap-2">
                <Input aria-label={`Your price for ${item.name}`} inputMode="decimal" placeholder="$0.00"
                  value={price} onChange={(e) => patch({ price: e.target.value.replace(/[^0-9.]/g, "") })} />
                {market != null && (
                  <Button type="button" size="sm" variant="outline" onClick={() => patch({ price: market.toFixed(2) })}>Match</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {draft.photos.map((p) => (
          <div key={p.path} className="relative">
            <img src={p.preview} alt="Listing photo" className="size-16 rounded border-2 border-ink object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => removePhoto(p.path)}
              className="absolute -right-2 -top-2 rounded-full border-2 border-ink bg-background p-0.5"><X className="size-3" /></button>
          </div>
        ))}
        <label className="flex size-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-ink text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ImagePlus className="size-5" />
          {draft.uploading ? "…" : "Photos"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
    </li>
  );
}
