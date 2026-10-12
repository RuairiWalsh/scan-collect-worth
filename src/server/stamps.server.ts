// Server-only: match a scanned stamp to Lymitz's own stamp database, adding it when new.
import type { Identification } from "@/lib/scan.functions";
import { parseStampNumber, stampCatalogId, stampCountry, stampImagePath, stampMatchKey } from "@/lib/stamp-catalog";

export async function matchStamp(result: Identification) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const country = result.subcategory && result.subcategory !== "world" ? result.subcategory : result.set_name;
  const denomination = result.variant;
  const key = stampMatchKey({ country, year: result.year, name: result.name, denomination });
  const num = parseStampNumber(result.number);
  type Row = { id: string; image_path: string | null };
  let row: Row | null = null;
  if (num && country) {
    const { data } = await db.from("stamp_catalog").select("id, image_path, country").ilike("catalog_system", num.system).ilike("catalog_number", num.number);
    row = (data ?? []).find((r) => stampCountry(r.country) === stampCountry(country)) ?? null;
  }
  if (!row && key) {
    row = (await db.from("stamp_catalog").select("id, image_path").eq("match_key", key).maybeSingle()).data;
  }
  if (!row && key && country) {
    const { data } = await db.from("stamp_catalog")
      .upsert({ match_key: key, country, year: result.year, name: result.name, denomination, catalog_system: num?.system ?? null, catalog_number: num?.number ?? null, source: "scan", created_by: null }, { onConflict: "match_key" })
      .select("id, image_path").maybeSingle();
    row = data;
  }
  if (!row) return;
  result.catalog_id = stampCatalogId(row.id);
  // Official images only; until one is uploaded the user's own scan is shown.
  result.product_image = row.image_path ? stampImagePath(row.id) : null;
}
