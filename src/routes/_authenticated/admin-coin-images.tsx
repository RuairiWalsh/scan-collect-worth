import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-coin-images")({
  head: () => ({ meta: [
    { title: "Coin Images — Lymitz Admin" },
    { name: "description", content: "Upload mint images for each coin and year in Lymitz." },
    { property: "og:title", content: "Coin Images — Lymitz Admin" },
    { property: "og:description", content: "Upload mint images for each coin and year in Lymitz." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type Side = "obverse" | "reverse";

function Page() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <main className="p-8 text-center"><h1 className="text-2xl font-bold">Admins only</h1><Link to="/collection">Back to collection</Link></main>;
  return <CoinImages />;
}

function CoinImages() {
  const qc = useQueryClient();
  const [manual, setManual] = useState({ type: "", year: "" });
  const queue = useQuery({ queryKey: ["coin-image-queue"], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_coin_image_queue");
    if (error) throw error;
    return data;
  } });
  const upload = useMutation({
    mutationFn: async ({ typeId, year, side, file }: { typeId: number; year: string; side: Side; file: File }) => {
      if (!/^\d{1,9}$/.test(String(typeId)) || !/^\d{3,4}$/.test(year)) throw new Error("Enter a Numista type number and a year");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${typeId}/${year}-${side}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("coin-images").upload(path, file, { contentType: file.type, upsert: true });
      if (up.error) throw up.error;
      const { error } = await supabase.from("coin_images").upsert({ type_id: typeId, year, side, storage_path: path });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Coin image saved");
      qc.invalidateQueries({ queryKey: ["coin-image-queue"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });
  const pick = (typeId: number, year: string, side: Side) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload.mutate({ typeId, year, side, file });
  };
  const fileBtn = (typeId: number, year: string, side: Side, done: boolean) => (
    <label className="inline-flex cursor-pointer items-center gap-2 border-2 border-ink bg-background px-3 py-1.5 text-sm font-semibold">
      <Upload className="size-4" />{done ? `Replace ${side}` : `Upload ${side}`}
      <input type="file" accept="image/*" className="sr-only" onChange={pick(typeId, year, side)} disabled={upload.isPending} />
    </label>
  );
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-black">Coin images</h1><Button asChild variant="outline"><Link to="/admin"><ArrowLeft />Back to admin</Link></Button></div>
    <p className="text-sm text-muted-foreground">Upload mint images (e.g. US Mint) per coin and year. They replace the Numista picture for every coin of that year and never expire.</p>
    <section className="panel space-y-3 p-4">
      <h2 className="font-bold">Add any coin</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Numista type #<input value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value.trim() })} inputMode="numeric" className="mt-1 block w-32 border border-border bg-background p-2 font-normal" /></label>
        <label className="text-sm font-semibold">Year<input value={manual.year} onChange={(e) => setManual({ ...manual, year: e.target.value.trim() })} inputMode="numeric" className="mt-1 block w-24 border border-border bg-background p-2 font-normal" /></label>
        {/^\d{1,9}$/.test(manual.type) && /^\d{3,4}$/.test(manual.year) && <>
          {fileBtn(Number(manual.type), manual.year, "obverse", false)}
          {fileBtn(Number(manual.type), manual.year, "reverse", false)}
        </>}
      </div>
    </section>
    <h2 className="font-bold">Coins in collections</h2>
    {queue.isPending && <p className="text-muted-foreground">Loading coins…</p>}
    {queue.isError && <p role="alert" className="text-destructive">{queue.error.message}</p>}
    {queue.data?.length === 0 && <p className="text-muted-foreground">No matched coins yet.</p>}
    <div className="grid gap-4 md:grid-cols-2">{queue.data?.map((c) => (
      <article key={`${c.type_id}-${c.year}`} className="panel flex gap-4 p-4">
        <div className="grid w-40 shrink-0 grid-cols-2 gap-1">
          {c.has_obverse ? <img src={`/api/public/coin-images/${c.type_id}?side=obverse&year=${c.year}&src=lymitz`} alt={`${c.name} obverse`} className="aspect-square w-full bg-muted object-contain" /> : c.scan ? <img src={c.scan} alt={`Scan of ${c.name}`} className="aspect-square w-full bg-muted object-contain" /> : <div className="aspect-square bg-muted" />}
          {c.has_reverse ? <img src={`/api/public/coin-images/${c.type_id}?side=reverse&year=${c.year}&src=lymitz`} alt={`${c.name} reverse`} className="aspect-square w-full bg-muted object-contain" /> : <div className="aspect-square bg-muted" />}
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="font-bold">{c.year} {c.name}</h3>
          <p className="text-xs text-muted-foreground">{c.country} · Numista #{c.type_id} · {c.item_count} in collections</p>
          <div className="flex flex-wrap gap-2">{fileBtn(c.type_id, c.year, "obverse", c.has_obverse)}{fileBtn(c.type_id, c.year, "reverse", c.has_reverse)}</div>
        </div>
      </article>
    ))}</div>
  </main>;
}
