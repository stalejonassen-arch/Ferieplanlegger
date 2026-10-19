import { describe, it, expect } from "vitest";
import { arbeidsdagerFor, hverdag, forsinket, grupperMateriell, nyeFraVisma, oppgaverPaa, sorterOppgaver, ukeDager, type Leveranse, type Materiale, type Oppgave } from "../src/lib/plan";

const o = (id: string, fra: string, til: string, ansatte: string[], rekkefolge = 0, status: Oppgave["status"] = "planlagt"): Oppgave =>
  ({ id, prosjekt_id: "p", tittel: id, beskrivelse: "", fra, til, ansatte, rekkefolge, status, opprettet_av: null, ferdig_tid: null });
const l = (id: string, rekkefolge: number, dato: string | null = null): Leveranse => ({ id, prosjekt_id: "p", navn: id, rekkefolge, dato, status: "planlagt", leverandor: "", notat: "" });
const m = (id: string, leveranse_id: string | null, varenr = ""): Materiale => ({ id, prosjekt_id: "p", leveranse_id, rekkefolge: 0, varenr, nobb_nr: "", beskrivelse: id, antall: 1, enhet: "stk", notat: "", levert: false });

describe("arbeidsplan", () => {
  it("uka går fra mandag til søndag", () => {
    expect(ukeDager("2026-10-17")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });
  it("oppgaver en ansatt har en dag, rekkefølge og forsinkelse", () => {
    const liste = [o("b", "2026-10-12", "2026-10-14", ["ola"], 2), o("a", "2026-10-14", "2026-10-14", ["ola", "per"], 1), o("c", "2026-10-15", "2026-10-16", ["per"])];
    expect(oppgaverPaa(liste, "ola", "2026-10-14").map((x) => x.id)).toEqual(["b", "a"]);
    expect(oppgaverPaa(liste, "ola", "2026-10-15")).toEqual([]);
    expect(sorterOppgaver(liste).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(forsinket(liste[0]!, "2026-10-15")).toBe(true);
    expect(forsinket({ ...liste[0]!, status: "ferdig" }, "2026-10-15")).toBe(false);
  });
});

describe("materialliste", () => {
  it("leveranser i rekkefølge med linjene sine, og linjer uten leveranse til slutt", () => {
    const g = grupperMateriell([l("tak", 2), l("bjelkelag", 1)], [m("lekter", "tak"), m("virke", "bjelkelag"), m("skruer", null)]);
    expect(g.map((x) => [x.leveranse?.id ?? null, x.linjer.map((y) => y.id)])).toEqual([["bjelkelag", ["virke"]], ["tak", ["lekter"]], [null, ["skruer"]]]);
  });
  it("henter bare varer fra Visma som ikke allerede står i listen", () => {
    const nye = nyeFraVisma([{ varenr: "1", beskrivelse: "A", antall: 1, enhet: "STK" }, { varenr: "2", beskrivelse: "B", antall: 2, enhet: "STK" }, { varenr: "", beskrivelse: "Frakt", antall: 1, enhet: "" }], [m("a", null, "1")]);
    expect(nye.map((v) => v.varenr)).toEqual(["2"]);
  });
});

describe("helg i planen", () => {
  // 2026-10-23 er fredag, 24.–25. er helg; 2026-12-25 er 1. juledag
  const o = (x: Partial<Oppgave> = {}): Oppgave => ({ id: "1", prosjekt_id: "p", tittel: "Tak", beskrivelse: "", fra: "2026-10-22", til: "2026-10-27", ansatte: ["a"], rekkefolge: 0, status: "planlagt", opprettet_av: null, ferdig_tid: null, ...x });
  it("lørdag, søndag og helligdager tas ikke med uten avkryssing", () => {
    expect(arbeidsdagerFor(o())).toEqual(["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27"]);
    expect(oppgaverPaa([o()], "a", "2026-10-24")).toHaveLength(0);
    expect(oppgaverPaa([o()], "a", "2026-10-26")).toHaveLength(1);
    expect(arbeidsdagerFor(o({ fra: "2026-12-24", til: "2026-12-28" }))).toEqual(["2026-12-24", "2026-12-28"]);
  });
  it("med helg avkrysset tas alle dager med", () => {
    expect(arbeidsdagerFor(o({ helg: true }))).toHaveLength(6);
    expect(oppgaverPaa([o({ helg: true })], "a", "2026-10-24")).toHaveLength(1);
    expect(hverdag("2026-10-24")).toBe(false);
  });
});
