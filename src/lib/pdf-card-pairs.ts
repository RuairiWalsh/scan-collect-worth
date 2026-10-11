/** PDF page numbers are 1-based; every card has an adjacent front then back. */
export function pdfCardPair(pageCount: number, pairIndex: number) {
  if (!Number.isInteger(pageCount) || pageCount < 2 || pageCount % 2 !== 0) {
    throw new Error("The PDF needs an even number of pages, with a front followed by a back.");
  }
  if (!Number.isInteger(pairIndex) || pairIndex < 0 || pairIndex >= pageCount / 2) {
    throw new Error("Card pair is outside this PDF.");
  }
  return { front: pairIndex * 2 + 1, back: pairIndex * 2 + 2 };
}

export function isImportedPair(status: string) {
  return status === "approved" || status === "duplicate" || status === "needs_details";
}

export function scannerImageApproval(isAdmin: boolean, confirmed = false) {
  if (!isAdmin) throw new Error("Admins only");
  return confirmed ? "approved" as const : "needs_details" as const;
}