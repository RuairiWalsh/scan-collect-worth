import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ListChecks, Search } from "lucide-react";
import { toast } from "sonner";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { missingSetCards, scannedSetCards, scannedSets, searchCardSets } from "@/lib/admin-set-checklist.functions";

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
type Missing = { total: number; have: number; missing: { number: string; name: string }[]; sizeKnown?: boolean };
type Have = { have: number; cards: { number: string; name: string }[] };

function Page() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <main className="p-8 text-center"><h1 className="text-2xl font-bold">Admins only</h1><Link to="/collection">Back to collection</Link></main>;
  return <Checklist />;
}

function MissingList({ title, result }: { title: string; result: Missing }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="text-sm">
        <ListChecks className="mr-1 inline size-4" />
        We have <strong>{result.have}</strong> of <strong>{result.total}</strong> cards.
        {result.missing.length === 0
          ? " Nothing missing — the set is complete."
          : ` Missing ${result.missing.length}:`}
      </p>
      {result.sizeKnown === false && (
        <p className="text-xs text-muted-foreground">Couldn't confirm this set's full size, so the list stops at the highest card number we have.</p>
      )}
      {result.missing.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.missing.map((m, i) => (
            <span key={i} title={m.name} className="rounded border px-2 py-0.5 font-mono text-sm">#{m.number}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function HaveList({ title, result }: { title: string; result: Have }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="text-sm">
        <ListChecks className="mr-1 inline size-4" />
        We have <strong>{result.have}</strong> cards from this set:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {result.cards.map((c, i) => (
          <span key={i} title={c.name} className="rounded border px-2 py-0.5 font-mono text-sm">#{c.number}</span>
        ))}
      </div>
    </section>
  );
}

function Checklist() {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [sets, setSets] = useState<SetRow[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<Missing | null>(null);
  const [haveResult, setHaveResult] = useState<Have | null>(null);

  const scanned = useQuery({ queryKey: ["admin-scanned-sets"], queryFn: () => scannedSets() });

  const findSets = useMutation({
    mutationFn: () => searchCardSets({ data: { name: name.trim(), year: year.trim() || undefined } }),
    onSuccess: (rows) => { setSets(rows as SetRow[]); setPicked(null); setResult(null); if (!(rows as SetRow[]).length) toast.info("No sets found — try the brand name, e.g. Topps Gold Label."); },
    onError: (e) => toast.error(e.message),
  });
  const check = useMutation({
    mutationFn: (setId: string) => missingSetCards({ data: { setId } }),
    onError: (e) => toast.error(e.message),
  });
  const checkScanned = useMutation({
    mutationFn: (s: { setName: string; year: string }) => scannedSetCards({ data: { setName: s.setName, year: s.year || undefined } }),
    onSuccess: (r, s) => { setPicked(`${s.year} ${s.setName}`.trim()); setResult(null); setHaveResult(r as Have); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/admin"><ArrowLeft className="size-4" /></Link></Button>
        <h1 className="font-display text-3xl font-black">Set checklist</h1>
      </div>
      <p className="text-sm text-muted-foreground">Sets already in our catalog, and the card numbers we have for each — handy before scanning a batch.</p>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Sets we've scanned</h2>
        {scanned.isPending && <p className="text-sm text-muted-foreground">Loading sets…</p>}
        {scanned.isError && <p className="text-sm text-destructive">Sets could not be loaded.</p>}
        {scanned.data?.length === 0 && <p className="text-sm text-muted-foreground">No sports sets in the catalog yet.</p>}
        {scanned.data && scanned.data.length > 0 && (
          <div className="divide-y rounded-md border">
            {scanned.data.map((s) => (
              <button
                key={`${s.setName}|${s.year}`}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                disabled={checkScanned.isPending}
                onClick={() => { setResult(null); setHaveResult(null); checkScanned.mutate(s); }}
              >
                <span className="font-medium">{s.year} {s.setName}</span>
                <span className="text-sm text-muted-foreground">{s.count} in catalog</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {checkScanned.isPending && <p className="text-muted-foreground">Reading the catalog…</p>}
      {picked && haveResult && <HaveList title={picked} result={haveResult} />}

      <section className="space-y-2 border-t-2 border-ink pt-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Look up any other set</h2>
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Set name, e.g. Topps Gold Label" className="max-w-xs" />
          <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year (optional)" className="w-32" />
          <Button disabled={!name.trim() || findSets.isPending} onClick={() => findSets.mutate()}>
            <Search className="size-4" />{findSets.isPending ? "Searching…" : "Find sets"}
          </Button>
        </div>
        {sets.length > 0 && (
          <div className="divide-y rounded-md border">
            {sets.map((s) => (
              <button
                key={s.id}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                onClick={() => { setPicked(`${s.releaseYear} ${s.releaseName} — ${s.name}`); setResult(null); setHaveResult(null); check.mutate(s.id); }}
              >
                <span className="font-medium">{s.releaseYear} {s.releaseName} — {s.name}</span>
                <span className="text-sm text-muted-foreground">{s.cardCount} cards</span>
              </button>
            ))}
          </div>
        )}
        {check.isPending && <p className="text-muted-foreground">Checking the catalog…</p>}
        {picked && result && !checkScanned.isPending && check.isSuccess && <MissingList title={picked} result={result} />}
      </section>
    </main>
  );
}
