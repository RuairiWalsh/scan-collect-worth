import { describe, expect, it } from "vitest";
import { pickTcgGraphImage, tcgGraphGame } from "./tcggraph";

const card = (n: string, set: string) => ({ collectorNumber: n, set: { name: set }, images: { large: `${set}-${n}` } });

describe("tcggraph matching", () => {
  it("maps app game names", () => { expect(tcgGraphGame("Pokémon")).toBe("pokemon"); expect(tcgGraphGame("Other TCG")).toBeNull(); });
  it("prefers the matching set when numbers collide", () => {
    expect(pickTcgGraphImage([card("4", "Jungle"), card("4", "Base Set")], "4/102", "Base Set")).toBe("Base Set-4");
  });
  it("treats \"Base Set\" and \"Base\" as the same set", () => {
    expect(pickTcgGraphImage([card("4", "Base"), card("4", "Base Set 2")], "4/102", "Base Set")).toBe("Base-4");
  });
  it("refuses ambiguous or missing numbers", () => {
    expect(pickTcgGraphImage([card("4", "Jungle"), card("4", "Fossil")], "4", "Base Set")).toBeNull();
    expect(pickTcgGraphImage([card("4", "Jungle")], null, "Jungle")).toBeNull();
  });
});
