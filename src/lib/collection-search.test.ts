import { describe, expect, it } from "vitest";
import { collectionSearchText, matchesCollectionQuery } from "./collection-search";

const pikachu = {
  category: "cards",
  subcategory: "tcg",
  line: "Pokémon",
  name: "Pikachu",
  number: "028/128",
  set_name: "30th Celebration",
  year: "2026",
  condition: "raw_nm",
  grader: null,
  grade: null,
  variant: "Holo",
  notes: null,
};

describe("collection search", () => {
  it("keeps the whole collection on an empty query", () => {
    expect(matchesCollectionQuery(pikachu, "")).toBe(true);
    expect(matchesCollectionQuery(pikachu, "   ")).toBe(true);
  });
  it("finds a card by name, set, number or year, ignoring case", () => {
    for (const query of ["pika", "CELEBRATION", "028", "2026", "holo"]) {
      expect(matchesCollectionQuery(pikachu, query)).toBe(true);
    }
  });
  it("matches a printed accent typed without it", () => {
    expect(collectionSearchText(pikachu)).toContain("pokemon");
    expect(matchesCollectionQuery(pikachu, "pokemon")).toBe(true);
  });
  it("requires every typed word to appear", () => {
    expect(matchesCollectionQuery(pikachu, "pikachu 028")).toBe(true);
    expect(matchesCollectionQuery(pikachu, "pikachu 036")).toBe(false);
  });
  it("searches readable labels, not just stored codes", () => {
    expect(matchesCollectionQuery(pikachu, "near mint")).toBe(true);
    expect(matchesCollectionQuery(pikachu, "tcg")).toBe(true);
    expect(matchesCollectionQuery(pikachu, "cards")).toBe(true);
  });
  it("matches a graded card by grader and grade", () => {
    const graded = { ...pikachu, condition: "graded", grader: "PSA", grade: "10" };
    expect(matchesCollectionQuery(graded, "psa 10")).toBe(true);
    expect(matchesCollectionQuery(graded, "psa 9")).toBe(false);
  });
  it("does not match an unrelated word", () => {
    expect(matchesCollectionQuery(pikachu, "charizard")).toBe(false);
  });
});
