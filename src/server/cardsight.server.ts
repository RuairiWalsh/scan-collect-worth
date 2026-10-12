// Server-only: CardSight AI catalog metadata. Provider artwork is prohibited.
import { cardsightNumber, pickCardsightCard, rankCardsightCandidates, type CardsightCard, type CardsightQuery } from "@/lib/cardsight";
import type { CardsightPricing } from "@/lib/cardsight-pricing";
export type { CardsightPricing, CardsightPriceRecord } from "@/lib/cardsight-pricing";

const BASE = "https://api.cardsight.ai";

export function cardsightConfigured() {
  return Boolean(process.env["CARDSIGHT_API_KEY"]);
}

async function csFetch(path: string): Promise<Response | null> {
  const key = process.env["CARDSIGHT_API_KEY"];
  if (!key) return null;
  const res = await fetch(`${BASE}${path}`, { headers: { "X-API-Key": key } });
  if (!res.ok) {
    console.error("CardSight", path, res.status);
    return null;
  }
  return res;
}

async function searchCards(params: URLSearchParams): Promise<CardsightCard[]> {
  const res = await csFetch(`/v1/catalog/cards?${params}`);
  if (!res) return [];
  const j = (await res.json()) as { cards?: CardsightCard[] };
  return j.cards ?? [];
}

/** Best catalog card for a scanned item, or null. Uses as few API calls as possible. */
export async function cardsightFindCard(item: CardsightQuery): Promise<CardsightCard | null> {
  const num = cardsightNumber(item.number);
  const params = new URLSearchParams({ name: item.name });
  if (num) params.set("number", num);
  if (item.year) params.set("year", item.year ?? "");
  let cards = await searchCards(params);
  // Over-specific filters can hide the card; relax to name + number, then name only.
  if (!cards.length && item.year) {
    params.delete("year");
    cards = await searchCards(params);
  }
  if (!cards.length && num) {
    params.delete("number");
    cards = await searchCards(params);
  }
  return pickCardsightCard(cards, item);
}

export async function cardsightGetPricing(cardId: string, period = "90d"): Promise<CardsightPricing | null> {
  const res = await csFetch(`/v1/pricing/${encodeURIComponent(cardId)}?period=${period}`);
  if (!res) throw new Error("CardSight pricing is unavailable; the previous price is preserved.");
  return res.json() as Promise<CardsightPricing>;
}

export async function cardsightBulkPricing(ids: string[]) {
  const key = process.env["CARDSIGHT_API_KEY"];
  const out = new Map<string, CardsightPricing>();
  if (!key) return out;
  for (let i = 0; i < ids.length; i += 100) {
    const response = await fetch(`${BASE}/v1/pricing/`, { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ card_ids: ids.slice(i, i + 100), period: "90d", limit: 100 }), signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`CardSight pricing unavailable (${response.status}).`);
    const data = await response.json() as { results: { card_id: string; success: boolean; data?: CardsightPricing }[] };
    for (const row of data.results ?? []) if (row.success && row.data) out.set(row.card_id, row.data);
  }
  return out;
}



/** Broad candidate list for a one-sided scan with no readable number or year (name, then surname). */
export async function cardsightCandidates(item: CardsightQuery): Promise<CardsightCard[]> {
  let cards = await searchCards(new URLSearchParams({ name: item.name, take: "50" }));
  const surname = item.name.trim().split(/\s+/).pop() ?? "";
  if (!cards.length && surname.length > 2 && surname !== item.name.trim()) {
    cards = await searchCards(new URLSearchParams({ name: surname, take: "50" }));
  }
  return rankCardsightCandidates(cards, item);
}

export type CardsightVisualMatch = { card: CardsightCard | null; confidence: "High" | "Medium" | "Low"; releaseName?: string | null; year?: string | null };

/** CardSight photo recognition: matches the scanned picture against its catalog images. */
export async function cardsightIdentifyImage(dataUrl: string): Promise<CardsightVisualMatch | null> {
  const key = process.env["CARDSIGHT_API_KEY"];
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!key || !m) return null;
  try {
    const bytes = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: m[1] ?? "image/jpeg" }), "scan.jpg");
    const res = await fetch(`${BASE}/v1/identify/card`, { method: "POST", headers: { "X-API-Key": key }, body: form, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { detections?: { confidence: "High" | "Medium" | "Low"; card?: { id?: string; name?: string; number?: string; year?: string; releaseName?: string; setName?: string } }[] };
    const d = j.detections?.[0];
    if (!d?.card) return null;
    const c = d.card;
    return {
      confidence: d.confidence,
      releaseName: c.releaseName ?? null,
      year: c.year ?? null,
      card: c.id ? { id: c.id, name: c.name ?? null, number: c.number ?? null, setName: c.setName ?? null, releaseName: c.releaseName ?? null, releaseYear: c.year ?? null } : null,
    };
  } catch (e) {
    console.error("CardSight identify", e);
    return null;
  }
}
