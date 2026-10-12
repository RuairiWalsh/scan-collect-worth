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
  return type ? numistaPcgsNo(type.issues, n.issueId) : null;
}

/**
 * PCGS CoinFacts pricing for a slab. Prefers the coin's identity (PCGS number from its
 * Numista match + the slab's grade); the label's cert number is only a fallback.
 */
export async function pcgsPrice(item: PricedItem): Promise<PriceSource[]> {
  const grade = pcgsGrade(item.grade);
  const pcgsNo = await pcgsNoFromNumista(item);
  if (pcgsNo && grade) {
    const facts = await coinFacts(`GetCoinFactsByPCGSNo/${pcgsNo}/${encodeURIComponent(grade)}`).catch(() => null);
    if (facts?.PCGSNo) return pcgsSources(facts);
  }
  const cert = pcgsCertNo(item.number);
  if (!cert) return [];
  const facts = await coinFacts(`GetCoinFactsByCertNo/${cert}`);
  if (!facts?.PCGSNo) return [];
  return pcgsSources(facts);
}
