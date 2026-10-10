import { describe, it, expect } from "vitest";
import { aarsforbruk, andel, kvotestatus, nyttMotGammelt, plaggtype, STANDARD_KVOTER, verdi, verktoytype, type Utstyr } from "../src/lib/utstyr";

const u = (id: string, dato: string, beskrivelse: string, kategori: Utstyr["kategori"], pris: number, antall = 1, ordre = Number(id)): Utstyr =>
  ({ id, ansatt_id: "jim", kilde: "visma", visma_ordrenr: ordre, dato, varenr: id, nobb_nr: "", beskrivelse, antall, enhet: "STK", pris, kategori, kategori_manuell: false, serienr: "", bilde_sti: null, status: "i_bruk", merknad: "" });

describe("utstyr", () => {
  it("summerer per kategori i året og teller uttak per ordre", () => {
    const liste = [u("1", "2026-02-05", "BUKSE 6241", "arbeidstoy", 1290), u("2", "2026-02-05", "SLAGSKRUTREKKER WHP18DA KM", "verktoy", 2490, 1, 1),
      u("3", "2026-06-01", "BUKSE 6241", "arbeidstoy", 1290), u("4", "2026-03-01", "KRAFTBITS TX20", "forbruk", 19, 6), u("5", "2025-12-01", "JAKKE", "arbeidstoy", 500)];
    const s = aarsforbruk(liste, "jim", 2026);
    expect(s.arbeidstoy).toEqual({ sum: 2580, uttak: 2, siste: "2026-06-01" });
    expect(s.verktoy.sum).toBe(2490);
    expect(s.forbruk.sum).toBe(114);
    expect(verdi({ antall: 6, pris: 19 })).toBe(114);
  });

  it("plaggtyper", () => {
    expect(plaggtype("BUKSE 6241 HL SORT 56")).toBe("bukse");
    expect(plaggtype("VINTERJAKKE 4040")).toBe("vinter");
    expect(plaggtype("Diverse – regnkle")).toBe("regntoy");
    expect(plaggtype("T-SKJORTE SORT XL")).toBe("tskjorte");
    expect(plaggtype("HETTEGENSER")).toBe("genser");
    expect(plaggtype("LUE STRIKK")).toBeNull();
    expect(plaggtype("VERNESKO S3 43", "verneutstyr")).toBe("vernesko");
    expect(plaggtype("HANSKE MONTERING", "verneutstyr")).toBeNull();
  });

  it("kvoter: rullerende periode, antall teller, og når neste blir ledig", () => {
    const liste = [u("1", "2025-11-01", "BUKSE A", "arbeidstoy", 1000), u("2", "2026-05-20", "BUKSE B", "arbeidstoy", 1000),
      u("3", "2026-08-28", "BUKSE C", "arbeidstoy", 1000), u("4", "2026-03-01", "T-SKJORTE", "arbeidstoy", 199, 3),
      u("5", "2025-01-10", "VINTERJAKKE", "arbeidstoy", 2000), u("6", "2026-04-01", "VERNESKO S3", "verneutstyr", 1500)];
    const k = Object.fromEntries(kvotestatus(liste, "jim", STANDARD_KVOTER, "2026-10-10").map((x) => [x.type, x]));
    expect([k.bukse.brukt, k.bukse.maks, k.bukse.over]).toEqual([3, 2, true]);
    expect(k.bukse.ledigFra).toBe("2026-11-01");
    expect(k.tskjorte.brukt).toBe(3);
    expect([k.vinter.brukt, k.vinter.fullt]).toEqual([1, false]);
    expect([k.vernesko.brukt, k.vernesko.fullt, k.vernesko.ledigFra]).toEqual([1, true, "2027-04-01"]);
  });

  it("nytt mot gammelt: samme slags håndverktøy eller samme maskinmodell", () => {
    expect(verktoytype("SNEKKERHAMMER M 16 OZ")).toBe("HAMMER");
    expect(verktoytype("HAMMER ERGO 20OZ XLARE RETTKLO")).toBe("HAMMER");
    expect(verktoytype("SLAGSKRUTREKKER WHP18DA KM")).toBe("M:WHP18DA");
    expect(verktoytype("HAMMERBOR V-PLUS 5X260MM")).toBeNull();
    const liste = [u("1", "2026-02-05", "SNEKKERHAMMER M 16 OZ", "verktoy", 389), u("2", "2026-09-01", "HAMMER ERGO 20OZ", "verktoy", 450),
      u("3", "2026-02-05", "VATER 800MM", "verktoy", 354), u("4", "2026-03-01", "MÅLEBÅND 5M", "verktoy", 99)];
    expect(nyttMotGammelt(liste, "jim").map(([a, b]) => [a.id, b.id])).toEqual([["1", "2"]]);
    liste[0].status = "levert";
    expect(nyttMotGammelt(liste, "jim")).toEqual([]);
    liste[0].status = "i_bruk"; liste[1].bytte_avklart = true;
    expect(nyttMotGammelt(liste, "jim")).toEqual([]);
  });

  it("andel av grensen", () => {
    expect(andel(2000, 4000)).toBe(0.5);
    expect(andel(2000, null)).toBeNull();
  });
});
