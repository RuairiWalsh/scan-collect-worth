import type { PriceSource } from "@/lib/pricing";
import { pcgsCertNo, pcgsSources, type PcgsFacts } from "@/lib/pcgs";
import type { PricedItem } from "@/server/prices.server";

/** PCGS CoinFacts by the slab's cert number — returns [] without a key, cert or match. */
export async function pcgsPrice(item: PricedItem): Promise<PriceSource[]> {
  const key = process.env.PCGS_API_KEY;
  const cert = pcgsCertNo(item.number);
  if (!key || !cert) return [];
  const res = await fetch(`https://api.pcgs.com/publicapi/coindetail/GetCoinFactsByCertNo/${cert}`, {
    headers: { authorization: `bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`PCGS ${res.status}`);
  const facts = (await res.json()) as PcgsFacts & { IsValidRequest?: boolean; ServerMessage?: string };
  if (!facts.PCGSNo) return [];
  return pcgsSources(facts);
}
