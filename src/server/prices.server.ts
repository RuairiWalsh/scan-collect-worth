// Server-only price sources.
import { trimmedMedian, type PriceSource } from "@/lib/pricing";
import { conditionFor } from "@/lib/taxonomy";

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

export function justtcgConfigured() {
  return Boolean(process.env["JUSTTCG_API_KEY"]);
}

/** JustTCG — multi-game TCG pricing (TCGplayer-based), one API for all card lines. */
export async function justtcg(item: PricedItem): Promise<PriceSource[]> {
  const key = process.env["JUSTTCG_API_KEY"];
  if (!key) return [];
  const line = (item.line ?? "").toLowerCase();
  const game = Object.entries(JUSTTCG_GAMES).find(([k]) => line.includes(k))?.[1];

  const num = (item.number ?? "").split(/[;,]/)[0]!.split("/")[0]!.trim().replace(/^0+/, "");
  const params = new URLSearchParams({ name: item.name, limit: "20" });
  if (game) params.set("game", game);
  if (item.set_name) params.set("set_name", item.set_name);
  if (num) params.set("number", num);

  const headers = { "x-api-key": key };
  let data = await getJson(`https://api.justtcg.com/v1/cards?${params}`, { headers });
  if (!data?.data?.length && (params.has("set_name") || params.has("number"))) {
    const loose = new URLSearchParams({ name: item.name, limit: "20" });
    if (game) loose.set("game", game);
    data = await getJson(`https://api.justtcg.com/v1/cards?${loose}`, { headers });
  }
  const normNum = (s: unknown) => String(s ?? "").split("/")[0]!.trim().replace(/^0+/, "").toLowerCase();
  const isSealed = (c: any) =>
    /sealed|booster|box|pack|tin|bundle|collection/i.test(`${c?.rarity ?? ""} ${c?.name ?? ""}`) ||
    (c?.variants ?? []).every((v: any) => /sealed/i.test(`${v.condition ?? ""} ${v.printing ?? ""}`));
  let candidates = ((data?.data ?? []) as any[]).filter((c) => !isSealed(c));
  // Must match the card number when we know it — never price a different card.
  if (num) candidates = candidates.filter((c) => normNum(c.number) === num.toLowerCase());
  if (item.set_name && candidates.length > 1) {
    const s = item.set_name.toLowerCase();
    const bySet = candidates.filter((c) => String(c.set_name ?? c.set ?? "").toLowerCase().includes(s));
    if (bySet.length) candidates = bySet;
  }
  // Ambiguous (e.g. just "Pikachu" with no number) → no price rather than a wrong one.
  if (candidates.length !== 1 && !(num && candidates.length)) return [];
  const card = candidates[0];
  const variants = ((card?.variants ?? []) as {
    condition?: string;
    printing?: string;
    price?: number;
  }[]).filter((v) => !/sealed/i.test(`${v.condition ?? ""} ${v.printing ?? ""}`));
  if (!variants.length) return [];

  const wantFoil = item.variant?.toLowerCase().includes("foil") || item.variant?.toLowerCase().includes("holo");
  const wantReverse = item.variant?.toLowerCase().includes("reverse");
  const pool = variants.filter((v) => {
    const p = v.printing ?? "";
    if (wantReverse) return /reverse/i.test(p);
    return wantFoil ? /foil|holo/i.test(p) && !/reverse/i.test(p) : !/foil|holo/i.test(p);
  });
  const usable = (pool.length ? pool : variants).filter((v) => (v.price ?? 0) > 0);
  if (!usable.length) return [];
  // Prefer the variant matching the item's condition; otherwise Near Mint as reference.
  const condLabel = item.category === "cards" ? conditionFor("cards", item.condition).label : "";
  const match =
    usable.find((v) => v.condition?.toLowerCase() === condLabel.toLowerCase()) ??
    usable.find((v) => v.condition === "Near Mint") ??
    usable[0]!;
  const isNm = match.condition === "Near Mint";
  return [
    {
      source: "justtcg",
      label: `JustTCG (${match.condition ?? "market"}${match.printing ? ` ${match.printing}` : ""})`,
      price: match.price!,
      kind: isNm ? "reference" : "market",
    },
  ];
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
