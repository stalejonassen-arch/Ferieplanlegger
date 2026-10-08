import { describe, it, expect } from "vitest";
import { lonnMaaned, lonnCsv, lonnAarCsv } from "../src/lib/lonn";
import type { Ansatt, Data, Soknad } from "../src/lib/ferie";

const ans = (id: string, x: Partial<Ansatt> = {}): Ansatt =>
  ({ id, navn: id, epost: null, avdeling_id: 1, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge: 0, ...x });
const sok = (id: string, ansatt_id: string, fra: string, til: string, status: Soknad["status"] = "godkjent"): Soknad =>
  ({ id, ansatt_id, fra, til, status, merknad: "", kommentar: "", behandlet_av: null, behandlet_tid: null, opprettet: "" });

const d: Data = {
  avdelinger: [{ id: 1, navn: "Snekker", maks_borte: 2, rekkefolge: 1 }],
  ansatte: [ans("Ola", { over60: true }), ans("Kari"), ans("Borte", { aktiv: false })],
  ferieaar: [],
  soknader: [
    sok("1", "Ola", "2027-06-28", "2027-07-09"),            // går over månedsskiftet
    sok("2", "Ola", "2027-03-22", "2027-03-26"),            // påskeuka: skjærtorsdag og langfredag trekkes ikke
    sok("3", "Kari", "2027-07-19", "2027-07-23", "venter"), // ikke godkjent
    sok("4", "Kari", "2027-07-26", "2027-07-30", "avslatt"),
  ],
};

describe("ferie i lønnskjøringen", () => {
  it("teller godkjente dager klippet til måneden", () => {
    const r = lonnMaaned(d, 2027, 7);
    const ola = r.find((x) => x.ansatt.id === "Ola")!, kari = r.find((x) => x.ansatt.id === "Kari")!;
    expect(ola.dager).toBe(7);                    // 1.–9. juli man–fre
    expect(ola.perioder).toEqual(["1.7.–9.7."]);
    expect(ola.hittil).toBe(3 + 10);              // mars + 28. juni–9. juli
    expect(kari.dager).toBe(0);
    expect(kari.venter).toBe(5);                  // venter vises, avslått ignoreres
  });
  it("hopper over inaktive ansatte", () => {
    expect(lonnMaaned(d, 2027, 7).map((r) => r.ansatt.navn)).toEqual(["Kari", "Ola"]) // sortert på navn;
  });
  it("lager CSV for Excel", () => {
    const f = lonnCsv(lonnMaaned(d, 2027, 6), 2027, 6);
    expect(f.startsWith("﻿")).toBe(true);
    expect(f).toContain("Ola;Snekker;3;28.6.–30.6.;;6;Ja");
    expect(f).toContain("Sum;;3;");
  });
  it("lager årsoversikt", () => {
    const f = lonnAarCsv(d, 2027);
    expect(f).toContain("Ola;Snekker;;;3;;;3;7;;;;;;13");
  });
});
