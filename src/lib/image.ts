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
        full: drawToDataUrl(img, img.naturalWidth, img.naturalHeight, 1024),
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
export function frameSignature(video: HTMLVideoElement): Float32Array {
  sigCanvas ??= document.createElement("canvas");
  sigCanvas.width = 32;
  sigCanvas.height = 24;
  const ctx = sigCanvas.getContext("2d", { willReadFrequently: true })!;
  // Only look at the framed centre area.
  const w = video.videoWidth, h = video.videoHeight;
  ctx.drawImage(video, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 0, 0, 32, 24);
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
