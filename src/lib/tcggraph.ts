/** Pure helpers for matching a scanned TCG card to a TCGGraph printing. */
const GAMES: Record<string, string> = {
  "pokémon": "pokemon", pokemon: "pokemon",
  "magic: the gathering": "magic-the-gathering", magic: "magic-the-gathering",
  "yu-gi-oh!": "yugioh", "yu-gi-oh": "yugioh",
  "one piece": "one-piece", lorcana: "disney-lorcana", "disney lorcana": "disney-lorcana",
};

const SLUGS: Record<string, string> = { "pokemon-japan": "pokemon", "one-piece-card-game": "one-piece", "yugioh": "yugioh", "magic-the-gathering": "magic-the-gathering", "disney-lorcana": "disney-lorcana", "pokemon": "pokemon", "star-wars-unlimited": "star-wars-unlimited", "digimon-card-game": "digimon", "dragon-ball-super-fusion-world": "dragon-ball-super" };

export function tcgGraphGame(line?: string | null): string | null {
  const l = (line ?? "").trim().toLowerCase();
  return GAMES[l] ?? SLUGS[l] ?? null;
}

export function tcgGraphLanguage(language?: string | null): string {
  const l = (language ?? "").trim().toLowerCase();
  if (l.startsWith("ja") || l === "jp") return "ja";
  return "en";
}

const norm = (s?: string | null) => (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** "025/102" and "25" both compare as "25". */
const num = (s?: string | null) => norm((s ?? "").split("/")[0]).replace(/^0+(?=\w)/, "");

export type TcgGraphCard = { collectorNumber?: string | null; set?: { name?: string | null } | null; images?: { large?: string | null; normal?: string | null } | null };

/** Requires the collector number to match; prefers a matching set name. Never guesses. */
export function pickTcgGraphImage(cards: TcgGraphCard[], number?: string | null, setName?: string | null): string | null {
  const wanted = num(number);
  if (!wanted) return null;
  const sameNumber = cards.filter(c => num(c.collectorNumber) === wanted && (c.images?.large || c.images?.normal));
  const setKey = (s?: string | null) => norm((s ?? "").replace(/\bset\b/gi, ""));
  const set = setKey(setName);
  const pick = (set && sameNumber.find(c => setKey(c.set?.name) === set)) || (sameNumber.length === 1 ? sameNumber[0] : null);
  return pick ? (pick.images?.large || pick.images?.normal || null) : null;
}
