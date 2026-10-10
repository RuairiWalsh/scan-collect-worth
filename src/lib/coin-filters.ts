export const COIN_LEVELS = ["country", "metal", "denomination", "issue"] as const;
export type CoinLevel = (typeof COIN_LEVELS)[number];
export type CoinFilter = Record<CoinLevel, string>;
export const EMPTY_COIN_FILTER: CoinFilter = { country: "all", metal: "all", denomination: "all", issue: "all" };
export const COIN_METALS = ["Gold", "Silver", "Platinum", "Palladium", "Copper", "Bronze", "Brass", "Nickel", "Copper-nickel", "Steel", "Aluminium", "Zinc", "Bimetallic"] as const;
export const COIN_ISSUES = ["Regular issue", "Commemorative", "Bullion", "Error", "Pattern", "Private issue"] as const;
export const COIN_LABELS: Record<CoinLevel, { label: string; all: string }> = {
  country: { label: "Country", all: "All countries" },
  metal: { label: "Metal type", all: "All metals" },
  denomination: { label: "Denomination", all: "All denominations" },
  issue: { label: "Issue type", all: "All issue types" },
};
export type CoinRow = { category: string; subcategory: string | null; line: string | null; name?: string; set_name?: string | null; variant?: string | null };

// Read only explicit identity text. Condition, grader and grade are deliberately excluded.
export function coinDetails(item: CoinRow): CoinFilter {
  const rawCountry = item.subcategory?.trim() ?? "";
  const aliases: Record<string, string> = { us: "United States", usa: "United States", "us coins": "United States", uk: "United Kingdom", gb: "United Kingdom" };
  const country = aliases[rawCountry.toLowerCase()] ?? (rawCountry && !/^(world|world coins|bullion|ancient)$/i.test(rawCountry) ? rawCountry : "Unknown country");
  const text = [item.name, item.line, item.set_name, item.variant].filter(Boolean).join(" ");
  const metalRules: [RegExp, string][] = [
    [/\bbi[ -]?metal(?:lic)?\b/i, "Bimetallic"],
    [/\b(?:cupronickel|cupro[ -]nickel|copper[ -]nickel)\b/i, "Copper-nickel"],
    ...COIN_METALS.filter((v) => v !== "Bimetallic" && v !== "Copper-nickel").map((value): [RegExp, string] => [new RegExp(`\\b${value}\\b`, "i"), value]),
  ];
  const metals = metalRules.filter(([rule]) => rule.test(text)).map(([, label]) => label);
  const metal = metals.includes("Bimetallic") ? "Bimetallic" : metals.includes("Copper-nickel") ? "Copper-nickel" : metals.length === 1 ? metals[0] ?? "Unknown metal" : "Unknown metal";
  // Prefer a numeric face value over a named denomination when both are present.
  const amount = text.match(/\b(\d+(?:[.,]\d+)?)\s*(cents?|pence|penn(?:y|ies)|dollars?|euros?|pounds?|yen|yuan|francs?|pesos?|rupees?|roubles?|rubles?|marks?|shillings?|kron[ae]|krone[rs]?|kronor)\b/i);
  const currencyAliases: Record<string, string> = { cent: "cents", cents: "cents", penny: "pence", pennies: "pence", dollar: "dollars", euro: "euros", pound: "pounds", franc: "francs", peso: "pesos", rupee: "rupees", ruble: "rubles", rouble: "rubles", roubles: "rubles", mark: "marks", shilling: "shillings" };
  let denomination = "Unknown denomination";
  if (amount?.[1] && amount[2]) denomination = `${amount[1].replace(",", ".")} ${currencyAliases[amount[2].toLowerCase()] ?? amount[2].toLowerCase()}`;
  else {
    const named: [RegExp, string][] = [[/\bhalf[ -]dollars?\b|\bhalves\b/i, "Half dollar"], [/\bquarters?\b/i, "Quarter"], [/\bdimes?\b/i, "Dime"], [/\bnickels?\b/i, "Nickel (5 cents)"], [/\bcents?\b|\bpenn(?:y|ies)\b/i, "Cent / penny"], [/\bdollars?\b/i, "Dollar"], [/\bsovereigns?\b/i, "Sovereign"], [/\bshillings?\b/i, "Shilling"]];
    denomination = named.find(([rule]) => rule.test(item.line ?? ""))?.[1] ?? named.find(([rule]) => rule.test(item.name ?? ""))?.[1] ?? denomination;
  }
  const issueRules: [RegExp, string][] = [[/\bcommemorative\b/i, "Commemorative"], [/\bbullion\b/i, "Bullion"], [/\berror\b/i, "Error"], [/\bpattern\b/i, "Pattern"], [/\bprivate[ -]issue\b/i, "Private issue"], [/\b(?:regular|standard)[ -]issue\b/i, "Regular issue"]];
  const issue = issueRules.find(([rule]) => rule.test(`${text} ${item.subcategory ?? ""}`))?.[1] ?? "Unknown issue type";
  return { country, metal, denomination, issue };
}

export function matchesCoinFilter(item: CoinRow, filter: CoinFilter): boolean {
  if (item.category !== "coins") return false;
  const details = coinDetails(item);
  return COIN_LEVELS.every((level) => filter[level] === "all" || filter[level] === details[level]);
}

export function coinOptions(items: CoinRow[], filter: CoinFilter, level: CoinLevel): string[] {
  const parentFilter = { ...EMPTY_COIN_FILTER };
  for (const parent of COIN_LEVELS.slice(0, COIN_LEVELS.indexOf(level))) parentFilter[parent] = filter[parent];
  const values = Array.from(new Set(items.filter((item) => matchesCoinFilter(item, parentFilter)).map((item) => coinDetails(item)[level]))).sort((a, b) => a.startsWith("Unknown") ? 1 : b.startsWith("Unknown") ? -1 : a.localeCompare(b, undefined, { numeric: true }));
  const presets: readonly string[] = level === "metal" ? COIN_METALS : level === "issue" ? COIN_ISSUES : [];
  return [...presets, ...values.filter((v) => !presets.includes(v))];
}

export function pickCoinLevel(filter: CoinFilter, level: CoinLevel, value: string): CoinFilter {
  const next = { ...filter, [level]: value };
  for (const child of COIN_LEVELS.slice(COIN_LEVELS.indexOf(level) + 1)) next[child] = "all";
  return next;
}
