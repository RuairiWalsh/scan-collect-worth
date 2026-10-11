import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AdminCardImport } from "@/components/AdminCardImport";
import { Button } from "@/components/ui/button";
import { useRoles } from "@/hooks/use-roles";

export const Route = createFileRoute("/_authenticated/admin-import")({
  head: () => ({ meta: [
    { title: "Scanner PDF Imports — Lymitz Admin" },
    { name: "description", content: "Review paired scanner images, confirm card matches, and add cards to Lymitz with daily prices." },
    { property: "og:title", content: "Scanner PDF Imports — Lymitz Admin" },
    { property: "og:description", content: "Review paired scanner images, confirm card matches, and add cards to Lymitz with daily prices." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminImportPage,
});

function AdminImportPage() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="mx-auto max-w-md p-8 text-center"><h1 className="text-2xl font-extrabold">Admins only</h1><Link to="/collection" className="mt-4 inline-block text-primary underline">Back to collection</Link></div>;
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-black">Scanner PDF imports</h1><Button asChild variant="outline"><Link to="/admin"><ArrowLeft />Back to admin</Link></Button></div><AdminCardImport /></main>;
}