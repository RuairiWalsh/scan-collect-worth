// Server-only: CardSight AI catalog metadata. Provider artwork is prohibited.
import { cardsightNumber, cardsightSameSet, pickCardsightCard, rankCardsightCandidates, type CardsightCard, type CardsightQuery } from "@/lib/cardsight";
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

/**
 * Bulk-import shortcut: batches are usually one set, so once the set is known a
 * card is found by number (+ year) alone — one cheap text search, no images and
 * no per-card name guessing. Returns null unless exactly one card fits the set.
 */
export async function cardsightFindInSet(setName: string, number: string | null | undefined, year?: string | null): Promise<CardsightCard | null> {
  const num = cardsightNumber(number);
  if (!num) return null;
  const params = new URLSearchParams({ number: num, take: "50" });
  if (year) params.set("year", year);
  let cards = await searchCards(params);
  if (!cards.length && year) {
    params.delete("year");
    cards = await searchCards(params);
  }
  // Exact set only — a base "2002 Topps" card must never satisfy a "2002 Topps Gold Label" batch.
  const inSet = cards.filter((c) => cardsightSameSet(c.releaseName, setName) || cardsightSameSet(c.setName, setName));
  return pickCardsightCard(inSet, { name: "", set_name: setName, number: number ?? null, year: year ?? null });
}

export type CardsightSet = {
  id: string;
  name: string;
  cardCount: number;
  releaseName: string;
  releaseYear: string;
};

/**
 * Admin set checklist: find sets by name (+ optional year).
 * CardSight's set search only matches subset names ("New Breed"), never the release
 * ("1999 Topps"), so search releases first and list each release's sets.
 */
export async function cardsightSearchSets(name: string, year?: string | null): Promise<CardsightSet[]> {
  const params = new URLSearchParams({ name, take: "10" });
  if (year) params.set("year", year);
  const res = await csFetch(`/v1/catalog/releases?${params}`);
  if (!res) return [];
  const j = (await res.json()) as { releases?: { id: string }[] };
  const releases = (j.releases ?? []).slice(0, 10);
  const out: CardsightSet[] = [];
  for (const rel of releases) {
    const sres = await csFetch(`/v1/catalog/sets?releaseId=${encodeURIComponent(rel.id)}&take=50`);
    if (!sres) continue;
    const sj = (await sres.json()) as { sets?: CardsightSet[] };
    out.push(...(sj.sets ?? []));
  }
  // Base Set first within each release, then by card count descending.
  return out.sort((a, b) => Number(/^base/i.test(b.name)) - Number(/^base/i.test(a.name)) || b.cardCount - a.cardCount);
}

/** Every card in a set, paginated. Text metadata only — no images. */
export async function cardsightSetCards(setId: string): Promise<CardsightCard[]> {
  const out: CardsightCard[] = [];
  for (let skip = 0; ; skip += 100) {
    const res = await csFetch(`/v1/catalog/cards?setId=${encodeURIComponent(setId)}&take=100&skip=${skip}`);
    if (!res) break;
    const j = (await res.json()) as { cards?: CardsightCard[]; total_count?: number };
    out.push(...(j.cards ?? []));
    if (!j.cards?.length || out.length >= (j.total_count ?? out.length)) break;
  }
  return out;
}

const setCache = new Map<string, { at: number; cards: CardsightCard[] }>();
/** One set checklist per bulk import (≤100 cards per request), cached for an hour per worker. */
export async function cardsightSetCardsCached(setId: string): Promise<CardsightCard[]> {
  const hit = setCache.get(setId);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.cards;
  const cards = await cardsightSetCards(setId);
  if (cards.length) setCache.set(setId, { at: Date.now(), cards });
  return cards;
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

/** Free-text catalog search for the Browse Collectables search bar. */
export async function cardsightSearchByName(q: string): Promise<CardsightCard[]> {
  if (!cardsightConfigured()) return [];
  return searchCards(new URLSearchParams({ name: q, take: "20" }));
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

/**
 * Sports cards saved without a catalog match (e.g. details typed in by hand) get pinned to
 * the exact CardSight card when name + details identify it unambiguously. Returns the card id or null.
 */
export async function pinSportsCatalogCard(
  db: { from: (t: "items") => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- typed client hits TS2589
  item: { id: string; catalog_id: string | null; subcategory: string | null; name: string | null; set_name: string | null; number: string | null; year: string | null },
): Promise<string | null> {
  if (item.catalog_id) return item.catalog_id;
  if (item.subcategory !== "sports" || !item.name || !cardsightConfigured()) return null;
  if (!item.number && !item.year && !item.set_name) return null;
  const card = await cardsightFindCard({ name: item.name, set_name: item.set_name, number: item.number, year: item.year });
  if (!card) return null;
  await db.from("items").update({
    catalog_id: card.id,
    set_name: card.releaseName || card.setName || item.set_name,
    year: item.year || card.releaseYear || null,
    number: item.number || card.number || null,
  }).eq("id", item.id);
  return card.id;
}
