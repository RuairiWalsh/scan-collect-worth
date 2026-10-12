import type { PriceSource } from "@/lib/pricing";
import { pcgsCertNo, pcgsGrade, pcgsSources, type PcgsFacts } from "@/lib/pcgs";
import { numistaPcgsNo, parseNumistaId } from "@/lib/numista";
import type { PricedItem } from "@/server/prices.server";

async function coinFacts(path: string): Promise<(PcgsFacts & { IsValidRequest?: boolean; ServerMessage?: string }) | null> {
  const key = process.env['PCGS_API_KEY'];
  if (!key) return null;
  const res = await fetch(`https://api.pcgs.com/publicapi/coindetail/${path}`, {
    headers: { authorization: `bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`PCGS ${res.status}`);
  return res.json();
}

/** PCGS number from the coin's Numista match (type + exact year/mint issue) — no cert needed. */
async function pcgsNoFromNumista(item: PricedItem): Promise<string | null> {
  const n = parseNumistaId(item.catalog_id);
  if (!n) return null;
  const type = await import("@/server/numista.server").then((m) => m.numistaType(n.typeId)).catch(() => null);
  return type ? numistaPcgsNo(type.issues, n.issueId, item.year) : null;
}

/**
 * PCGS CoinFacts pricing for a slab. Prefers the coin's identity (PCGS number from its
 * Numista match + the slab's grade); the label's cert number is only a fallback.
 */
export async function pcgsFactsFor(item: PricedItem): Promise<PcgsFacts | null> {
  // Raw coins: use PCGS sales at the grade matching the coin's condition.
  const RAW: Record<string, string> = { unc: "63", bu: "63", au: "55", xf: "45", ef: "45", vf: "30", f: "12", vg: "8", g: "4" };
  const raw = item.condition !== "graded" ? RAW[String(item.condition ?? "").toLowerCase()] : undefined;
  const grade = raw ?? pcgsGrade(item.grade);
  const pcgsNo = await pcgsNoFromNumista(item);
  const gradeNo = grade?.match(/\d+/)?.[0];
  if (pcgsNo && gradeNo) {
    const facts = await coinFacts(`GetCoinFactsByGrade?PCGSNo=${pcgsNo}&GradeNo=${gradeNo}&PlusGrade=false`).catch(() => null);
    if (facts?.PCGSNo && facts.IsValidRequest !== false) return facts;
  }
  if (raw) return null;
  const cert = pcgsCertNo(item.number);
  if (!cert) return null;
  const facts = await coinFacts(`GetCoinFactsByCertNo/${cert}`);
  return facts?.PCGSNo ? facts : null;
}

export async function pcgsPrice(item: PricedItem): Promise<PriceSource[]> {
  const facts = await pcgsFactsFor(item);
  return facts ? pcgsSources(facts) : [];
}
