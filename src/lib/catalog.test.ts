import { describe, expect, it } from "vitest";
import { baseName, confidentMatch, parseNumber, rankCandidates } from "./catalog";

const cands = [
  { id: "a", name: "Pikachu - 025/128", set_name: "ME: 30th Celebration", number: "025/128", rarity: "Rare" },
  { id: "b", name: "Pikachu - 025/165", set_name: "SV: Scarlet & Violet 151", number: "025/165", rarity: "Common" },
  { id: "c", name: "Pichu", set_name: "Arceus", number: "25/99", rarity: "Rare" },
  { id: "d", name: "Legendary Treasures Booster Box", set_name: "Legendary Treasures", number: "N/A", rarity: "" },
];

describe("catalog matching", () => {
  it("parses printed numbers", () => {
    expect(parseNumber("025/165")).toEqual({ num: "25", total: "165" });
    expect(parseNumber("LOB-EN001")).toEqual({ num: "lob-en001", total: null });
    expect(parseNumber("N/A")).toBeNull();
  });

  it("strips catalog suffixes from names", () => {
    expect(baseName("Pikachu - 025/165 (Holiday Calendar)")).toBe("Pikachu");
  });

  it("picks the card whose number and set total match", () => {
    const ranked = rankCandidates({ name: "Pikachu", set_name: null, number: "025/165" }, cands);
    expect(confidentMatch(ranked)?.id).toBe("b");
  });

  it("never treats sealed boxes as cards", () => {
    const ranked = rankCandidates({ name: "Legendary Treasures Booster Box", set_name: null, number: null }, cands);
    expect(ranked.find((r) => r.card.id === "d")).toBeUndefined();
  });

  it("refuses to guess when only the name is known", () => {
    const ranked = rankCandidates({ name: "Pikachu", set_name: null, number: null }, cands);
    expect(confidentMatch(ranked)).toBeNull();
  });
});
