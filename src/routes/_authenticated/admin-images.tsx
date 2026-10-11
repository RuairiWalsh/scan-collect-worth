import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-images")({
  head: () => ({ meta: [
    { title: "Sports Image Review — Lymitz Admin" },
    { name: "description", content: "Review and approve CardSight sports-card images for Lymitz." },
    { property: "og:title", content: "Sports Image Review — Lymitz Admin" },
    { property: "og:description", content: "Review and approve CardSight sports-card images for Lymitz." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ImageReviewPage,
});

function ImageReviewPage() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <main className="p-8 text-center"><h1 className="text-2xl font-bold">Admins only</h1><Link to="/collection">Back to collection</Link></main>;
  return <SportsImageReview />;
}

function SportsImageReview() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["sports-image-review", status], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_image_queue", { _status: status });
    if (error) throw error;
    return data;
  } });
  const review = useMutation({ mutationFn: async ({ key, approve }: { key: string; approve: boolean }) => {
    const { error } = await supabase.rpc("admin_review_image", { _key: key, _approve: approve, _note: notes[key] || undefined });
    if (error) throw error;
  }, onSuccess: (_data, action) => {
    toast.success(action.approve ? "Image approved" : "Image rejected");
    qc.invalidateQueries({ queryKey: ["sports-image-review"] });
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["market"] });
  }, onError: (error) => toast.error(error.message) });
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-black">Sports image review</h1><Button asChild variant="outline"><Link to="/admin"><ArrowLeft />Back to admin</Link></Button></div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Review status">{(["pending", "approved", "rejected"] as const).map(value => <Button key={value} role="tab" aria-selected={value === status} variant={value === status ? "default" : "outline"} onClick={() => setStatus(value)} className="capitalize">{value}</Button>)}</div>
    {queue.isPending && <p className="text-muted-foreground">Loading images…</p>}
    {queue.isError && <div role="alert" className="text-destructive">{queue.error.message}<Button variant="outline" onClick={() => queue.refetch()} className="ml-3">Retry</Button></div>}
    {queue.data?.length === 0 && <p className="py-8 text-muted-foreground">No {status} sports-card images.</p>}
    <div className="grid gap-5 md:grid-cols-2">{queue.data?.map(row => {
      const metadata = row.card_metadata && typeof row.card_metadata === "object" && !Array.isArray(row.card_metadata) ? row.card_metadata : {};
      const name = String(metadata.name || "Sports card");
      return <article key={row.card_key} className="panel space-y-3 p-4">
        <h2 className="text-lg font-bold">{name}</h2><p className="text-sm text-muted-foreground">{[metadata.year, metadata.set_name, metadata.number, metadata.variant].filter(Boolean).join(" · ")}</p>
        <div className="grid grid-cols-2 gap-3">{[["Original scan", row.original_scan], ["CardSight image", row.image]].map(([label, image]) => <figure key={label}><figcaption className="mb-2 text-xs font-bold">{label}</figcaption>{image ? <img src={image} alt={`${name} — ${label}`} className="aspect-[2/3] w-full object-contain bg-muted" /> : <div className="aspect-[2/3] bg-muted" />}</figure>)}</div>
        <label className="block text-sm font-semibold">Review note<textarea value={notes[row.card_key] ?? row.review_note ?? ""} maxLength={1000} onChange={event => setNotes(prev => ({ ...prev, [row.card_key]: event.target.value }))} className="mt-1 min-h-20 w-full border border-border bg-background p-2 font-normal" /></label>
        <div className="flex flex-wrap gap-2"><Button disabled={review.isPending || status === "approved"} onClick={() => review.mutate({ key: row.card_key, approve: true })}><Check />Approve</Button><Button variant="outline" disabled={review.isPending || status === "rejected"} onClick={() => review.mutate({ key: row.card_key, approve: false })}><X />Reject</Button></div>
      </article>;
    })}</div>
  </main>;
}