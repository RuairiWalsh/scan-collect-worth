import { describe, expect, it } from "vitest";
import { officialCardImage } from "./card-artwork";

describe("provider artwork is prohibited for all cards", () => {
  it("never returns a TCGplayer image even with an exact product ID", () => {
    expect(officialCardImage({ id: "pikachu-sv151", name: "Pikachu", tcgplayerId: "517033" })).toBeNull();
  });
  it("never returns a Scryfall image", () => {
    expect(officialCardImage({ id: "magic", name: "Card", scryfallId: "12345678-1234-1234-1234-123456789abc" })).toBeNull();
  });
  it("does not invent an image when the exact card has no image identifier", () => {
    expect(officialCardImage({ id: "unknown", name: "Pikachu" })).toBeNull();
  });
  it("rejects invalid provider IDs", () => {
    expect(officialCardImage({ id: "bad", name: "Card", tcgplayerId: "../other" })).toBeNull();
  });
});