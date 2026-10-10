// Pure, fast card finder: looks for a card-shaped rectangle (four straight edges,
// trading-card proportions) in a small grayscale frame. No ML, runs every tick.

export type Box = { x: number; y: number; w: number; h: number }; // normalised 0..1

export function detectCard(g: ArrayLike<number>, W: number, H: number): Box | null {
  const n = W * H;
  const eh = new Uint8Array(n); // horizontal edges (top/bottom sides)
  const ev = new Uint8Array(n); // vertical edges (left/right sides)
  const mag = new Float32Array(n);
  let sum = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = g[i - W + 1]! + 2 * g[i + 1]! + g[i + W + 1]! - g[i - W - 1]! - 2 * g[i - 1]! - g[i + W - 1]!;
      const gy = g[i + W - 1]! + 2 * g[i + W]! + g[i + W + 1]! - g[i - W - 1]! - 2 * g[i - W]! - g[i - W + 1]!;
      const m = Math.abs(gx) + Math.abs(gy);
      mag[i] = m;
      sum += m;
    }
  const T = Math.max(40, (2 * sum) / n);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (mag[i]! < T) continue;
      const gx = g[i - W + 1]! + 2 * g[i + 1]! + g[i + W + 1]! - g[i - W - 1]! - 2 * g[i - 1]! - g[i + W - 1]!;
      const gy = g[i + W - 1]! + 2 * g[i + W]! + g[i + W + 1]! - g[i - W - 1]! - 2 * g[i - W]! - g[i - W + 1]!;
      if (Math.abs(gy) >= Math.abs(gx)) eh[i] = 1;
      else ev[i] = 1;
    }

  // Bands of ±2 px tolerate a slightly tilted card. Prefix sums for fast coverage checks.
  const B = 2;
  const rp = new Int32Array(H * (W + 1)); // per row, prefix over x
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let d = -B; d <= B && !hit; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < H && eh[yy * W + x]) hit = 1;
      }
      rp[y * (W + 1) + x + 1] = rp[y * (W + 1) + x]! + hit;
    }
  const cp = new Int32Array(W * (H + 1)); // per column, prefix over y
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      let hit = 0;
      for (let d = -B; d <= B && !hit; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < W && ev[y * W + xx]) hit = 1;
      }
      cp[x * (H + 1) + y + 1] = cp[x * (H + 1) + y]! + hit;
    }

  const peaks = (count: (k: number) => number, len: number, min: number) => {
    const c = Array.from({ length: len }, (_, k) => count(k));
    const out: number[] = [];
    for (let k = 0; k < len; k++) {
      if (c[k]! < min) continue;
      let isMax = true;
      for (let d = -3; d <= 3; d++) if (d && c[k + d] !== undefined && c[k + d]! > c[k]!) isMax = false;
      if (isMax && !out.some((o) => Math.abs(o - k) <= 3)) out.push(k);
    }
    return out.sort((a, b) => c[b]! - c[a]!).slice(0, 14);
  };
  // Raw (un-banded) counts break ties so the peak sits on the actual edge, not the band's rim.
  const rawRow = new Float32Array(H), rawCol = new Float32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { rawRow[y]! += eh[y * W + x]!; rawCol[x]! += ev[y * W + x]!; }
  const rows = peaks((y) => rp[y * (W + 1) + W]! + rawRow[y]! * 0.01, H, W * 0.12);
  const cols = peaks((x) => cp[x * (H + 1) + H]! + rawCol[x]! * 0.01, W, H * 0.12);

  const rowCov = (y: number, l: number, r: number) => (rp[y * (W + 1) + r]! - rp[y * (W + 1) + l]!) / (r - l);
  const colCov = (x: number, t: number, b: number) => (cp[x * (H + 1) + b]! - cp[x * (H + 1) + t]!) / (b - t);

  let best: { score: number; box: Box } | null = null;
  for (const t of rows)
    for (const b of rows) {
      if (b - t < H * 0.2) continue;
      for (const l of cols)
        for (const r of cols) {
          if (r - l < W * 0.15) continue;
          const w = r - l, h = b - t;
          const a = w / h;
          if (!((a > 0.6 && a < 0.84) || (a > 1.2 && a < 1.66))) continue;
          const area = (w * h) / n;
          if (area < 0.05) continue;
          const cv = [rowCov(t, l, r), rowCov(b, l, r), colCov(l, t, b), colCov(r, t, b)];
          if (Math.min(...cv) < 0.45) continue;
          const avg = (cv[0]! + cv[1]! + cv[2]! + cv[3]!) / 4;
          if (avg < 0.6) continue;
          const score = avg * Math.sqrt(area);
          if (!best || score > best.score) best = { score, box: { x: l / W, y: t / H, w: w / W, h: h / H } };
        }
    }
  return best?.box ?? null;
}

export function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}
