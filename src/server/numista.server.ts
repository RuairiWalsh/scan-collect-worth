// Server-only: Numista coin catalog (identification, images, prices). Data is cached ≤7 days per Numista's terms.
import { numistaCacheFresh, numistaGrade, pickNumistaIssue, rankNumistaTypes, type NumistaIssue, type NumistaTypeSummary } from "@/lib/numista";
import type { PriceSource } from "@/lib/pricing";

const BASE = "https://api.numista.com/v3";

export function numistaConfigured() {
  return Boolean(process.env["NUMISTA_API_KEY"]);
}

async function nFetch<T>(path: string): Promise<T | null> {
  const key = process.env["NUMISTA_API_KEY"];
  if (!key) return null;
  const res = await fetch(`${BASE}${path}`, { headers: { "Numista-API-Key": key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.error("Numista", path, res.status);
    return null;
  }
  return res.json() as Promise<T>;
}

export type NumistaTypeData = {
  id: number; title: string; issuer?: { name?: string }; min_year?: number; max_year?: number;
  value?: { text?: string }; composition?: { text?: string };
  obverse?: { picture?: string; thumbnail?: string }; reverse?: { picture?: string; thumbnail?: string };
  issues?: NumistaIssue[];
};

const adminDb = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/** Type details + issues, from the 7-day cache or a fresh API call. */
export async function numistaType(typeId: number): Promise<NumistaTypeData | null> {
  const db = await adminDb();
  const { data: row } = await db.from("numista_types").select("data, fetched_at").eq("type_id", typeId).maybeSingle();
  if (row && numistaCacheFresh(row.fetched_at)) return row.data as unknown as NumistaTypeData;
  const [type, issues] = await Promise.all([
    nFetch<NumistaTypeData>(`/types/${typeId}?lang=en`),
    nFetch<NumistaIssue[]>(`/types/${typeId}/issues?lang=en`),
  ]);
  if (!type) return null;
  const data: NumistaTypeData = {
    id: type.id, title: type.title, issuer: type.issuer, min_year: type.min_year, max_year: type.max_year,
    value: type.value, composition: type.composition,
    obverse: { picture: type.obverse?.picture, thumbnail: type.obverse?.thumbnail },
    reverse: { picture: type.reverse?.picture, thumbnail: type.reverse?.thumbnail },
    issues: issues ?? [],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed client hits TS2589
  await (db as any).from("numista_types").upsert({ type_id: typeId, data, fetched_at: new Date().toISOString() });
  return data;
}

export async function numistaSearch(q: string, year?: string | null): Promise<NumistaTypeSummary[]> {
  const p = new URLSearchParams({ q, category: "coin", count: "25", lang: "en" });
  if (year && /^\d{4}$/.test(year)) p.set("date", year);
  let r = await nFetch<{ types?: NumistaTypeSummary[] }>(`/types?${p}`);
  if (!r?.types?.length && p.has("date")) {
    p.delete("date");
    r = await nFetch<{ types?: NumistaTypeSummary[] }>(`/types?${p}`);
  }
  return r?.types ?? [];
}

export { rankNumistaTypes, pickNumistaIssue };

/** Numista's estimate for this issue at the coin's grade (already condition-specific). */
export async function numistaPrice(typeId: number, issueId: number | null, condition: string): Promise<PriceSource[]> {
  const grade = numistaGrade(condition);
  if (!issueId || !grade) return [];
  const r = await nFetch<{ prices?: { grade: string; price: number }[] }>(`/types/${typeId}/issues/${issueId}/prices?currency=USD`);
  const price = r?.prices?.find((p) => p.grade === grade)?.price;
  if (!price || price <= 0) return [];
  return [{ source: "numista", label: "Numista estimate", price: Math.round(price * 100) / 100, kind: "market", url: `https://en.numista.com/${typeId}` }];
}
