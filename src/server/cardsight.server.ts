// Server-only: CardSight AI catalog + card images (sports / non-TCG artwork).
import { cardsightNumber, pickCardsightCard, type CardsightCard, type CardsightQuery } from "@/lib/cardsight";

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

/** Card image as a data URI, or null when CardSight has no image for it. */
export async function cardsightImageDataUri(cardId: string): Promise<string | null> {
  const res = await csFetch(`/v1/images/cards/${cardId}?format=raw`);
  if (!res) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 400_000) return null; // keep DB rows small
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${type.split(";")[0]};base64,${btoa(bin)}`;
}

/** One call: find the card and return its image. */
export async function cardsightArtwork(item: CardsightQuery): Promise<string | null> {
  const card = await cardsightFindCard(item);
  if (!card) return null;
  return cardsightImageDataUri(card.id);
}
