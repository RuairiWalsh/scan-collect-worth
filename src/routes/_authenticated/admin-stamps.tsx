import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";
import { parseStampNumber, stampImagePath, stampMatchKey } from "@/lib/stamp-catalog";

export const Route = createFileRoute("/_authenticated/admin-stamps")({
  head: () => ({ meta: [
    { title: "Stamp Database — Lymitz Admin" },
    { name: "description", content: "Build the Lymitz stamp database and upload official stamp images." },
    { property: "og:title", content: "Stamp Database — Lymitz Admin" },
    { property: "og:description", content: "Build the Lymitz stamp database and upload official stamp images." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <main className="p-8 text-center"><h1 className="text-2xl font-bold">Admins only</h1><Link to="/collection">Back to collection</Link></main>;
  return <StampDb />;
}

const empty = { country: "", year: "", name: "", denomination: "", number: "" };
const input = "mt-1 block w-full border border-border bg-background p-2 font-normal";

function StampDb() {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState("");
  const list = useQuery({ queryKey: ["admin-stamps"], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_stamp_catalog");
    if (error) throw error;
    return data;
  } });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-stamps"] }); qc.invalidateQueries({ queryKey: ["items"] }); };
  const add = useMutation({
    mutationFn: async () => {
      const key = stampMatchKey({ country: form.country, year: form.year, name: form.name, denomination: form.denomination || null });
      if (!key) throw new Error("Country, 4-digit year and design title are required");
      const num = form.number ? parseStampNumber(form.number) : null;
      if (form.number && !num) throw new Error("Catalog number not recognised (e.g. Scott 704, SG 1)");
      const { error } = await supabase.from("stamp_catalog").insert({ match_key: key, country: form.country, year: form.year, name: form.name, denomination: form.denomination || null, catalog_system: num?.system ?? null, catalog_number: num?.number ?? null, source: "admin" });
      if (error) throw new Error(error.code === "23505" ? "That stamp is already in the database" : error.message);
    },
    onSuccess: () => { toast.success("Stamp added"); setForm(empty); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add stamp"),
  });
  const upload = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("stamp-images").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { error } = await supabase.from("stamp_catalog").update({ image_path: path }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Official image saved"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });
  const setNumber = useMutation({
    mutationFn: async ({ id, raw }: { id: string; raw: string }) => {
      const num = raw.trim() ? parseStampNumber(raw) : null;
      if (raw.trim() && !num) throw new Error("Catalog number not recognised (e.g. Scott 704, SG 1)");
      const { error } = await supabase.from("stamp_catalog").update({ catalog_system: num?.system ?? null, catalog_number: num?.number ?? null }).eq("id", id);
      if (error) throw new Error(error.code === "23505" ? "Another stamp already has that number" : error.message);
    },
    onSuccess: () => { toast.success("Catalog number saved"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const rows = (list.data ?? []).filter((s) => !filter || `${s.country} ${s.year} ${s.name} ${s.denomination} ${s.catalog_number}`.toLowerCase().includes(filter.toLowerCase()));
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-black">Stamp database</h1><Button asChild variant="outline"><Link to="/admin"><ArrowLeft />Back to admin</Link></Button></div>
    <p className="text-sm text-muted-foreground">Stamps are added here and automatically from users' scans. Users see their own scan until you upload an official image; scans are never shared.</p>
    <form className="panel grid gap-3 p-4 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
      <h2 className="font-bold sm:col-span-6">Add a stamp</h2>
      <label className="text-sm font-semibold sm:col-span-2">Country<input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={input} /></label>
      <label className="text-sm font-semibold">Year<input required inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value.trim() })} className={input} /></label>
      <label className="text-sm font-semibold sm:col-span-3">Design title<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Face value / colour<input value={form.denomination} placeholder="3c purple" onChange={(e) => setForm({ ...form, denomination: e.target.value })} className={input} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Catalog number<input value={form.number} placeholder="Scott 704" onChange={(e) => setForm({ ...form, number: e.target.value })} className={input} /></label>
      <div className="flex items-end sm:col-span-2"><Button type="submit" disabled={add.isPending}><Plus />Add stamp</Button></div>
    </form>
    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search stamps…" aria-label="Search stamps" className="w-full border-2 border-ink bg-background p-2" />
    {list.isPending && <p className="text-muted-foreground">Loading stamps…</p>}
    {list.isError && <p role="alert" className="text-destructive">{list.error.message}</p>}
    {list.data && rows.length === 0 && <p className="text-muted-foreground">No stamps yet.</p>}
    <div className="grid gap-4 md:grid-cols-2">{rows.map((s) => (
      <article key={s.id} className="panel flex gap-4 p-4">
        <div className="grid w-40 shrink-0 grid-cols-2 gap-1">
          {s.image_path ? <img src={stampImagePath(s.id)} alt={`${s.name} official`} className="aspect-square w-full bg-muted object-contain" /> : <div className="flex aspect-square items-center justify-center bg-muted text-[10px] text-muted-foreground">No official</div>}
          {s.scan ? <img src={s.scan} alt={`Scan of ${s.name}`} className="aspect-square w-full bg-muted object-contain" /> : <div className="aspect-square bg-muted" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-bold">{s.year} {s.name}</h3>
          <p className="text-xs text-muted-foreground">{[s.country, s.denomination, s.source === "scan" ? "from a scan" : "added by admin", `${s.item_count} in collections`].filter(Boolean).join(" · ")}</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setNumber.mutate({ id: s.id, raw: String(new FormData(e.currentTarget).get("n") ?? "") }); }}>
            <input name="n" aria-label="Catalog number" defaultValue={s.catalog_number ? `${s.catalog_system === "scott" ? "Scott" : s.catalog_system?.toUpperCase()} ${s.catalog_number}` : ""} placeholder="Scott 704" className="w-32 border border-border bg-background p-1 text-sm" />
            <Button type="submit" size="sm" variant="outline" disabled={setNumber.isPending}>Save #</Button>
          </form>
          <label className="inline-flex cursor-pointer items-center gap-2 border-2 border-ink bg-background px-3 py-1.5 text-sm font-semibold">
            <Upload className="size-4" />{s.image_path ? "Replace official image" : "Upload official image"}
            <input type="file" accept="image/*" className="sr-only" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload.mutate({ id: s.id, file: f }); }} />
          </label>
        </div>
      </article>
    ))}</div>
  </main>;
}
