import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfCardPair } from "./pdf-card-pairs";

export async function openScannerPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hashBytes = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(hashBytes), b => b.toString(16).padStart(2, "0")).join("");
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  try { pdfCardPair(pdf.numPages, 0); } catch (error) { await pdf.destroy(); throw error; }
  return { pdf, hash };
}

export async function scannerPage(pdf: PDFDocumentProxy, pageNumber: number, dpi: number): Promise<Blob> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / 72 });
  if (viewport.width * viewport.height > 32_000_000) { page.cleanup(); throw new Error("Page is too large at this resolution. Choose a lower scan resolution."); }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF rendering is unavailable.");
  try {
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not extract scan page.")), "image/png"));
    if (blob.size > 20 * 1024 * 1024) throw new Error("Scan page exceeds 20 MB. Choose a lower resolution.");
    return blob;
  } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
}