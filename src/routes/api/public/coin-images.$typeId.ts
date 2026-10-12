import { createFileRoute } from "@tanstack/react-router";

// Redirects to Numista's coin picture. Picture links are only cached for 7 days, then refetched.
export const Route = createFileRoute("/api/public/coin-images/$typeId")({
  server: { handlers: { GET: async ({ request, params }) => {
    if (!/^\d{1,9}$/.test(params.typeId)) return new Response(null, { status: 404 });
    const side = new URL(request.url).searchParams.get("side") === "reverse" ? "reverse" : "obverse";
    const { numistaType } = await import("@/server/numista.server");
    const type = await numistaType(Number(params.typeId)).catch(() => null);
    const url = type?.[side]?.picture ?? type?.[side]?.thumbnail;
    if (!url || !/^https:\/\/[a-z0-9.-]*numista\.com\//.test(url)) return new Response(null, { status: 404 });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=86400" } });
  } } },
});
