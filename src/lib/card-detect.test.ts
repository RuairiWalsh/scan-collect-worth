import { describe, expect, it } from "vitest";
import { detectCard } from "./card-detect";

const W = 160, H = 120;
function scene(draw: (x: number, y: number) => number | null) {
  const g = new Float32Array(W * H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) g[y * W + x] = draw(x, y) ?? 90 + rnd() * 20;
  return g;
}

describe("detectCard", () => {
  it("finds a portrait card with artwork inside it", () => {
    const g = scene((x, y) => {
      if (x >= 50 && x < 110 && y >= 15 && y < 99) {
        if (x >= 56 && x < 104 && y >= 25 && y < 60) return 40; // artwork box
        return 220;
      }
      return null;
    });
    const b = detectCard(g, W, H)!;
    expect(b).not.toBeNull();
    expect(Math.abs(b.x * W - 50)).toBeLessThanOrEqual(3);
    expect(Math.abs(b.y * H - 15)).toBeLessThanOrEqual(3);
    expect(Math.abs(b.w * W - 60)).toBeLessThanOrEqual(4);
    expect(Math.abs(b.h * H - 84)).toBeLessThanOrEqual(4);
  });

  it("ignores a hand-like blob with no straight edges", () => {
    const g = scene((x, y) => (((x - 80) / 40) ** 2 + ((y - 60) / 50) ** 2 < 1 ? 180 : null));
    expect(detectCard(g, W, H)).toBeNull();
  });

  it("ignores a plain empty surface", () => {
    expect(detectCard(scene(() => null), W, H)).toBeNull();
  });
});
