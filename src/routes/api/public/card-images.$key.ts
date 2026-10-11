import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/card-images/$key")({
  server: { handlers: { GET: async ({ request, params }) => {
    if (!/^[a-f0-9]{64}$/.test(params.key)) return new Response(null, { status: 404 });
    const side = new URL(request.url).searchParams.get("side");
    if (side !== "front" && side !== "back") return new Response(null, { status: 404 });
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"];
    if (!key || !url) return new Response(null, { status: 503 });
    const db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    // Anonymous RLS must return an approved image before privileged storage access.
    const { data: card, error } = await db.from("card_product_images").select("source,front_storage_path,back_storage_path").eq("card_key", params.key).eq("status", "ready").eq("review_status", "approved").maybeSingle();
    const path = side === "back" ? card?.back_storage_path : card?.front_storage_path;
    if (error || card?.source !== "admin_scanner" || !path) return new Response(null, { status: 404 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: image, error: downloadError } = await supabaseAdmin.storage.from("admin-card-scans").download(path);
    if (downloadError || !image) return new Response(null, { status: 404 });
    return new Response(image, { headers: { "Content-Type": image.type || "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } } },
});