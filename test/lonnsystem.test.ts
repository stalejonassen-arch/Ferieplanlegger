import { describe, it, expect } from "vitest";
import { lonnLinjer, utenAnsattnr, vismaLonnFil } from "../src/lib/lonnsystem";
import { finnLonnsart, lonnPlan, sisteDag } from "../supabase/functions/tripletex-sync/logikk";
import type { LonnTimer } from "../src/lib/timer";
import type { LonnRad } from "../src/lib/lonn";
import type { Ansatt } from "../src/lib/ferie";

const ansatt = (id: string, navn: string, ansattnr: string | null): Ansatt =>
  ({ id, navn, ansattnr, epost: null, avdeling_id: 1, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge: 0 }) as Ansatt;
const t = (a: Ansatt, x: Partial<LonnTimer>): LonnTimer =>
  ({ ansatt: a, normal: 0, ot50: 0, ot100: 0, km: 0, reisetid: 0, lunsjtrekk: 0, avvik: [], ikkeGodkjent: 0, egenmelding: 0, sykmelding: 0, syktBarn: 0, ...x });
const lars = ansatt("a1", "Lars Berg", "101"), ola = ansatt("a2", "Ola Nordmann", null);
const timer = [t(lars, { normal: 150, ot50: 4.5, km: 120.333, sykmelding: 2 }), t(ola, { normal: 160, ot100: 7.5 })];
const ferie = [{ ansatt: lars, dager: 3 }, { ansatt: ola, dager: 0 }] as LonnRad[];

describe("lønnslinjer", () => {
  it("bare typer med lønnsart og antall over 0 blir linjer, i fast rekkefølge", () => {
    const l = lonnLinjer(timer, ferie, { ot50: "1050", ot100: "1051", km: " 1300 ", ferie: "1400", sykmelding: "" });
    expect(l.map((x) => [x.navn, x.art, x.kode, x.antall])).toEqual([
      ["Lars Berg", "ot50", "1050", 4.5], ["Lars Berg", "km", "1300", 120.33], ["Lars Berg", "ferie", "1400", 3],
      ["Ola Nordmann", "ot100", "1051", 7.5],
    ]);
    expect(utenAnsattnr(l)).toEqual(["Ola Nordmann"]);
  });
  it("Visma Lønn-fila har 17 kolonner, punktum som desimaltegn og hopper over ansatte uten nummer", () => {
    const fil = vismaLonnFil(lonnLinjer(timer, ferie, { normal: "1020", ot50: "1050", ot100: "1051" }), 2026);
    const rader = fil.trim().split("\r\n");
    expect(rader).toEqual(["2026;1;101;1020;;150;;;;;;;;;;;0", "2026;1;101;1050;;4.5;;;;;;;;;;;0"]);
    expect(rader.every((r) => r.split(";").length === 17)).toBe(true);
  });
});

describe("Tripletex lønn", () => {
  it("siste dag i måneden, også i skuddår", () => {
    expect(sisteDag("2026-10")).toBe("2026-10-31");
    expect(sisteDag("2028-02")).toBe("2028-02-29");
  });
  it("planen sender nye, retter endrede og fjerner linjer som ikke lenger finnes", () => {
    const p = lonnPlan(
      [{ ansatt_id: "a1", art: "ot50", kode: "1050", antall: 6 }, { ansatt_id: "a1", art: "km", kode: "1300", antall: 120 },
        { ansatt_id: "a2", art: "ot100", kode: "1051", antall: 7.5 }, { ansatt_id: "a2", art: "tull", kode: "9", antall: 1 }, { ansatt_id: "a3", art: "ot50", kode: "", antall: 2 }],
      [{ ansatt_id: "a1", art: "ot50", tripletex_id: 11, antall: 4.5 }, { ansatt_id: "a1", art: "km", tripletex_id: 12, antall: 120 }, { ansatt_id: "a1", art: "ferie", tripletex_id: 13, antall: 3 }],
    );
    expect(p.nye.map((x) => `${x.ansatt_id}:${x.art}`)).toEqual(["a2:ot100"]);
    expect(p.endret).toEqual([{ ansatt_id: "a1", art: "ot50", kode: "1050", antall: 6, tripletex_id: 11 }]);
    expect(p.slett.map((x) => x.tripletex_id)).toEqual([13]);
  });
  it("lønnsart må ha nøyaktig samme nummer", () => {
    const typer = [{ id: 1, number: "10500" }, { id: 2, number: "1050" }];
    expect(finnLonnsart(typer, " 1050")).toBe(2);
    expect(finnLonnsart(typer, "105")).toBeNull();
  });
});
