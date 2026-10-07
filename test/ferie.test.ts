import { describe, it, expect } from "vitest";
import { paaskedag, helligdag, virkedager, hovedferieDager, saldo, regelsjekk, harFeil, type Data, type Ansatt, type Soknad } from "../src/lib/ferie";

const ans = (id: string, avdeling_id: number, x: Partial<Ansatt> = {}): Ansatt =>
  ({ id, navn: id, epost: null, avdeling_id, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge: 0, ...x });
const sok = (id: string, ansatt_id: string, fra: string, til: string, status: Soknad["status"] = "godkjent"): Soknad =>
  ({ id, ansatt_id, fra, til, status, merknad: "", kommentar: "", behandlet_av: null, behandlet_tid: null, opprettet: "" });

describe("datoer", () => {
  it("finner påskedag", () => {
    expect(paaskedag(2026)).toBe("2026-04-05");
    expect(paaskedag(2027)).toBe("2027-03-28");
    expect(paaskedag(2028)).toBe("2028-04-16");
  });
  it("kjenner helligdager", () => {
    expect(helligdag("2027-05-17")).toBe("Grunnlovsdag og 2. pinsedag");
    expect(helligdag("2027-05-06")).toBe("Kristi himmelfartsdag");
    expect(helligdag("2027-05-17")).toBeTruthy();
    expect(helligdag("2027-07-01")).toBeUndefined();
  });
  it("teller virkedager som ferieloven", () => {
    expect(virkedager("2027-07-05", "2027-07-24")).toBe(18); // tre uker man–lør
    expect(virkedager("2027-07-05", "2027-07-10")).toBe(6);  // én uke = 6 virkedager
    expect(virkedager("2026-03-30", "2026-04-11")).toBe(9);  // påske 2026: 4 helligdager + 2 søndager unntatt
    expect(virkedager("2027-12-20", "2027-12-31")).toBe(10); // 1. juledag (lørdag) og søndag/2. juledag unntatt
  });
  it("teller hovedferiedager bare i juni–september", () => {
    expect(hovedferieDager("2027-05-24", "2027-06-05", 2027)).toBe(5); // 1.–5. juni
    expect(hovedferieDager("2027-10-01", "2027-10-10", 2027)).toBe(0);
  });
});

describe("saldo og regelsjekk", () => {
  const d: Data = {
    avdelinger: [{ id: 1, navn: "Butikk", maks_borte: 1, rekkefolge: 1 }, { id: 2, navn: "Kjøkken", maks_borte: 1, rekkefolge: 2 }],
    ansatte: [ans("a", 1), ans("b", 1), ans("k", 2, { over60: true })],
    ferieaar: [{ ansatt_id: "a", aar: 2027, overfort: 4 }],
    soknader: [sok("s1", "a", "2027-07-05", "2027-07-24"), sok("s2", "a", "2027-10-11", "2027-10-16", "venter"), sok("s3", "b", "2027-07-19", "2027-07-31", "avslatt")],
  };
  it("regner saldo med overført ferie", () => {
    expect(saldo(d.ansatte[0], 2027, d)).toEqual({ total: 29, godkjent: 18, venter: 6, igjen: 5, hovedferie: 18 });
    expect(saldo(d.ansatte[2], 2027, d).total).toBe(31);
  });
  it("ser bort fra søknaden som behandles", () => {
    expect(saldo(d.ansatte[0], 2027, d, "s2").igjen).toBe(11);
    expect(harFeil(regelsjekk(d, d.ansatte[0], "2027-10-11", "2027-10-16", "2027-01-10", { unntaId: "s2" }))).toBe(false);
  });
  it("stopper overforbruk og overlapp", () => {
    const r = regelsjekk(d, d.ansatte[0], "2027-08-02", "2027-08-14", "2027-01-10");
    expect(r.some((x) => x.niva === "feil" && x.tekst.includes("har 5 virkedager igjen"))).toBe(true);
    expect(harFeil(regelsjekk(d, d.ansatte[0], "2027-07-20", "2027-07-21", "2027-01-10"))).toBe(true);
  });
  it("varsler om bemanning og kort varsel, men ikke for avslåtte", () => {
    const r = regelsjekk(d, d.ansatte[1], "2027-07-12", "2027-07-17", "2027-06-01");
    expect(r.find((x) => x.tekst.startsWith("Butikk: maks 1"))).toBeTruthy();
    expect(r.find((x) => x.tekst.includes("2 måneders varsel") && x.niva === "advarsel")).toBeTruthy();
    const r2 = regelsjekk(d, d.ansatte[1], "2027-08-02", "2027-08-07", "2027-01-01");
    expect(r2.find((x) => x.tekst.startsWith("Bemanningen i Butikk holder"))).toBeTruthy();
  });
  it("avviser periode over nyttår", () => {
    expect(harFeil(regelsjekk(d, d.ansatte[1], "2027-12-28", "2028-01-03", "2027-01-01"))).toBe(true);
  });
});
