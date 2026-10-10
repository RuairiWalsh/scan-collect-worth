// Server-only price sources.
import { trimmedMedian, type PriceSource } from "@/lib/pricing";
import { conditionFor } from "@/lib/taxonomy";
import { confidentMatch, parseNumber, rankCandidates, type CatalogCard, type ScanGuess } from "@/lib/catalog";

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

export function buildSearchQuery(item: PricedItem) {
  const bits = [item.year, item.set_name, item.name, item.number ? `#${item.number}` : null, item.variant];
  if (item.condition === "graded" && item.grader) bits.push(`${item.grader} ${item.grade ?? ""}`);
  if (item.category === "coins" && item.condition === "proof") bits.push("proof");
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** eBay Browse API — current listings (fixed price) matching the item. */
export async function ebay(item: PricedItem): Promise<PriceSource[]> {
  const token = await getEbayToken();
  if (!token) return [];
  const query = buildSearchQuery(item);
  const data = await getJson(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?limit=30&filter=buyingOptions:%7BFIXED_PRICE%7D,priceCurrency:USD&q=${encodeURIComponent(query)}`,
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
      label: "eBay listings",
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
export async function findCatalogCandidates(item: ScanGuess & { line: string | null }) {
  const game = justtcgGame(item.line);
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
  return rankCandidates(item, cards);
}

export async function catalogCardById(id: string, opts?: { history?: boolean }) {
  const params: Record<string, string> = { cardId: id };
  if (opts?.history) params["priceHistoryDuration"] = "180d";
  return (await jtCards(params))[0] ?? null;
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
 *  Skips the fetch-level work when the card already has history rows. */
export async function seedCatalogHistory(supabase: HistoryInserter, card: CatalogCard) {
  const { data: existing } = await supabase
    .from("catalog_price_history")
    .select("catalog_id")
    .eq("catalog_id", card.id)
    .limit(1);
  if (existing?.length) return 0;
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
  const variants = (card.variants ?? []).filter(
    (v) => !/sealed/i.test(`${v.condition ?? ""} ${v.printing ?? ""}`),
  );
  if (!variants.length) return [];
  const vt = (item.variant ?? "").toLowerCase();
  const wantReverse = vt.includes("reverse");
  const wantFoil = !wantReverse && (vt.includes("foil") || vt.includes("holo"));
  const wantFirst = vt.includes("1st");
  const pool = variants.filter((v) => {
    const p = v.printing ?? "";
    if (wantReverse) return /reverse/i.test(p);
    if (wantFirst) return /1st/i.test(p);
    if (wantFoil) return /foil|holo/i.test(p) && !/reverse/i.test(p);
    return true;
  });
  const usable = (pool.length ? pool : variants).filter((v) => (v.price ?? 0) > 0);
  if (!usable.length) return [];
  const condLabel = item.category === "cards" ? conditionFor("cards", item.condition).label : "";
  const nm = usable.filter((v) => v.condition === "Near Mint");
  // With no printing preference, the base (non-reverse) printing is the usual one.
  const nmBase = nm.find((v) => !/reverse/i.test(v.printing ?? "")) ?? nm[0];
  const match =
    usable.find((v) => v.condition?.toLowerCase() === condLabel.toLowerCase() && (!nmBase || v.printing === nmBase.printing)) ??
    nmBase ??
    usable[0]!;
  const isNm = match.condition === "Near Mint";
  return [
    {
      source: "justtcg",
      label: `JustTCG · ${card.set_name ?? ""} ${card.number ?? ""} (${match.condition ?? "market"}${match.printing ? `, ${match.printing}` : ""})`.replace(/\s+/g, " "),
      price: match.price!,
      kind: isNm ? "reference" : "market",
    },
  ];
}

/** JustTCG — multi-game TCG pricing. Exact catalog card when known, otherwise a strict match. */
export async function justtcg(item: PricedItem): Promise<PriceSource[]> {
  if (!justtcgConfigured()) return [];
  let card: CatalogCard | null = null;
  if (item.catalog_id) card = await catalogCardById(item.catalog_id);
  if (!card) card = confidentMatch(await findCatalogCandidates(item));
  // Not sure which card it is → no price rather than a wrong one.
  return card ? priceFromCard(card, item) : [];
}

export async function collectPrices(item: PricedItem): Promise<PriceSource[]> {
  const tasks: Promise<PriceSource[]>[] = [ebay(item)];
  const line = (item.line ?? "").toLowerCase();
  if (item.category === "cards") {
    if (justtcgConfigured()) {
      tasks.push(justtcg(item));
    } else {
      if (line.includes("pok")) tasks.push(pokemonTcg(item));
      if (line.includes("magic")) tasks.push(scryfall(item));
    }
  }
  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
