// Server-only price sources.
import { trimmedMedian, type PriceSource } from "@/lib/pricing";
import { conditionFor } from "@/lib/taxonomy";
import { cardPriceSources, cardVariants } from "@/lib/card-pricing";
import { cardsightConfigured, cardsightFindCard, cardsightGetPricing, type CardsightPriceRecord } from "./cardsight.server";
import { confidentMatch, parseNumber, rankCandidates, type CatalogCard, type ScanGuess } from "@/lib/catalog";
import { isLocalCatalogId, isCardsightId } from "@/lib/imported-catalog";
import { cardsightVariants } from "@/lib/cardsight-pricing";

export type PricedItem = {
  category: string;
  subcategory: string | null;
  line: string | null;
  name: string;
  set_name: string | null;
  number: string | null;
  year: string | null;
  variant: string | null;
  condition: string;
  grader: string | null;
  grade: string | null;
  catalog_id?: string | null;
};

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) return null;
  return res.json() as Promise<any>;
}

const q = (s: string) => s.replace(/"/g, "");

/** Pokémon TCG API — includes TCGplayer market prices (near-mint, raw). */
export async function pokemonTcg(item: PricedItem): Promise<PriceSource[]> {
  const parts = [`name:"${q(item.name)}"`];
  if (item.number) parts.push(`number:${q(item.number.split("/")[0] ?? "").trim()}`);
  if (item.set_name) parts.push(`set.name:"${q(item.set_name)}"`);
  const headers: Record<string, string> = {};
  const key = process.env["POKEMON_TCG_API_KEY"];
  if (key) headers["X-Api-Key"] = key;

  let data = await getJson(
    `https://api.pokemontcg.io/v2/cards?pageSize=5&q=${encodeURIComponent(parts.join(" "))}`,
    { headers },
  );
  if (!data?.data?.length && parts.length > 1) {
    data = await getJson(
      `https://api.pokemontcg.io/v2/cards?pageSize=5&q=${encodeURIComponent(parts.slice(0, 2).join(" "))}`,
      { headers },
    );
  }
  const card = data?.data?.[0];
  const prices = card?.tcgplayer?.prices as Record<string, { market?: number; mid?: number }> | undefined;
  if (!prices) return [];
  const variantKey = item.variant?.toLowerCase().includes("reverse")
    ? "reverseHolofoil"
    : item.variant?.toLowerCase().includes("1st")
      ? "1stEditionHolofoil"
      : undefined;
  const p = (variantKey && prices[variantKey]) || prices['holofoil'] || prices['normal'] || Object.values(prices)[0];
  const price = p?.market ?? p?.mid;
  if (!price) return [];
  return [{ source: "tcgplayer", label: "TCGplayer market", price, kind: "reference", url: card.tcgplayer.url }];
}

/** Scryfall — MTG prices sourced from TCGplayer. */
export async function scryfall(item: PricedItem): Promise<PriceSource[]> {
  const data = await getJson(
    `https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(
      `!"${q(item.name)}"${item.number ? ` cn:${q(item.number.split("/")[0] ?? "")}` : ""}`,
    )}`,
    { headers: { "User-Agent": "Lymitz/1.0", Accept: "application/json" } },
  );
  let card = data?.data?.[0];
  if (item.set_name && data?.data?.length) {
    card =
      data.data.find((c: any) => c.set_name?.toLowerCase() === item.set_name!.toLowerCase()) ?? card;
  }
  if (!card) return [];
  const foil = item.variant?.toLowerCase().includes("foil");
  const price = parseFloat((foil ? card.prices?.usd_foil : card.prices?.usd) ?? card.prices?.usd ?? "");
  if (!price) return [];
  return [{ source: "scryfall", label: "TCGplayer (via Scryfall)", price, kind: "reference", url: card.scryfall_uri }];
}

let ebayToken: { token: string; exp: number } | null = null;

async function getEbayToken(): Promise<string | null> {
  const id = process.env["EBAY_CLIENT_ID"];
  const secret = process.env["EBAY_CLIENT_SECRET"];
  if (!id || !secret) return null;
  if (ebayToken && ebayToken.exp > Date.now() + 60_000) return ebayToken.token;
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) {
    console.error("eBay token failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  ebayToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export function ebayConfigured() {
  return Boolean(process.env["EBAY_CLIENT_ID"] && process.env["EBAY_CLIENT_SECRET"]);
}

/** Attempts a real eBay OAuth login; true when the stored credentials work. */
export async function testEbayAuth(): Promise<boolean> {
  ebayToken = null;
  return (await getEbayToken()) !== null;
}

export function buildSearchQuery(item: PricedItem) {
  const coin = item.category === "coins";
  // Coins: short collector-style wording — year, design name (no country,
  // denomination, or parenthetical catalog text), special-issue variant, grade.
  // Long word-for-word catalog names match almost no listing titles.
  if (coin) {
    const name = (item.name ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+(\.\d+)?\s*(dollar|dollars|cent|cents|penny|pence|pound|pounds|euro|franc|francs|peso|pesos|yen|yuan|rupee|shilling|nickel|dime|quarter)s?\b/gi, " ")
      .replace(/\b(silver|gold|bronze|copper|nickel|clad|bullion|coin|proof)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const bits = [item.year, name, item.variant];
    if (item.condition === "graded" && item.grader) bits.push(`${item.grader} ${item.grade ?? ""}`);
    if (item.condition === "proof") bits.push("proof");
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  const bits = [item.year, item.set_name, item.name, item.number ? `#${item.number}` : null, item.variant];
  if (item.condition === "graded" && item.grader) bits.push(`${item.grader} ${item.grade ?? ""}`);
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** eBay Browse API — current listings (fixed price) matching the item. */
export async function ebay(item: PricedItem): Promise<PriceSource[]> {
  const token = await getEbayToken();
  if (!token) return [];
  const query = buildSearchQuery(item);
  const data = await getJson(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?limit=30${item.category === "coins" ? "&category_ids=11116" : ""}&filter=buyingOptions:%7BFIXED_PRICE%7D,priceCurrency:USD&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } },
  );
  const prices: number[] = (data?.itemSummaries ?? [])
    .map((s: any) => parseFloat(s?.price?.value))
    .filter((n: number) => n > 0);
  if (prices.length < 2) return [];
  // Graded/raw near-mint queries already reflect condition; other raw grades scale from NM.
  const kind: PriceSource["kind"] =
    item.condition === "graded" || item.category !== "cards" ? "market" : "reference";
  return [
    {
      source: "ebay",
      label: "eBay asking prices",
      price: trimmedMedian(prices),
      kind,
      count: prices.length,
      url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1`,
    },
  ];
}

const JUSTTCG_GAMES: Record<string, string> = {
  pok: "pokemon",
  magic: "magic-the-gathering",
  "yu-gi-oh": "yugioh",
  yugioh: "yugioh",
  lorcana: "disney-lorcana",
  "one piece": "one-piece-card-game",
  digimon: "digimon-card-game",
  union: "union-arena",
};

export function justtcgGame(line: string | null | undefined) {
  const l = (line ?? "").toLowerCase();
  return Object.entries(JUSTTCG_GAMES).find(([k]) => l.includes(k))?.[1];
}

export function justtcgConfigured() {
  return Boolean(process.env["JUSTTCG_API_KEY"]);
}

// Small per-worker cache so repeated lookups don't burn the API rate limit.
const jtCache = new Map<string, { at: number; data: CatalogCard[] }>();

async function jtCards(params: Record<string, string>): Promise<CatalogCard[]> {
  const key = process.env["JUSTTCG_API_KEY"];
  if (!key) return [];
  const qs = new URLSearchParams(params).toString();
  const hit = jtCache.get(qs);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  const res = await fetch(`https://api.justtcg.com/v1/cards?${qs}`, { headers: { "x-api-key": key } });
  if (!res.ok) {
    console.error("JustTCG", res.status, await res.text().catch(() => ""));
    return [];
  }
  const j = (await res.json()) as { data?: CatalogCard[] };
  const data = j.data ?? [];
  jtCache.set(qs, { at: Date.now(), data });
  return data;
}

/** Catalog cards that could be the scanned card, best first. Uses as few API calls as possible. */
export async function findCatalogCandidates(item: ScanGuess & { line: string | null; language?: string | null }) {
  const japanese = /japan/i.test(item.language ?? "");
  let game = justtcgGame(item.line);
  // Japanese Pokémon cards live in their own JustTCG catalog.
  if (japanese && game === "pokemon") game = "pokemon-japan";
  const base: Record<string, string> = { q: item.name, limit: "20" };
  if (game) base["game"] = game;
  const printed = (item.number ?? "").split(/[;,]/)[0]!.trim();
  const parsed = parseNumber(printed);
  let cards: CatalogCard[] = [];
  if (parsed) {
    cards = await jtCards({ ...base, number: printed });
    if (!cards.length && parsed.total) cards = await jtCards({ ...base, number: parsed.num });
  }
  if (!cards.length) cards = await jtCards(base);
  // Other games mix languages in one catalog: prefer entries that have the scanned language.
  const lang = item.language && item.language !== "Other" ? item.language.toLowerCase() : null;
  if (lang && game !== "pokemon-japan") {
    const same = cards.filter((c) => (c.variants ?? []).some((v) => String((v as { language?: string }).language ?? "english").toLowerCase() === lang || new RegExp(lang, "i").test(v.printing ?? "")));
    if (same.length) cards = same;
  }
  return rankCandidates(item, cards);
}

export async function catalogCardById(id: string, opts?: { history?: boolean }) {
  if (isLocalCatalogId(id) || isCardsightId(id)) return null;
  const params: Record<string, string> = { cardId: id };
  if (opts?.history) params["priceHistoryDuration"] = "180d";
  return (await jtCards(params))[0] ?? null;
}

/**
 * Batch-fetch many catalog cards in as few requests as possible.
 * JustTCG's POST /v1/cards accepts up to N cards per call (plan-dependent:
 * 20 free, 100 starter/pro, 200 enterprise). One request per batch, so the
 * nightly refresh costs ceil(cards / batchSize) requests instead of one each.
 */
export async function catalogCardsByIds(ids: string[]): Promise<CatalogCard[]> {
  const key = process.env["JUSTTCG_API_KEY"];
  ids = ids.filter(id => !isLocalCatalogId(id) && !isCardsightId(id));
  if (!key || !ids.length) return [];
  const batchSize = Math.max(
    1,
    Math.min(200, parseInt(process.env["JUSTTCG_BATCH_SIZE"] ?? "20", 10) || 20),
  );
  const out: CatalogCard[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const res = await fetch("https://api.justtcg.com/v1/cards", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map((cardId) => ({ cardId }))),
    });
    if (!res.ok) {
      console.error("JustTCG batch", res.status, await res.text().catch(() => ""));
      continue;
    }
    const j = (await res.json()) as { data?: CatalogCard[] };
    out.push(...(j.data ?? []));
  }
  return out;
}

/** Pick the near-mint, non-reverse variant (the one we track as nm_price). */
export function nmVariantOf(card: CatalogCard) {
  const variants = (card.variants ?? []).filter((v) => (v.price ?? 0) > 0 || (v.priceHistory?.length ?? 0) > 0);
  return (
    variants.find((v) => v.condition === "Near Mint" && !/reverse/i.test(v.printing ?? "")) ??
    variants.find((v) => v.condition === "Near Mint") ??
    variants[0]
  );
}

type HistoryInserter = {
  from: (t: string) => {
    upsert: (
      rows: object[],
      opts?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => PromiseLike<unknown>;
    select: (c: string) => {
      eq: (c: string, v: string) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null }> };
    };
  };
};

/** Seed catalog_price_history from a card fetched with priceHistoryDuration=180d.
 *  Idempotent: the upsert ignores duplicates, so re-seeding is safe. */
export async function seedCatalogHistory(supabase: HistoryInserter, card: CatalogCard) {
  const nm = nmVariantOf(card);
  const points = (nm?.priceHistory ?? []).filter((pt) => typeof pt?.p === "number" && pt.p > 0 && pt.t > 0);
  if (!points.length) return 0;
  const rows = points.map((pt) => ({
    catalog_id: card.id,
    nm_price: pt.p,
    recorded_at: new Date(pt.t * 1000).toISOString(),
  }));
  await supabase.from("catalog_price_history").upsert(rows, {
    onConflict: "catalog_id,recorded_at",
    ignoreDuplicates: true,
  });
  return rows.length;
}

/** Raw catalog search by name/number text (JustTCG `q` parameter). */
export async function jtSearch(query: string, game?: string): Promise<CatalogCard[]> {
  const params: Record<string, string> = { q: query, limit: "20" };
  if (game) params["game"] = game;
  return jtCards(params);
}

function priceFromCard(card: CatalogCard, item: PricedItem): PriceSource[] {
  return cardPriceSources(cardVariants(card.variants), item.condition, item.variant);
}

/** JustTCG — multi-game TCG pricing. Exact catalog card when known, otherwise a strict match. */
export async function justtcg(item: PricedItem): Promise<PriceSource[]> {
  if (!justtcgConfigured()) return [];
  let card: CatalogCard | null = null;
  if (item.catalog_id && !isLocalCatalogId(item.catalog_id) && !isCardsightId(item.catalog_id)) card = await catalogCardById(item.catalog_id);
  if (!card) card = confidentMatch(await findCatalogCandidates(item));
  // Not sure which card it is → no price rather than a wrong one.
  return card ? priceFromCard(card, item) : [];
}

export async function cardsight(item: PricedItem): Promise<PriceSource[]> {
  if (!cardsightConfigured()) return [];
  let cardId = item.catalog_id;
  if (!cardId || !isCardsightId(cardId)) {
    const csCard = await cardsightFindCard({
      name: item.name,
      set_name: item.set_name,
      number: item.number,
      year: item.year,
    });
    cardId = csCard?.id;
  }
  if (!cardId) return [];
  const pricing = await cardsightGetPricing(cardId);
  if (!pricing) return [];
  return cardPriceSources(cardsightVariants(pricing), item.condition, item.variant, item.grader, item.grade);
}

export async function collectPrices(item: PricedItem): Promise<PriceSource[]> {
  const line = (item.line ?? "").toLowerCase();
  if (item.category === "cards") {
    if (item.catalog_id && isLocalCatalogId(item.catalog_id)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.from("catalog_prices").select("variants").eq("catalog_id", item.catalog_id).maybeSingle();
      return cardPriceSources(cardVariants(data?.variants), item.condition, item.variant, item.grader, item.grade);
    }
    if (item.subcategory === "sports") return cardsight(item);
    // TCG games with condition-specific data stay on JustTCG; sports, non-sport,
    // and unmatched cards price from eBay listings instead.
    if (justtcgConfigured() && justtcgGame(item.line)) return justtcg(item);
    const tasks: Promise<PriceSource[]>[] = [ebay(item), cardsight(item)];
    if (!justtcgConfigured()) {
      if (line.includes("pok")) tasks.push(pokemonTcg(item));
      if (line.includes("magic")) tasks.push(scryfall(item));
    }
    const settled = await Promise.allSettled(tasks);
    return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  }
  if (item.category === "coins" && item.condition === "graded" && /pcgs/i.test(item.grader ?? "")) {
    // PCGS slabs price from PCGS's own auction records and price guide; eBay asks only as fallback.
    const pcgs = await import("@/server/pcgs.server").then((m) => m.pcgsPrice(item)).catch(() => []);
    if (pcgs.length) return pcgs;
  }
  if (item.category === "coins") {
    // Coins matched to an exact Numista type/issue use the Numista estimate only;
    // eBay asking prices are the fallback when there is no Numista match.
    const { parseNumistaId } = await import("@/lib/numista");
    const n = parseNumistaId(item.catalog_id);
    if (n) {
      const numista = await import("@/server/numista.server").then((m) => m.numistaPrice(n.typeId, n.issueId, item.condition)).catch(() => []);
      if (numista.length) return numista;
    }
  }
  const tasks: Promise<PriceSource[]>[] = [ebay(item)];
  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
