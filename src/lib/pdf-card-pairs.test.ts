import { describe, expect, it } from "vitest";
import { isImportedPair, pdfCardPair, scannerImageApproval } from "./pdf-card-pairs";

describe("bulk scanner card imports", () => {
  it("pairs one front page with the next back page, starting at page 1", () => {
    expect(pdfCardPair(6000, 0)).toEqual({ front: 1, back: 2 });
    expect(pdfCardPair(6000, 1)).toEqual({ front: 3, back: 4 });
    expect(pdfCardPair(6000, 2999)).toEqual({ front: 5999, back: 6000 });
    expect(() => pdfCardPair(3, 0)).toThrow();
    expect(() => pdfCardPair(2, 1)).toThrow();
  });
  it("automatically approves admin scanner uploads only", () => {
    expect(scannerImageApproval(true)).toBe("approved");
    expect(() => scannerImageApproval(false)).toThrow("Admins only");
  });
  it("resumes without repeating saved pairs and allows failed pairs to retry", () => {
    expect(isImportedPair("approved")).toBe(true);
    expect(isImportedPair("needs_details")).toBe(true);
    expect(isImportedPair("pending")).toBe(false);
    expect(isImportedPair("failed")).toBe(false);
  });
});