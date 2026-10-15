import { describe, expect, it } from "vitest";
import { cardsightNumber, cardsightSameSet, pickCardsightCard, rankCardsightCandidates, type CardsightCard } from "./cardsight";

const card = (over: Partial<CardsightCard>): CardsightCard => ({ id: crypto.randomUUID(), name: "Ken Griffey Jr.", ...over });

describe("cardsightNumber", () => {
  it("strips the set total", () => {
    expect(cardsightNumber("025/165")).toBe("025");
    expect(cardsightNumber("LOB-EN001")).toBe("LOB-EN001");
    expect(cardsightNumber(null)).toBeNull();
  });
});

describe("pickCardsightCard", () => {
  const item = { name: "Ken Griffey Jr.", set_name: "Upper Deck", number: "1", year: "1989" };

  it("picks the exact number + set + year match", () => {
    const right = card({ number: "1", setName: "Base Set", releaseName: "Upper Deck", releaseYear: "1989" });
    const wrong = card({ number: "1", setName: "Base Set", releaseName: "Fleer", releaseYear: "1989" });
    expect(pickCardsightCard([wrong, right], item)).toBe(right);
  });

  it("rejects candidates whose number differs when we know the number", () => {
    const wrong = card({ number: "2", setName: "Base Set", releaseName: "Upper Deck", releaseYear: "1989" });
    expect(pickCardsightCard([wrong], item)).toBeNull();
  });

  it("matches numbers regardless of leading zeros", () => {
    const right = card({ name: "X", number: "25", releaseName: "Upper Deck" });
    expect(pickCardsightCard([right], { name: "X", number: "025/165" })).toBe(right);
  });

  it("without a number, requires set or year agreement", () => {
    const noNum = { name: "Ken Griffey Jr.", set_name: "Upper Deck", number: null, year: "1989" };
    const match = card({ number: "5", releaseName: "Upper Deck", releaseYear: "1989" });
    const other = card({ number: "5", releaseName: "Fleer", releaseYear: "1990" });
    expect(pickCardsightCard([match], noNum)).toBe(match);
    expect(pickCardsightCard([other], { name: "Ken Griffey Jr.", number: null })).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(pickCardsightCard([], item)).toBeNull();
  });
  it("rejects another year or player with the same card number", () => {
    expect(pickCardsightCard([card({ number: "1", releaseName: "Upper Deck", releaseYear: "1990" })], item)).toBeNull();
    expect(pickCardsightCard([card({ name: "Other Player", number: "1", releaseName: "Upper Deck", releaseYear: "1989" })], item)).toBeNull();
  });
});

describe("rankCardsightCandidates", () => {
  it("ranks the matching first name above same-surname players", () => {
    const earl = card({ name: "Earl Snyder", releaseName: "Topps" });
    const cory = card({ name: "Cory Snyder", releaseName: "Topps Gold Label" });
    const ranked = rankCardsightCandidates([cory, earl], { name: "Earl Snyder", set_name: "Topps Gold Label" });
    expect(ranked[0]).toBe(earl);
  });

  it("prefers the closer set match within the same player", () => {
    const gold = card({ name: "Earl Snyder", releaseName: "Topps Gold Label" });
    const base = card({ name: "Earl Snyder", releaseName: "Topps" });
    const ranked = rankCardsightCandidates([base, gold], { name: "Earl Snyder", set_name: "Topps Gold Label" });
    expect(ranked[0]).toBe(gold);
  });

  it("keeps all candidates when no set words match", () => {
    const a = card({ name: "Earl Snyder", releaseName: "Topps" });
    const b = card({ name: "Cory Snyder", releaseName: "Fleer" });
    expect(rankCardsightCandidates([b, a], { name: "Earl Snyder", set_name: null })).toHaveLength(2);
  });
});

describe("bulk-import set shortcut (exact set + number)", () => {
  it("treats only the identical set as the same set", () => {
    expect(cardsightSameSet("2002 Topps Gold Label", "2002 Topps Gold Label")).toBe(true);
    expect(cardsightSameSet("2002 Topps", "2002 Topps Gold Label")).toBe(false);
    expect(cardsightSameSet(null, "2002 Topps")).toBe(false);
  });
  it("pins by number inside the remembered set without a player name", () => {
    const match = card({ name: "Earl Snyder", number: "49", releaseName: "2002 Topps Gold Label", releaseYear: "2002" });
    expect(pickCardsightCard([match], { name: "", set_name: "2002 Topps Gold Label", number: "49", year: "2002" })).toBe(match);
  });
  it("returns null when two cards in the set share the number", () => {
    const a = card({ name: "Player A", number: "49", releaseName: "2002 Topps Gold Label", releaseYear: "2002" });
    const b = card({ name: "Player B", number: "49", releaseName: "2002 Topps Gold Label", releaseYear: "2002" });
    expect(pickCardsightCard([a, b], { name: "", set_name: "2002 Topps Gold Label", number: "49", year: "2002" })).toBeNull();
  });
});

import { matchSetCardByNumber } from "./cardsight";
describe("matchSetCardByNumber", () => {
  const set = [{ id: "a", number: "49", name: "Earl Snyder" }, { id: "b", number: "50", name: "X" }, { id: "c", number: "50", name: "Y" }];
  it("pins the single card with that number", () => { expect(matchSetCardByNumber(set, "#49", null)?.id).toBe("a"); });
  it("uses the name when numbers repeat", () => { expect(matchSetCardByNumber(set, "50", "Y")?.id).toBe("c"); });
  it("does not guess between repeated numbers", () => { expect(matchSetCardByNumber(set, "50", null)).toBeNull(); });
  it("returns null for numbers not in the set", () => { expect(matchSetCardByNumber(set, "999", "Earl Snyder")).toBeNull(); });
});

import { pickCardsightCard as pickExact } from "./cardsight";
import { test as t2, expect as e2 } from "vitest";
t2("exact set name beats a longer release (Topps vs Topps Chrome)", () => {
  const base = { id: "a", number: "290", name: "Jim Thome", setName: "Base Set", releaseName: "Topps", releaseYear: "1998" } as never;
  const chrome = { id: "b", number: "290", name: "Jim Thome", setName: "Base Set", releaseName: "Topps Chrome", releaseYear: "1998" } as never;
  e2(pickExact([base, chrome], { name: "Jim Thome", set_name: "Topps", number: "290", year: "1998" })?.id).toBe("a");
});
