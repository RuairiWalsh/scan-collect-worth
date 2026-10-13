import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Pause, Play, FileText, Pencil, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { beginCardImport, importCardPair, importCardPairs, confirmCardImport } from "@/lib/admin-import.functions";
import { searchCardSets } from "@/lib/admin-set-checklist.functions";
import { isImportedPair, pdfCardPair } from "@/lib/pdf-card-pairs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Batch = Database["public"]["Tables"]["card_image_imports"]["Row"];
type Pair = Database["public"]["Tables"]["card_image_import_pairs"]["Row"];
type Details = { name: string; set_name: string; number: string; year: string; line: string; subcategory: "tcg" | "sports" | "nonsport"; variant: string; language: string };
const labels: Record<string, string> = { approved: "Added to card database", needs_details: "Awaiting review", failed: "Failed", pending: "Pending", duplicate: "Duplicate" };

export function AdminCardImport() {
  const startImport = useServerFn(beginCardImport);
  const processPair = useServerFn(importCardPair);
  const processPairs = useServerFn(importCardPairs);
  const confirm = useServerFn(confirmCardImport);
  const findSets = useServerFn(searchCardSets);
  const [setQuery, setSetQuery] = useState({ name: "", year: "" });
  const [setResults, setSetResults] = useState<{ id: string; name: string; releaseName: string; releaseYear: string; cardCount: number }[]>([]);
  const [importSet, setImportSet] = useState<{ id: string; name: string; year: string | null } | null>(null);
  const [findingSets, setFindingSets] = useState(false);
  async function lookupSets(e: React.FormEvent) {
    e.preventDefault(); if (!setQuery.name.trim()) return;
    setFindingSets(true);
    try { const r = await findSets({ data: { name: setQuery.name.trim(), year: setQuery.year.trim() || undefined } }); setSetResults(r); if (!r.length) toast.error("No sets found."); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Set search failed."); }
    finally { setFindingSets(false); }
  }
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const stop = useRef(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState({ approved: 0, details: 0, failed: 0, saved: 0 });
  const [preview, setPreview] = useState<{ front: string; back: string } | null>(null);
  const [dpi, setDpi] = useState(300);
  const [pageIndex, setPageIndex] = useState(0);
  const [editing, setEditing] = useState<Pair | null>(null);
  const [details, setDetails] = useState<Details>({ name: "", set_name: "", number: "", year: "", line: "", subcategory: "sports", variant: "", language: "English" });
  const [saving, setSaving] = useState(false);
  useEffect(() => () => { stop.current = true; void pdf.current?.destroy(); }, []);
  useEffect(() => () => { if (preview) { URL.revokeObjectURL(preview.front); URL.revokeObjectURL(preview.back); } }, [preview]);
  const history = useQuery({ queryKey: ["admin-imports"], queryFn: async () => {
    const { data, error } = await supabase.from("card_image_imports").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return data;
  } });
  const pairs = useQuery({ queryKey: ["admin-import-pairs", selected, pageIndex], enabled: Boolean(selected), queryFn: async () => {
    if (!selected) return [];
    const { data, error } = await supabase.from("card_image_import_pairs").select("*").eq("import_id", selected).order("pair_index").range(pageIndex * 50, pageIndex * 50 + 49);
    if (error) throw error;
    return data;
  } });
  const images = useQuery({ queryKey: ["admin-import-previews", pairs.data?.map(p => p.id)], enabled: Boolean(pairs.data?.length), queryFn: async () => {
    const paths = (pairs.data ?? []).flatMap(p => [p.front_path, p.back_path]);
    const { data, error } = await supabase.storage.from("admin-card-scans").createSignedUrls(paths, 3600);
    if (error) throw error;
    return new Map((data ?? []).map(row => [row.path, row.signedUrl]));
  } });
  async function loadStatuses(id: string) {
    const rows: { pair_index: number; status: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("card_image_import_pairs").select("pair_index,status").eq("import_id", id).order("pair_index").range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    setProgress({ approved: rows.filter(r => r.status === "approved").length, details: rows.filter(r => r.status === "needs_details").length, failed: rows.filter(r => r.status === "failed").length, saved: rows.filter(r => isImportedPair(r.status)).length });
    return new Map(rows.map(r => [r.pair_index, r.status]));
  }
  async function chooseFile(file: File) {
    setBusy(true); setPhase("Opening PDF…");
    try {
      const { openScannerPdf, scannerPage } = await import("@/lib/pdf-scanner");
      const opened = await openScannerPdf(file);
      await pdf.current?.destroy(); pdf.current = opened.pdf;
      const next = await startImport({ data: { hash: opened.hash, name: file.name, pages: opened.pdf.numPages } });
      setBatch(next); setSelected(next.id); setPageIndex(0);
      await loadStatuses(next.id);
      const front = await scannerPage(opened.pdf, 1, dpi);
      const back = await scannerPage(opened.pdf, 2, dpi);
      setPreview({ front: URL.createObjectURL(front), back: URL.createObjectURL(back) });
      qc.invalidateQueries({ queryKey: ["admin-imports"] });
      setPhase("Ready");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open PDF."); setPhase("PDF could not be opened"); setBatch(null); }
    finally { setBusy(false); }
  }
  async function run() {
    const document = pdf.current;
    if (!document || !batch || running) return;
    setRunning(true); stop.current = false;
    try {
      const statuses = await loadStatuses(batch.id);
      const { scannerPage } = await import("@/lib/pdf-scanner");
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new Error("Please sign in again.");
      let failures = 0;
      const total = batch.page_count / 2;
      const CHUNK = 8;
      const uploadPair = async (index: number) => {
        const pair = pdfCardPair(batch.page_count, index);
        await Promise.all((["front", "back"] as const).map(async (side) => {
          const blob = await scannerPage(document, pair[side], dpi);
          const path = `${session.user.id}/${batch.id}/${index}-${side}.jpg`;
          const { error } = await supabase.storage.from("admin-card-scans").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
          if (error) throw new Error(error.message);
        }));
      };
      for (let start = 0; start < total; start += CHUNK) {
        if (stop.current) break;
        const indexes = Array.from({ length: Math.min(CHUNK, total - start) }, (_, i) => start + i).filter((i) => !isImportedPair(statuses.get(i) ?? ""));
        if (!indexes.length) continue;
        try {
          setPhase(`Cards ${indexes[0]! + 1}–${indexes[indexes.length - 1]! + 1} of ${total} · Uploading`);
          // Upload a few pairs at a time so big PDFs don't crawl.
          for (let i = 0; i < indexes.length; i += 4) await Promise.all(indexes.slice(i, i + 4).map(uploadPair));
          setPhase(`Cards ${indexes[0]! + 1}–${indexes[indexes.length - 1]! + 1} of ${total} · Identifying`);
          await processPairs({ data: { importId: batch.id, start: indexes[0]!, count: indexes.length, set: importSet } });
          failures = 0;
        } catch (error) {
          // Batch read failed — fall back to one card at a time for this chunk.
          toast.error(`Batch failed (${error instanceof Error ? error.message : "error"}); trying cards one by one.`);
          for (const index of indexes) {
            if (stop.current) break;
            try {
              setPhase(`Card ${index + 1} of ${total} · Identifying`);
              await processPair({ data: { importId: batch.id, index, set: importSet } });
              failures = 0;
            } catch (e) {
              failures++;
              toast.error(`Card ${index + 1}: ${e instanceof Error ? e.message : "Import failed"}`);
              if (failures >= 3) { stop.current = true; setPhase("Paused after repeated errors"); }
            }
          }
        }
        await loadStatuses(batch.id);
        qc.invalidateQueries({ queryKey: ["admin-import-pairs"] });
      }
      await loadStatuses(batch.id);
      qc.invalidateQueries({ queryKey: ["admin-import-pairs"] });
      qc.invalidateQueries({ queryKey: ["admin-images"] });
      qc.invalidateQueries({ queryKey: ["catalog-card"] });
      setPhase(stop.current ? "Paused" : "Import finished");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import failed."); setPhase("Paused"); }
    finally { setRunning(false); }
  }
  const [rotating, setRotating] = useState<string | null>(null);
  async function rotateImage(path: string) {
    setRotating(path);
    try {
      const { data, error } = await supabase.storage.from("admin-card-scans").createSignedUrl(path, 300);
      if (error || !data) throw new Error(error?.message ?? "Could not load image.");
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not load image."));
        img.src = data.signedUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalHeight; canvas.height = image.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Rotation is not supported in this browser.");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      const jpeg = path.endsWith(".jpg") || path.endsWith(".jpeg");
      if (jpeg) { ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not save rotated image.")), jpeg ? "image/jpeg" : "image/png", 0.9));
      const { error: uploadError } = await supabase.storage.from("admin-card-scans").upload(path, blob, { upsert: true, contentType: jpeg ? "image/jpeg" : "image/png" });
      if (uploadError) throw new Error(uploadError.message);
      await qc.invalidateQueries({ queryKey: ["admin-import-previews"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not rotate image."); }
    finally { setRotating(null); }
  }
  function edit(row: Pair) {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
    const str = (key: string) => typeof metadata[key] === "string" ? String(metadata[key]) : "";
    setDetails({ name: str("name"), set_name: str("set_name"), number: str("number"), year: str("year"), line: str("line"), variant: str("variant"), language: str("language") || "English", subcategory: str("subcategory") === "tcg" ? "tcg" : str("subcategory") === "nonsport" ? "nonsport" : "sports" });
    setEditing(row);
  }
  async function saveDetails(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return;
    setSaving(true);
    try {
      await confirm({ data: { pairId: editing.id, ...details } });
      toast.success("Card added to the database and daily price updates"); setEditing(null);
      qc.invalidateQueries({ queryKey: ["catalog-card"] });
      await loadStatuses(editing.import_id);
      qc.invalidateQueries({ queryKey: ["admin-import-pairs"] }); qc.invalidateQueries({ queryKey: ["admin-images"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save details."); }
    finally { setSaving(false); }
  }
  const total = batch?.page_count ? batch.page_count / 2 : 0;
  return <div className="space-y-8">
    <section className="space-y-4 border-b-2 border-ink pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={running || busy} onClick={() => input.current?.click()}><Upload />Choose PDF</Button>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void chooseFile(file); event.target.value = ""; }} />
          <label className="space-y-1 text-xs font-semibold">Scan resolution
            <select className="block h-9 rounded-md border-2 border-ink bg-background px-2 text-sm" value={dpi} disabled={running || busy || Boolean(batch)} onChange={e => setDpi(Number(e.target.value))}><option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option></select>
          </label>
        </div>
        {batch && <Button variant={running ? "outline" : "default"} disabled={busy} onClick={() => running ? (stop.current = true, setPhase("Pausing after current card…")) : void run()}>{running ? <Pause /> : <Play />}{running ? "Pause" : progress.saved ? "Resume import" : "Start import"}</Button>}
      </div>
      <div className="space-y-2 border-2 border-ink p-3">
        <p className="text-sm font-bold">Which set are these cards from?</p>
        <p className="text-xs text-muted-foreground">Optional, for sports cards. The set's checklist is loaded once and each card is matched by its number only — no images go to the card service.</p>
        {importSet
          ? <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{importSet.name}{importSet.year ? ` · ${importSet.year}` : ""}</span><Button size="sm" variant="outline" disabled={running} onClick={() => setImportSet(null)}>Change</Button></div>
          : <form onSubmit={lookupSets} className="flex flex-wrap items-end gap-2">
              <Input aria-label="Set name" placeholder="Set name, e.g. Topps" className="w-56" value={setQuery.name} onChange={e => setSetQuery(q => ({ ...q, name: e.target.value }))} />
              <Input aria-label="Year" placeholder="Year" className="w-24" value={setQuery.year} onChange={e => setSetQuery(q => ({ ...q, year: e.target.value }))} />
              <Button type="submit" size="sm" disabled={findingSets}>{findingSets ? "Searching…" : "Find set"}</Button>
            </form>}
        {!importSet && setResults.length > 0 && <div className="flex flex-wrap gap-2">{setResults.slice(0, 20).map(s => <Button key={s.id} size="sm" variant="outline" onClick={() => { setImportSet({ id: s.id, name: [s.releaseName, s.name && s.name !== "Base Set" ? s.name : null].filter(Boolean).join(" ") || s.name, year: s.releaseYear || null }); setSetResults([]); }}>{s.releaseName}{s.name && s.name !== "Base Set" ? ` · ${s.name}` : ""} · {s.releaseYear} · {s.cardCount} cards</Button>)}</div>}
      </div>
      {phase && <p role="status" className="text-sm font-semibold">{phase}</p>}
      {batch && <>
        <div className="flex flex-wrap items-center gap-2 text-sm"><FileText className="size-4" /><span className="break-all font-semibold">{batch.file_name}</span><span className="text-muted-foreground">{batch.page_count.toLocaleString()} pages · {total.toLocaleString()} cards</span></div>
        <progress className="h-2 w-full accent-primary" max={Math.max(total, 1)} value={progress.saved} aria-label="Cards imported" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[["Saved", progress.saved], ["Published cards", progress.approved], ["Awaiting review", progress.details], ["Failed", progress.failed]].map(([label, value]) => <div key={label}><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="font-display text-2xl font-black">{value}</p></div>)}</div>
      </>}
      {preview && <div className="flex gap-4">{(["front", "back"] as const).map(side => <figure key={side} className="w-36"><img src={preview[side]} alt={`First card ${side}`} className="aspect-[5/7] w-full border border-border bg-muted object-contain" /><figcaption className="mt-1 text-xs text-muted-foreground">{side === "front" ? "Page 1 · Front" : "Page 2 · Back"}</figcaption></figure>)}</div>}
    </section>
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Imports</h2><select aria-label="Select import" className="h-9 max-w-full rounded-md border-2 border-ink bg-background px-2 text-sm" value={selected ?? ""} disabled={running || busy} onChange={e => { setSelected(e.target.value || null); setPageIndex(0); }}><option value="">Select an import</option>{history.data?.map(row => <option key={row.id} value={row.id}>{row.file_name} · {row.page_count / 2} cards</option>)}</select></div>
      {history.isError && <p className="text-sm text-destructive">Imports could not be loaded.</p>}
      {selected && <>
        {pairs.isPending && <p className="text-sm text-muted-foreground">Loading cards…</p>}
        {pairs.isError && <Button variant="outline" onClick={() => pairs.refetch()}>Retry loading cards</Button>}
        {pairs.data?.length === 0 && <p className="text-sm text-muted-foreground">No cards imported yet.</p>}
        <div className="space-y-3">{pairs.data?.map(row => {
          const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
          return <article key={row.id} className="flex flex-wrap items-center gap-4 border-b border-border pb-3">
            <div className="flex gap-2">{[row.front_path, row.back_path].map((path, i) => <div key={path} className="space-y-1"><img src={images.data?.get(path) ?? undefined} alt={`Card ${row.pair_index + 1} ${i ? "back" : "front"}`} className="h-24 w-16 bg-muted object-contain" loading="lazy" /><Button variant="outline" size="sm" className="w-full" disabled={rotating === path || running} aria-label={`Rotate ${i ? "back" : "front"} image`} onClick={() => void rotateImage(path)}><RotateCw className={rotating === path ? "animate-spin" : undefined} />{rotating === path ? "…" : "Rotate"}</Button></div>)}</div>
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Card {row.pair_index + 1} · Pages {row.pair_index * 2 + 1}–{row.pair_index * 2 + 2}</p><h3 className="break-words font-bold">{typeof metadata["name"] === "string" ? metadata["name"] : "Scanned card"}</h3><p className="text-xs text-muted-foreground">{[metadata["set_name"], metadata["number"], metadata["year"]].filter(v => typeof v === "string").join(" · ")}</p><p className="mt-1 text-sm font-semibold">{labels[row.status] ?? row.status}</p>{row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}</div>
            {row.status === "needs_details" && <Button variant="outline" size="sm" disabled={running} onClick={() => edit(row)}><Pencil />Review card match</Button>}
          </article>;
        })}</div>
        <div className="flex items-center justify-end gap-3"><Button variant="outline" size="icon" aria-label="Previous cards" disabled={pageIndex === 0} onClick={() => setPageIndex(p => p - 1)}><ChevronLeft /></Button><span className="text-sm">Page {pageIndex + 1}</span><Button variant="outline" size="icon" aria-label="Next cards" disabled={(pairs.data?.length ?? 0) < 50} onClick={() => setPageIndex(p => p + 1)}><ChevronRight /></Button></div>
      </>}
    </section>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !saving) setEditing(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Review card match</DialogTitle></DialogHeader>
      {editing && <div className="grid grid-cols-2 gap-3">{[editing.front_path, editing.back_path].map((path, i) => <div key={path} className="space-y-2"><a href={images.data?.get(path) ?? undefined} target="_blank" rel="noreferrer"><img src={images.data?.get(path) ?? undefined} alt={`Review ${i ? "back" : "front"}`} className="h-64 w-full bg-muted object-contain" /></a><Button type="button" variant="outline" size="sm" disabled={rotating === path} onClick={() => void rotateImage(path)}><RotateCw className={rotating === path ? "animate-spin" : undefined} />Rotate {i ? "back" : "front"}</Button></div>)}</div>}
      <form onSubmit={saveDetails} className="space-y-4"><div className="grid grid-cols-2 gap-3">{(["name", "set_name", "number", "year", "line", "variant", "language"] as const).map(key => <label key={key} className="space-y-1 text-xs font-semibold">{{name:"Card / player name",set_name:"Set",number:"Card number",year:"Year",line:"Game / sport",variant:"Variant",language:"Language"}[key]}<Input required={key !== "variant"} value={details[key]} onChange={e => setDetails(d => ({ ...d, [key]: e.target.value }))} /></label>)}<label className="space-y-1 text-xs font-semibold">Category<select className="block h-9 w-full rounded-md border border-input bg-background px-2" value={details.subcategory} onChange={e => { const v = e.target.value; if (v === "sports" || v === "tcg" || v === "nonsport") setDetails(d => ({ ...d, subcategory: v })); }}><option value="sports">Sports</option><option value="tcg">TCG</option><option value="nonsport">Non-sport</option></select></label></div><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Confirm match & publish card"}</Button></form>
    </DialogContent></Dialog>
  </div>;
}