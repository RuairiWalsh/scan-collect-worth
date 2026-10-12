import { createFileRoute } from "@tanstack/react-router";

// Serves a coin picture: an admin-uploaded mint image for this type+year when one exists,
// otherwise Numista's picture (links cached ≤7 days, then refetched).
export const Route = createFileRoute("/api/public/coin-images/$typeId")({
  server: { handlers: { GET: async ({ request, params }) => {
    if (!/^\d{1,9}$/.test(params.typeId)) return new Response(null, { status: 404 });
    const q = new URL(request.url).searchParams;
    const side = q.get("side") === "reverse" ? "reverse" : "obverse";
    const year = q.get("year");
    const typeId = Number(params.typeId);
    if (year && /^\d{3,4}$/.test(year)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin.from("coin_images").select("storage_path").eq("type_id", typeId).eq("year", year).eq("side", side).maybeSingle();
      if (row) {
        const { data: signed } = await supabaseAdmin.storage.from("coin-images").createSignedUrl(row.storage_path, 3600);
        if (signed?.signedUrl) return new Response(null, { status: 302, headers: { Location: signed.signedUrl, "Cache-Control": "public, max-age=1800" } });
      }
    }
    const { numistaType } = await import("@/server/numista.server");
    const type = await numistaType(typeId).catch(() => null);
    const url = type?.[side]?.picture ?? type?.[side]?.thumbnail;
    if (!url || !/^https:\/\/[a-z0-9.-]*numista\.com\//.test(url)) return new Response(null, { status: 404 });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=86400" } });
  } } },
});
