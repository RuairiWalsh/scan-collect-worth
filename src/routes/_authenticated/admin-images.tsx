import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Upload } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";
import { AdminImageReview } from "@/components/AdminImageReview";

export const Route = createFileRoute("/_authenticated/admin-images")({
  head: () => ({
    meta: [
      { title: "Image Review — Lymitz Admin" },
      { name: "description", content: "Review, approve or reject scanned card images in the Lymitz admin portal." },
      { property: "og:title", content: "Image Review — Lymitz Admin" },
      { property: "og:description", content: "Review, approve or reject scanned card images in the Lymitz admin portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminImagesPage,
});

function AdminImagesPage() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-extrabold">Admins only</h1>
        <Link to="/collection" className="mt-4 inline-block text-primary underline">Back to collection</Link>
      </div>
    );
  }
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black">Image review</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link to="/admin-import"><Upload className="size-4" />Import scanner PDF</Link></Button>
          <Button asChild variant="outline">
            <Link to="/admin"><ArrowLeft className="size-4" />Back to admin</Link>
          </Button>
        </div>
      </div>
      <AdminImageReview />
    </main>
  );
}