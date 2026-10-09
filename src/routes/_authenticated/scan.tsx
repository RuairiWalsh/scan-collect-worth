import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, CameraOff, ImagePlus, Loader2, Trash2, CheckCheck, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { identifyItem } from "@/lib/scan.functions";
import { refreshItemPrice } from "@/lib/prices.functions";
import { itemsQuery, type Item } from "@/lib/items";
import { captureVideo, fileToImages, usd } from "@/lib/image";
import { categoryLabel, defaultCondition } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { ConditionSelect } from "@/components/ConditionSelect";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Live scanner — Vaultscan" },
      { name: "description", content: "Scan cards, stamps and coins into a batch and review before saving." },
      { property: "og:title", content: "Live scanner — Vaultscan" },
      { property: "og:description", content: "Scan cards, stamps and coins into a batch and review before saving." },
    ],
  }),
  component: ScanPage,
});

type Pending = { id: string; thumb: string; failed?: string };

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [pricing, setPricing] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const identify = useServerFn(identifyItem);
  const reprice = useServerFn(refreshItemPrice);
  const { data: batch = [] } = useQuery(itemsQuery("batch"));

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  async function startCam() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch (e) {
      setCamError("Camera unavailable. Allow camera access, or upload photos instead.");
    }
  }

  useEffect(() => () => stopCam(), [stopCam]);

  const doPrice = useCallback(
    async (id: string) => {
      setPricing((s) => new Set(s).add(id));
      try {
        await reprice({ data: { id } });
      } catch {
        toast.error("Couldn't fetch prices for one item.");
      } finally {
        setPricing((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        qc.invalidateQueries({ queryKey: ["items"] });
      }
    },
    [reprice, qc],
  );

  const process = useCallback(
    async (img: { full: string; thumb: string }) => {
      const tempId = crypto.randomUUID();
      setPending((p) => [{ id: tempId, thumb: img.thumb }, ...p]);
      try {
        const res = await identify({ data: { image: img.full } });
        if (!res.ok) throw new Error(res.error);
        const r = res.result;
        if (!r.is_collectible) throw new Error("No collectible found in that shot.");
        const { data: row, error } = await supabase
          .from("items")
          .insert({
            status: "batch",
            category: r.category,
            subcategory: r.subcategory,
            line: r.line,
            name: r.name,
            set_name: r.set_name,
            number: r.number,
            year: r.year,
            variant: r.variant,
            grader: r.grader,
            grade: r.grade,
            condition: r.grader ? "graded" : defaultCondition(r.category),
            ai_confidence: r.confidence,
            thumbnail: img.thumb,
          })
          .select("id")
          .single();
        if (error) throw error;
        setPending((p) => p.filter((x) => x.id !== tempId));
        await qc.invalidateQueries({ queryKey: ["items", "batch"] });
        doPrice(row.id);
      } catch (e) {
        setPending((p) => p.map((x) => (x.id === tempId ? { ...x, failed: (e as Error).message } : x)));
      }
    },
    [identify, qc, doPrice],
  );

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    process(captureVideo(v));
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) process(await fileToImages(f));
  }

  async function updateItem(id: string, patch: Partial<Item>, repriceAfter = false) {
    const { error } = await supabase.from("items").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["items", "batch"] });
    if (repriceAfter) doPrice(id);
  }

  async function remove(id: string) {
    await supabase.from("items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["items", "batch"] });
  }

  async function commitAll() {
    const ids = batch.map((b) => b.id);
    if (!ids.length) return;
    const { error } = await supabase.from("items").update({ status: "collection" }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${ids.length} item${ids.length > 1 ? "s" : ""} to your collection`);
    qc.invalidateQueries({ queryKey: ["items"] });
  }

  const batchTotal = batch.reduce((s, b) => s + (b.est_value ?? 0) * b.quantity, 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_420px]">
      {/* Scanner */}
      <section>
        <div className="panel shadow-hard relative aspect-[4/3] overflow-hidden bg-ink">
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${camOn ? "" : "hidden"}`} />
          {camOn && (
            <>
              <div className="pointer-events-none absolute inset-[10%] rounded-lg border-2 border-dashed border-ink-foreground/70" />
              <div className="animate-scanline pointer-events-none absolute inset-x-[10%] h-0.5 bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
              {flash && <div className="absolute inset-0 bg-ink-foreground/70" />}
            </>
          )}
          {!camOn && (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-ink-foreground">
              <Camera className="size-10" />
              <p className="max-w-xs text-sm opacity-80">
                {camError ?? "Hold one item at a time inside the frame and tap the shutter. Each scan drops into your batch."}
              </p>
              <Button onClick={startCam}>Start camera</Button>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> Upload
          </Button>
          <button
            onClick={shoot}
            disabled={!camOn}
            aria-label="Capture"
            className="flex size-16 items-center justify-center rounded-full border-4 border-ink bg-primary shadow-hard-sm transition active:scale-95 disabled:opacity-40"
          >
            <span className="size-8 rounded-full bg-primary-foreground" />
          </button>
          {camOn ? (
            <Button variant="outline" onClick={stopCam}>
              <CameraOff /> Stop
            </Button>
          ) : (
            <span className="w-[92px]" />
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </div>
      </section>

      {/* Batch */}
      <section className="panel flex max-h-[80vh] flex-col">
        <div className="flex items-center justify-between border-b-2 border-ink p-4">
          <div>
            <h2 className="text-lg font-extrabold">Batch</h2>
            <p className="tabular text-xs text-muted-foreground">
              {batch.length} items · {usd(batchTotal)}
            </p>
          </div>
          <Button size="sm" onClick={commitAll} disabled={!batch.length}>
            <CheckCheck /> Add to collection
          </Button>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {pending.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <img src={p.thumb} alt="" className="size-14 rounded border object-cover" />
              {p.failed ? (
                <div className="flex flex-1 items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {p.failed}
                </div>
              ) : (
                <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Identifying…
                </div>
              )}
              {p.failed && (
                <button onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))} aria-label="Dismiss">
                  <Trash2 className="size-4 text-muted-foreground" />
                </button>
              )}
            </li>
          ))}
          {batch.map((b) => (
            <li key={b.id} className="space-y-2 p-3">
              <div className="flex items-center gap-3">
                {b.thumbnail ? (
                  <img src={b.thumbnail} alt="" className="size-14 rounded border object-cover" />
                ) : (
                  <div className="size-14 rounded border bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[b.line, b.set_name, b.number && `#${b.number}`].filter(Boolean).join(" · ") ||
                      categoryLabel(b.category, b.subcategory)}
                  </p>
                </div>
                <div className="text-right">
                  {pricing.has(b.id) ? (
                    <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="tabular text-sm font-bold">{usd(b.est_value)}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ConditionSelect
                  category={b.category}
                  value={b.condition}
                  onChange={(v) => updateItem(b.id, { condition: v }, true)}
                  className="h-8 flex-1 text-xs"
                />
                <Button asChild size="sm" variant="ghost">
                  <Link to="/item/$id" params={{ id: b.id }}>
                    Details <ChevronRight />
                  </Link>
                </Button>
                <button onClick={() => remove(b.id)} aria-label="Remove" className="p-1">
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </li>
          ))}
          {!batch.length && !pending.length && (
            <li className="p-8 text-center text-sm text-muted-foreground">Scanned items will appear here.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
