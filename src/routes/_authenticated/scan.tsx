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
import { boxToScreen, boxToVideoRect, captureRegion, fileToImages, frameGray, frameSignature, screenToBox, sharpness, sigDiff, usd } from "@/lib/image";
import { detectCard, iou, type Box } from "@/lib/card-detect";
import { gateShot, gateTick, initGate } from "@/lib/capture-gate";
import { categoryLabel, defaultCondition } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { ConditionSelect } from "@/components/ConditionSelect";
import { ItemArtwork } from "@/components/ItemArtwork";
import { useOfficialImages } from "@/hooks/use-official-images";
import { ItemVariantSelect } from "@/components/CardPricingControls";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Live scanner — Lymitz" },
      { name: "description", content: "Scan cards, stamps and coins into a batch and review before saving." },
      { property: "og:title", content: "Live scanner — Lymitz" },
      { property: "og:description", content: "Scan cards, stamps and coins into a batch and review before saving." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScanPage,
});

type Pending = { id: string; thumb: string; failed?: string };

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [inFrame, setInFrame] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [captured, setCaptured] = useState<{ thumb: string; at: number } | null>(null);
  const [scanState, setScanState] = useState<"searching" | "steady" | "reading" | "seen">("searching");
  const [overlay, setOverlay] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const inFlight = useRef(0);
  const guideRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [pending, setPending] = useState<Pending[]>([]);
  const [pricing, setPricing] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const identify = useServerFn(identifyItem);
  const reprice = useServerFn(refreshItemPrice);
  const { data: batch = [] } = useQuery(itemsQuery("batch"));
  useOfficialImages(batch);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  async function startCam() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      // Ask for continuous autofocus where the phone supports it.
      const track = stream.getVideoTracks()[0];
      try {
        await track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
      } catch { /* not supported */ }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch (e) {
      setCamError(
        window.self !== window.top
          ? "The camera is blocked inside this preview window. Open the scanner in its own tab to use live scan."
          : "Camera unavailable. Allow camera access for this site in your browser settings, then try again.",
      );
    }
  }

  useEffect(() => {
    if (!captured) return;
    const t = setTimeout(() => setCaptured(null), 1600);
    return () => clearTimeout(t);
  }, [captured]);

  useEffect(() => {
    setInFrame(window.self !== window.top);
    // Open straight into the full-screen camera.
    startCam();
    return () => stopCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCam]);

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
    async (img: { full: string; thumb: string; strip?: string | undefined }, auto = false) => {
      const tempId = crypto.randomUUID();
      setPending((p) => [{ id: tempId, thumb: img.thumb }, ...p]);
      inFlight.current++;
      try {
        const res = await identify({ data: { image: img.full, strip: img.strip } });
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
            official_image: r.official_image ?? null,
            catalog_id: r.catalog_id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        setPending((p) => p.filter((x) => x.id !== tempId));
        await qc.invalidateQueries({ queryKey: ["items", "batch"] });
        doPrice(row.id);
      } catch (e) {
        // In live mode, silently drop frames with nothing collectible in them.
        if (auto && /No collectible/.test((e as Error).message)) {
          setPending((p) => p.filter((x) => x.id !== tempId));
        } else {
          setPending((p) => p.map((x) => (x.id === tempId ? { ...x, failed: (e as Error).message } : x)));
        }
      } finally {
        inFlight.current--;
      }
    },
    [identify, qc, doPrice],
  );

  const lastBoxRef = useRef<Box | null>(null);
  const lastShotRef = useRef<Float32Array | null>(null);
  const gateRef = useRef(initGate());

  const shoot = useCallback(
    (img: { full: string; thumb: string; strip?: string | undefined }, auto: boolean) => {
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
      setCaptured({ thumb: img.thumb, at: Date.now() });
      navigator.vibrate?.(30);
      process(img, auto);
    },
    [process],
  );

  // Live scan: find a card-shaped rectangle anywhere in view; once it sits still for a moment, capture it.
  useEffect(() => {
    if (!camOn || mode !== "auto") return;
    let prevBox: Box | null = null;
    let stable = 0;
    let misses = 0;
    let best: { score: number; img: { full: string; thumb: string; strip?: string | undefined } } | null = null;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const now = Date.now();
      const { g, W, H } = frameGray(v);
      const box = detectCard(g, W, H);
      if (!box) {
        gateRef.current = gateTick(gateRef.current, false, null, now).state;
        if (++misses >= 2) { lastBoxRef.current = null; setOverlay(null); setScanState("searching"); }
        stable = 0; best = null; prevBox = null;
        return;
      }
      misses = 0;
      lastBoxRef.current = box;
      setOverlay(boxToScreen(v, box));
      stable = prevBox && iou(box, prevBox) > 0.75 ? stable + 1 : 0;
      prevBox = box;
      const rect = boxToVideoRect(v, box);
      const sig = frameSignature(v, rect);
      const diff = lastShotRef.current ? sigDiff(sig, lastShotRef.current) : null;
      const gate = gateTick(gateRef.current, true, diff, now);
      gateRef.current = gate.state;
      if (!gate.canShoot) { setScanState("seen"); best = null; stable = 0; return; }
      if (inFlight.current >= 4) { setScanState("reading"); return; }
      setScanState("steady");
      const score = sharpness(v, rect);
      if (!best || score > best.score) best = { score, img: captureRegion(v, rect) };
      if (stable >= 2) {
        lastShotRef.current = sig;
        gateRef.current = gateShot(gateRef.current, now);
        stable = 0;
        const img = best.img;
        best = null;
        shoot(img, true);
      }
    }, 180);
    return () => clearInterval(t);
  }, [camOn, shoot, mode]);

  // Tap anywhere to capture right now (the detected card, or the middle of the view).
  function tapCapture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const box = lastBoxRef.current ?? { x: 0.12, y: 0.1, w: 0.76, h: 0.8 };
    const rect = boxToVideoRect(v, box);
    lastShotRef.current = frameSignature(v, rect);
    gateRef.current = gateShot(gateRef.current, Date.now());
    shoot(captureRegion(v, rect), false);
  }

  // Shutter: capture exactly what's inside the guide box (with a small margin).
  function shutterCapture() {
    const v = videoRef.current;
    const g = guideRef.current;
    if (!v || !v.videoWidth || !g) return;
    const b = screenToBox(v, g.getBoundingClientRect());
    const mx = b.w * 0.04, my = b.h * 0.04;
    const box = {
      x: Math.max(0, b.x - mx),
      y: Math.max(0, b.y - my),
      w: Math.min(1 - Math.max(0, b.x - mx), b.w + 2 * mx),
      h: Math.min(1 - Math.max(0, b.y - my), b.h + 2 * my),
    };
    shoot(captureRegion(v, boxToVideoRect(v, box)), false);
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) process(await fileToImages(f));
  }

  async function updateItem(id: string, patch: Partial<Item>, repriceAfter = false) {
    const identity = ["name", "number", "set_name", "line"].some((k) => k in patch);
    const { error } = await supabase
      .from("items")
      .update(identity ? { ...patch, catalog_id: null, official_image: null } : patch)
      .eq("id", id);
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
      {/* Scanner — full screen while the camera is on */}
      <section>
        <div className={camOn ? "fixed inset-0 z-50 overflow-hidden bg-ink" : "panel shadow-hard relative aspect-[3/4] overflow-hidden bg-ink sm:aspect-[4/3]"}>
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${camOn ? "" : "hidden"}`} />
          {camOn && (
            <>
              {mode === "auto" ? (
                <>
                  {/* Tap anywhere to capture now */}
                  <button type="button" aria-label="Capture now" onClick={tapCapture} className="absolute inset-0" />
                  {overlay && (
                    <div
                      className={`pointer-events-none absolute rounded-lg border-[3px] transition-all duration-150 ${scanState === "seen" ? "border-secondary" : "border-primary"}`}
                      style={overlay}
                    />
                  )}
                </>
              ) : (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-24">
                  <div
                    ref={guideRef}
                    className="aspect-[63/88] w-[min(78vw,calc(62vh*63/88))] rounded-xl border-[3px] border-primary shadow-[0_0_0_9999px_color-mix(in_oklch,var(--ink)_45%,transparent)]"
                  />
                </div>
              )}
              {flash && <div className="absolute inset-0 bg-ink-foreground/60" />}

              {/* Top bar */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === "auto" ? "manual" : "auto"))}
                  className="relative z-10 flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1.5 text-sm font-semibold text-ink-foreground"
                >
                  {mode === "auto" ? (
                    <>
                      <span className={`size-2.5 rounded-full ${scanState === "steady" ? "bg-primary animate-pulse" : scanState === "reading" || scanState === "seen" ? "bg-secondary" : "bg-ink-foreground/50"}`} />
                      {scanState === "steady" ? "Card found — hold…" : scanState === "reading" ? "Reading…" : scanState === "seen" ? "Got it — next card" : "Auto scan"} · switch
                    </>
                  ) : (
                    <>Line up the card · Auto: off</>
                  )}
                </button>
                <Button size="sm" onClick={stopCam} className="relative z-10">
                  Done{batch.length ? ` · ${batch.length}` : ""}
                </Button>
              </div>

              {mode === "manual" && (
                <button
                  type="button"
                  aria-label="Take photo"
                  onClick={shutterCapture}
                  className="absolute bottom-32 left-1/2 z-10 size-20 -translate-x-1/2 rounded-full border-4 border-ink-foreground bg-primary shadow-hard active:scale-95 mb-[env(safe-area-inset-bottom)]"
                />
              )}

              {/* Captured badge */}
              {captured && (
                <div key={captured.at} className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-ink bg-primary py-1 pl-1 pr-4 text-sm font-extrabold text-primary-foreground shadow-hard">
                  <img src={captured.thumb} alt="" className="h-10 w-7 rounded object-cover" />
                  <CheckCheck className="size-4" /> Captured
                </div>
              )}

              {/* Camera roll */}
              <div className="absolute inset-x-0 bottom-0 bg-ink/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex gap-2 overflow-x-auto">
                  {pending.map((p) => (
                    <div key={p.id} className="relative h-20 w-14 shrink-0 overflow-hidden rounded border-2 border-ink-foreground/40">
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-ink/50 text-ink-foreground">
                        {p.failed ? <AlertTriangle className="size-4 text-destructive" /> : <Loader2 className="size-4 animate-spin" />}
                      </div>
                    </div>
                  ))}
                  {batch.map((b) => (
                    <Link key={b.id} to="/item/$id" params={{ id: b.id }} aria-label={`View ${b.name}`} className="shrink-0">
                      <ItemArtwork item={b} className="h-20 w-14 rounded border-2 border-ink-foreground/40" />
                    </Link>
                  ))}
                  {!batch.length && !pending.length && (
                    <p className="py-6 text-xs text-ink-foreground/70">Scanned cards will appear here.</p>
                  )}
                </div>
              </div>
            </>
          )}
          {!camOn && (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-ink-foreground">
              <Camera className="size-10" />
              <p className="max-w-xs text-sm opacity-80">
                {camError ?? "Pass your phone over a card — it captures automatically."}
              </p>
              {camError && inFrame ? (
                <Button asChild>
                  <a href={typeof window !== "undefined" ? window.location.href : "/scan"} target="_blank" rel="noreferrer">
                    Open scanner in new tab
                  </a>
                </Button>
              ) : (
                <Button onClick={startCam}>{camError ? "Try again" : "Start live scan"}</Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> Upload photo
          </Button>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {camOn ? (
              <>
                <span className={`size-2.5 rounded-full ${scanState === "steady" ? "bg-primary animate-pulse" : scanState === "reading" ? "bg-secondary animate-pulse" : "bg-muted-foreground"}`} />
                {scanState === "steady" ? "Hold still…" : scanState === "reading" ? "Reading…" : "Fit one card inside the outline"}
              </>
            ) : (
              <span className="text-muted-foreground">Live scan off</span>
            )}
          </p>
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
                <Link to="/item/$id" params={{ id: b.id }} aria-label={`View ${b.name}`} className="shrink-0">
                  <ItemArtwork item={b} className="h-20 w-14 rounded border" />
                </Link>
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
              <div className="flex flex-wrap items-center gap-2">
                {b.category === "cards" && <ItemVariantSelect catalogId={b.catalog_id} value={b.variant} onChange={(v) => updateItem(b.id, { variant: v }, true)} className="h-8 min-w-32 flex-1 text-xs" />}
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
