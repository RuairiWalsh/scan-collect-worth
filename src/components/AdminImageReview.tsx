import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ReviewStatus = "pending" | "approved" | "rejected";

export function AdminImageReview() {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [preview, setPreview] = useState<{ image: string; name: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const queue = useQuery({
    queryKey: ["admin-images", status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_image_queue", { _status: status });
      if (error) throw error;
      return data;
    },
  });
  const review = useMutation({
    mutationFn: async ({ key, approve }: { key: string; approve: boolean }) => {
      const existingNote = queue.data?.find(row => row.card_key === key)?.review_note;
      const { error } = await supabase.rpc("admin_review_image", { _key: key, _approve: approve, _note: notes[key] ?? existingNote ?? "" });
      if (error) throw error;
    },
    onSuccess: (_data, action) => {
      toast.success(action.approve ? "Image approved for sharing" : "Image rejected — hidden from shared pages");
      qc.invalidateQueries({ queryKey: ["admin-images"] });
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["catalog-card"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Image review</h2>
        <div className="flex gap-2" role="group" aria-label="Image review status">
          {(["pending", "approved", "rejected"] as const).map(value => (
            <Button key={value} size="sm" variant={value === status ? "default" : "outline"} onClick={() => setStatus(value)} aria-pressed={value === status}>
              {value === "pending" ? "Pending" : value === "approved" ? "Approved" : "Rejected"}
            </Button>
          ))}
        </div>
      </div>
      {queue.isPending && <p className="text-sm text-muted-foreground">Loading images…</p>}
      {queue.isError && <div className="flex items-center gap-3 text-sm"><p>Images could not be loaded.</p><Button variant="outline" size="sm" onClick={() => queue.refetch()}>Try again</Button></div>}
      {queue.data?.length === 0 && <p className="text-sm text-muted-foreground">No {status} images.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(queue.data ?? []).map(row => {
          const metadata = row.card_metadata && typeof row.card_metadata === "object" && !Array.isArray(row.card_metadata) ? row.card_metadata : {};
          const name = typeof metadata["name"] === "string" ? metadata["name"] : "Scanned card";
          const details = [metadata["line"], metadata["set_name"], metadata["number"], metadata["variant"]].filter(v => typeof v === "string").join(" · ");
          return (
            <article key={row.card_key} className="panel space-y-3 p-3">
              <div className="grid grid-cols-2 gap-2">
                {([{ image: row.image, label: "Product image" }, { image: row.original_scan, label: "Original scan" }]).map(({ image, label }) => (
                  <div key={label} className="space-y-1">
                    {image ? <Button variant="ghost" className="h-auto w-full p-0" aria-label={`Enlarge ${label} of ${name}`} onClick={() => setPreview({ image, name: `${name} — ${label}` })}><img src={image} alt={`${name} ${label}`} className="aspect-[5/7] w-full bg-muted object-contain" loading="lazy" /></Button> : <div className="flex aspect-[5/7] items-center justify-center bg-muted text-muted-foreground"><ImageOff className="size-6" /></div>}
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div><h3 className="font-bold">{name}</h3><p className="text-xs text-muted-foreground">{details}</p></div>
              <p className="text-xs text-muted-foreground">{row.reviewed_at ? `Reviewed ${new Date(row.reviewed_at).toLocaleString()}` : `Submitted ${new Date(row.updated_at).toLocaleString()}`}</p>
              <Input aria-label={`Review note for ${name}`} placeholder="Review note (optional)" maxLength={1000} value={notes[row.card_key] ?? row.review_note ?? ""} onChange={event => setNotes(n => ({ ...n, [row.card_key]: event.target.value }))} />
              <div className="flex gap-2">
                <Button size="sm" disabled={review.isPending || status === "approved"} onClick={() => review.mutate({ key: row.card_key, approve: true })}><Check className="size-4" />Approve</Button>
                <Button size="sm" variant="outline" disabled={review.isPending || status === "rejected"} onClick={() => review.mutate({ key: row.card_key, approve: false })}><X className="size-4" />Reject</Button>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>{preview && <img src={preview.image} alt={preview.name} className="max-h-[70vh] w-full object-contain" />}</DialogContent>
      </Dialog>
    </section>
  );
}