import { createFileRoute } from "@tanstack/react-router";

// Serves an admin-uploaded official stamp image from private storage via a short-lived link.
export const Route = createFileRoute("/api/public/stamp-images/$id")({
  server: { handlers: { GET: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response(null, { status: 404 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("stamp_catalog").select("image_path").eq("id", params.id).maybeSingle();
    if (!row?.image_path) return new Response(null, { status: 404 });
    const { data: signed } = await supabaseAdmin.storage.from("stamp-images").createSignedUrl(row.image_path, 3600);
    if (!signed?.signedUrl) return new Response(null, { status: 404 });
    return new Response(null, { status: 302, headers: { Location: signed.signedUrl, "Cache-Control": "public, max-age=1800" } });
  } } },
});
