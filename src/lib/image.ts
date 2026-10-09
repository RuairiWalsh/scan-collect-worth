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
