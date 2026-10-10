// Browser-only helpers for turning camera frames / files into compact JPEG data URLs.
export function drawToDataUrl(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxSide: number,
  quality = 0.82,
): string {
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function captureVideo(video: HTMLVideoElement) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  return {
    full: drawToDataUrl(video, w, h, 1024),
    thumb: drawToDataUrl(video, w, h, 320, 0.75),
  };
}

export function fileToImages(file: File): Promise<{ full: string; thumb: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        full: drawToDataUrl(img, img.naturalWidth, img.naturalHeight, 1600, 0.9),
        thumb: drawToDataUrl(img, img.naturalWidth, img.naturalHeight, 320, 0.75),
      });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 });

/** Tiny grayscale fingerprint of a video frame for motion / change detection. */
let sigCanvas: HTMLCanvasElement | null = null;
export function frameSignature(video: HTMLVideoElement, r?: { x: number; y: number; w: number; h: number }): Float32Array {
  sigCanvas ??= document.createElement("canvas");
  sigCanvas.width = 32;
  sigCanvas.height = 24;
  const ctx = sigCanvas.getContext("2d", { willReadFrequently: true })!;
  // Only look at the framed centre area.
  const w = video.videoWidth, h = video.videoHeight;
  const box = r ?? { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 };
  ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, 32, 24);
  const d = ctx.getImageData(0, 0, 32, 24).data;
  const out = new Float32Array(32 * 24);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]!) / 3;
  return out;
}

export function sigDiff(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}

export function sigContrast(a: Float32Array) {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += Math.abs(v - m);
  return s / a.length;
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Map an on-screen element (the card guide) to video pixel coords, for an object-cover video. */
export function guideToVideoRect(video: HTMLVideoElement, guide: HTMLElement, margin = 0.08): Rect {
  const vw = video.videoWidth, vh = video.videoHeight;
  const vr = video.getBoundingClientRect();
  const gr = guide.getBoundingClientRect();
  const scale = Math.max(vr.width / vw, vr.height / vh);
  const offX = (vw * scale - vr.width) / 2;
  const offY = (vh * scale - vr.height) / 2;
  let x = (gr.left - vr.left + offX) / scale;
  let y = (gr.top - vr.top + offY) / scale;
  let w = gr.width / scale;
  let h = gr.height / scale;
  x -= w * margin; y -= h * margin; w *= 1 + 2 * margin; h *= 1 + 2 * margin;
  x = Math.max(0, x); y = Math.max(0, y);
  w = Math.min(vw - x, w); h = Math.min(vh - y, h);
  return { x, y, w, h };
}

/** Crop the guide region of the current video frame at high resolution. */
export function captureRegion(video: HTMLVideoElement, r: Rect) {
  const draw = (maxSide: number, quality: number) => {
    const scale = Math.min(1, maxSide / Math.max(r.w, r.h));
    const c = document.createElement("canvas");
    c.width = Math.round(r.w * scale);
    c.height = Math.round(r.h * scale);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  };
  return { full: draw(1600, 0.9), thumb: draw(360, 0.75) };
}

/** Focus score (variance of a Laplacian) of the guide region — higher is sharper. */
let sharpCanvas: HTMLCanvasElement | null = null;
export function sharpness(video: HTMLVideoElement, r: Rect): number {
  sharpCanvas ??= document.createElement("canvas");
  const W = 160, H = Math.max(40, Math.round((160 * r.h) / r.w));
  sharpCanvas.width = W;
  sharpCanvas.height = H;
  const ctx = sharpCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]!) / 3;
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const l = 4 * g[i]! - g[i - 1]! - g[i + 1]! - g[i - W]! - g[i + W]!;
      sum += l; sq += l * l; n++;
    }
  const m = sum / n;
  return sq / n - m * m;
}
