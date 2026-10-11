import { describe, expect, it } from "vitest";
import { pickTcgGraphImage, tcgGraphGame, tcgGraphName } from "./tcggraph";

const card = (n: string, set: string) => ({ collectorNumber: n, set: { name: set }, images: { large: `${set}-${n}` } });

describe("tcggraph matching", () => {
  it("maps app game names", () => { expect(tcgGraphGame("Pokémon")).toBe("pokemon"); expect(tcgGraphGame("Other TCG")).toBeNull(); });
  it("prefers the matching set when numbers collide", () => {
    expect(pickTcgGraphImage([card("4", "Jungle"), card("4", "Base Set")], "4/102", "Base Set")).toBe("Base Set-4");
  });
  it("treats \"Base Set\" and \"Base\" as the same set", () => {
    expect(pickTcgGraphImage([card("4", "Base"), card("4", "Base Set 2")], "4/102", "Base Set")).toBe("Base-4");
  });
  it("reads catalog ids and numbered names", () => {
    expect(tcgGraphGame("pokemon-me-30th-celebration-pikachu-036-128")).toBe("pokemon");
    expect(tcgGraphName("Pikachu - 036/128")).toBe("Pikachu");
    expect(pickTcgGraphImage([card("36", "30th Celebration"), card("36", "Base")], "036/128", "ME: 30th Celebration")).toBe("30th Celebration-36");
  });
  it("refuses ambiguous or missing numbers", () => {
    expect(pickTcgGraphImage([card("4", "Jungle"), card("4", "Fossil")], "4", "Base Set")).toBeNull();
    expect(pickTcgGraphImage([card("4", "Jungle")], null, "Jungle")).toBeNull();
  });
});
