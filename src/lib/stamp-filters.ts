export const STAMP_SUBJECTS = ["Generic", "People", "Monuments/locations", "Commemorative", "Animals"] as const;
export const STAMP_LEVELS = ["country", "century", "decade", "subject"] as const;
export type StampLevel = (typeof STAMP_LEVELS)[number];
export type StampFilter = Record<StampLevel, string>;
export const EMPTY_STAMP_FILTER: StampFilter = { country: "all", century: "all", decade: "all", subject: "all" };
export type StampRow = { category: string; subcategory: string | null; line: string | null; year?: string | null };

export function stampDetails(item: StampRow): StampFilter {
  const rawCountry = item.subcategory?.trim() ?? "";
  const aliases: Record<string, string> = { us: "United States", usa: "United States", uk: "United Kingdom", gb: "United Kingdom" };
  const country = aliases[rawCountry.toLowerCase()] ?? (rawCountry && rawCountry.toLowerCase() !== "world" ? rawCountry : "Unknown country");
  const year = /^\d{4}$/.test(item.year?.trim() ?? "") ? Number(item.year) : 0;
  const century = year > 0 ? Math.ceil(year / 100) : 0;
  const suffix = century % 100 >= 11 && century % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[century % 10] ?? "th";
  const rawSubject = item.line?.trim().toLowerCase();
  const subject = rawSubject === "definitive" || rawSubject === "generic" ? "Generic"
    : STAMP_SUBJECTS.find((s) => s.toLowerCase() === rawSubject) ?? "Unknown subject";
  return { country, century: century ? `${century}${suffix} century` : "Unknown century", decade: year ? `${Math.floor(year / 10) * 10}s` : "Unknown decade", subject };
}

export function matchesStampFilter(item: StampRow, filter: StampFilter): boolean {
  if (item.category !== "stamps") return false;
  const details = stampDetails(item);
  return STAMP_LEVELS.every((level) => filter[level] === "all" || filter[level] === details[level]);
}

export function stampOptions(items: StampRow[], filter: StampFilter, level: StampLevel): string[] {
  const index = STAMP_LEVELS.indexOf(level);
  const parentFilter = { ...EMPTY_STAMP_FILTER };
  for (const parent of STAMP_LEVELS.slice(0, index)) parentFilter[parent] = filter[parent];
  const values = Array.from(new Set(items.filter((item) => matchesStampFilter(item, parentFilter)).map((item) => stampDetails(item)[level])));
  if (level === "subject") return [...STAMP_SUBJECTS, ...values.filter((v) => !STAMP_SUBJECTS.some((s) => s === v))];
  return values.sort((a, b) => a.startsWith("Unknown") ? 1 : b.startsWith("Unknown") ? -1 : level === "country" ? a.localeCompare(b) : parseInt(b) - parseInt(a));
}

export function pickStampLevel(filter: StampFilter, level: StampLevel, value: string): StampFilter {
  const next = { ...filter, [level]: value };
  for (const child of STAMP_LEVELS.slice(STAMP_LEVELS.indexOf(level) + 1)) next[child] = "all";
  return next;
}
