import { describe, expect, it } from "vitest";
import { officialCardImage } from "./card-artwork";

describe("exact catalog artwork", () => {
  it("uses the matched card's product ID, not its name", () => {
    expect(officialCardImage({ id: "pikachu-sv151", name: "Pikachu", tcgplayerId: "517033" })).toBe("https://tcgplayer-cdn.tcgplayer.com/product/517033_in_1000x1000.jpg");
  });
  it("does not invent an image when the exact card has no image identifier", () => {
    expect(officialCardImage({ id: "unknown", name: "Pikachu" })).toBeNull();
  });
  it("rejects invalid provider IDs", () => {
    expect(officialCardImage({ id: "bad", name: "Card", tcgplayerId: "../other" })).toBeNull();
  });
});