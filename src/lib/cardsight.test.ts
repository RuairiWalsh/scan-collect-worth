import { describe, expect, it } from "vitest";
import { cardsightNumber, pickCardsightCard, type CardsightCard } from "./cardsight";

const card = (over: Partial<CardsightCard>): CardsightCard => ({ id: crypto.randomUUID(), ...over });

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
    const right = card({ number: "25", releaseName: "Upper Deck" });
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
});
