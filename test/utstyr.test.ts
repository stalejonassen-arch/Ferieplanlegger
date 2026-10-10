import { describe, it, expect } from "vitest";
import { aarsforbruk, andel, gjentak, verdi, type Utstyr } from "../src/lib/utstyr";

const u = (id: string, dato: string, varenr: string, kategori: Utstyr["kategori"], pris: number, antall = 1, ordre = Number(id)): Utstyr =>
  ({ id, ansatt_id: "jim", kilde: "visma", visma_ordrenr: ordre, dato, varenr, nobb_nr: "", beskrivelse: varenr, antall, enhet: "STK", pris, kategori, kategori_manuell: false, serienr: "", bilde_sti: null, status: "i_bruk", merknad: "" });

describe("utstyr", () => {
  const liste = [
    u("1", "2026-02-05", "11111111", "arbeidstoy", 1290),
    u("2", "2026-02-05", "22222222", "verktoy", 2490, 1, 1),
    u("3", "2026-06-01", "11111111", "arbeidstoy", 1290),
    u("4", "2026-03-01", "60644557", "forbruk", 19, 6),
    u("5", "2025-12-01", "33333333", "arbeidstoy", 500),
  ];
  it("summerer per kategori i året og teller uttak per ordre", () => {
    const s = aarsforbruk(liste, "jim", 2026);
    expect(s.arbeidstoy).toEqual({ sum: 2580, uttak: 2, siste: "2026-06-01" });
    expect(s.verktoy.sum).toBe(2490);
    expect(s.forbruk.sum).toBe(114);
    expect(verdi({ antall: 6, pris: 19 })).toBe(114);
  });
  it("finner samme vare tatt ut igjen innen grensen", () => {
    expect(gjentak(liste, "jim", 6).map(([a, b]) => [a.id, b.id])).toEqual([["1", "3"]]);
    expect(gjentak(liste, "jim", 3)).toEqual([]);
    expect(gjentak(liste, "jim", 0)).toEqual([]);
  });
  it("andel av grensen", () => {
    expect(andel(2000, 4000)).toBe(0.5);
    expect(andel(2000, null)).toBeNull();
  });
});
