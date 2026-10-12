import { describe, expect, it } from "vitest";
import { numistaCacheFresh, numistaGrade, numistaPcgsNo, pickNumistaIssue, rankNumistaTypes, parseNumistaId, numistaCatalogId } from "./numista";

describe("numista", () => {
  it("cached data expires after 7 days", () => {
    const now = Date.parse("2026-10-12T00:00:00Z");
    expect(numistaCacheFresh("2026-10-06T00:00:00Z", now)).toBe(true);
    expect(numistaCacheFresh("2026-10-04T23:00:00Z", now)).toBe(false);
    expect(numistaCacheFresh(null, now)).toBe(false);
  });
  it("maps conditions to Numista grades", () => {
    expect(numistaGrade("vf")).toBe("vf");
    expect(numistaGrade("fine")).toBe("f");
    expect(numistaGrade("ms65")).toBe("unc");
    expect(numistaGrade("proof")).toBeNull();
  });
  it("keeps only the scanned country and year, standard issues first", () => {
    const types = [
      { id: 1, title: "½ Dollar Kennedy (Pattern)", issuer: { name: "United States" }, min_year: 1964, max_year: 1964, object_type: { name: "Patterns" } },
      { id: 2, title: "½ Dollar Kennedy", issuer: { name: "United States" }, min_year: 1964, max_year: 1964, object_type: { name: "Standard circulation coins" } },
      { id: 3, title: "25 Dollars Kennedy", issuer: { name: "Liberia" }, min_year: 2000, max_year: 2000 },
    ];
    expect(rankNumistaTypes(types, { country: "United States", year: "1964" }).map((t) => t.id)).toEqual([2, 1]);
  });
  it("picks the issue by year and mint mark, excluding proofs", () => {
    const issues = [
      { id: 10, gregorian_year: 1964 },
      { id: 11, gregorian_year: 1964, mint_letter: "D" },
      { id: 12, gregorian_year: 1964, comment: "Proof" },
    ];
    expect(pickNumistaIssue(issues, { year: "1964", mint: "D" })?.id).toBe(11);
    expect(pickNumistaIssue(issues, { year: "1964" })?.id).toBe(10);
    expect(pickNumistaIssue(issues, { year: "1964", proof: true })?.id).toBe(12);
  });
  it("reads the PCGS number from an issue's references", () => {
    const issues = [
      { id: 10, gregorian_year: 1964, references: [{ number: "6706", catalogue: { code: "PCGS" } }] },
      { id: 11, gregorian_year: 1964, references: [{ number: "X1", catalogue: { code: "KM" } }] },
    ];
    expect(numistaPcgsNo(issues, 10)).toBe("6706");
    expect(numistaPcgsNo(issues, 11)).toBeNull();
    expect(numistaPcgsNo(issues, null)).toBeNull();
  });
  it("uses the year's shared PCGS number when the exact issue is unknown", () => {
    const issues = [
      { id: 1, gregorian_year: 1991, comment: "No Mint Mark, Minted at San Francisco", references: [{ number: "9846", catalogue: { code: "PCGS" } }] },
      { id: 2, gregorian_year: 1991, comment: "No Mint Mark, Minted at West Point", references: [{ number: "9846", catalogue: { code: "PCGS" } }] },
      { id: 3, gregorian_year: 1991, comment: "Proof", mint_letter: "S" },
      { id: 4, gregorian_year: 1992, references: [{ number: "9847", catalogue: { code: "PCGS" } }] },
      { id: 5, gregorian_year: 1992, mint_letter: "D", references: [{ number: "9900", catalogue: { code: "PCGS" } }] },
    ];
    expect(numistaPcgsNo(issues, null, "1991")).toBe("9846");
    expect(numistaPcgsNo(issues, null, "1992")).toBeNull();
    expect(numistaPcgsNo(issues, null, "1993")).toBeNull();
  });
  it("round-trips catalog ids", () => {
    expect(parseNumistaId(numistaCatalogId(943, 22280))).toEqual({ typeId: 943, issueId: 22280 });
  });
});
