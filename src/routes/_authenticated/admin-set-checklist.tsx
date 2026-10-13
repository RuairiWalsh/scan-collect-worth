import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ListChecks, Search } from "lucide-react";
import { toast } from "sonner";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { missingSetCards, searchCardSets } from "@/lib/admin-set-checklist.functions";

export const Route = createFileRoute("/_authenticated/admin-set-checklist")({
  head: () => ({ meta: [
    { title: "Set Checklist — Lymitz Admin" },
    { name: "description", content: "See which card numbers of a set are still missing from the Lymitz catalog." },
    { property: "og:title", content: "Set Checklist — Lymitz Admin" },
    { property: "og:description", content: "See which card numbers of a set are still missing from the Lymitz catalog." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type SetRow = { id: string; name: string; cardCount: number; releaseName: string; releaseYear: string };
type Missing = { total: number; have: number; missing: { number: string; name: string }[] };

function Page() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <main className="p-8 text-center"><h1 className="text-2xl font-bold">Admins only</h1><Link to="/collection">Back to collection</Link></main>;
  return <Checklist />;
}

function Checklist() {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [sets, setSets] = useState<SetRow[]>([]);
  const [picked, setPicked] = useState<SetRow | null>(null);
  const [result, setResult] = useState<Missing | null>(null);

  const findSets = useMutation({
    mutationFn: () => searchCardSets({ data: { name: name.trim(), year: year.trim() || undefined } }),
    onSuccess: (rows) => { setSets(rows as SetRow[]); setPicked(null); setResult(null); if (!(rows as SetRow[]).length) toast.info("No sets found — try the brand name, e.g. Topps Gold Label."); },
    onError: (e) => toast.error(e.message),
  });
  const check = useMutation({
    mutationFn: (setId: string) => missingSetCards({ data: { setId } }),
    onSuccess: (r) => setResult(r as Missing),
    onError: (e) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/admin"><ArrowLeft className="size-4" /></Link></Button>
        <h1 className="font-display text-3xl font-black">Set checklist</h1>
      </div>
      <p className="text-sm text-muted-foreground">Find which card numbers of a sports set are still missing from our catalog — handy before scanning a batch.</p>

      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Set name, e.g. Topps Gold Label" className="max-w-xs" />
        <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year (optional)" className="w-32" />
        <Button disabled={!name.trim() || findSets.isPending} onClick={() => findSets.mutate()}>
          <Search className="size-4" />{findSets.isPending ? "Searching…" : "Find sets"}
        </Button>
      </div>

      {sets.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Matching sets</h2>
          <div className="divide-y rounded-md border">
            {sets.map((s) => (
              <button
                key={s.id}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                onClick={() => { setPicked(s); setResult(null); check.mutate(s.id); }}
              >
                <span className="font-medium">{s.releaseYear} {s.releaseName} — {s.name}</span>
                <span className="text-sm text-muted-foreground">{s.cardCount} cards</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {check.isPending && <p className="text-muted-foreground">Checking the catalog…</p>}

      {picked && result && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {picked.releaseYear} {picked.releaseName} — {picked.name}
          </h2>
          <p className="text-sm">
            <ListChecks className="mr-1 inline size-4" />
            We have <strong>{result.have}</strong> of <strong>{result.total}</strong> cards.
            {result.missing.length === 0
              ? " Nothing missing — the set is complete."
              : ` Missing ${result.missing.length}:`}
          </p>
          {result.missing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.missing.map((m, i) => (
                <span key={i} title={m.name} className="rounded border px-2 py-0.5 font-mono text-sm">#{m.number}</span>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
