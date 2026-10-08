import { describe, it, expect } from "vitest";
import { lonnsdager, lonnTimer, varighet, ukenr, mandag, type Time } from "../src/lib/timer";
import type { Ansatt, Data } from "../src/lib/ferie";

const ans = (x: Partial<Ansatt> = {}): Ansatt =>
  ({ id: "a", navn: "A", epost: null, avdeling_id: 1, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge: 0, normaltid_uke: 37.5, ...x });
let n = 0;
const t = (dato: string, fra: string, til: string, lunsj = 30, x: Partial<Time> = {}): Time =>
  ({ id: `t${n++}`, ansatt_id: "a", prosjekt_id: null, dato, fra, til, lunsj_min: lunsj, timer: varighet(fra, til, lunsj), lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: "", status: "levert", ...x });
const uke = (fra: string, til: string, lunsj = 30) => ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05"].map((d) => t(d, fra, til, lunsj));
const sum = (xs: { normal: number; ot50: number; ot100: number }[]) =>
  xs.reduce((s, x) => ({ normal: s.normal + x.normal, ot50: s.ot50 + x.ot50, ot100: s.ot100 + x.ot100 }), { normal: 0, ot50: 0, ot100: 0 });

describe("timer og lønnsgrunnlag", () => {
  it("regner arbeidstid og uker", () => {
    expect(varighet("07:00", "15:00", 30)).toBe(7.5);
    expect(mandag("2027-03-07")).toBe("2027-03-01");
    expect(ukenr("2027-01-04")).toBe(1);
    expect(ukenr("2026-12-31")).toBe(53);
  });
  it("overtid først når uka går over normaltiden, ikke per dag", () => {
    const a = ans();
    // 9 t man, 6 t tir–fre = 33 t: ingen overtid selv om mandag er lang
    const tim = [t("2027-03-01", "07:00", "16:30"), ...["02", "03", "04", "05"].map((d) => t(`2027-03-${d}`, "07:00", "13:30"))];
    expect(sum(lonnsdager(a, tim, "2027-03-01", "2027-03-07"))).toEqual({ normal: 33, ot50: 0, ot100: 0 });
    // 5 × 8,5 t = 42,5 t: 5 t overtid 50 %
    expect(sum(lonnsdager(a, uke("07:00", "16:00"), "2027-03-01", "2027-03-07"))).toEqual({ normal: 37.5, ot50: 5, ot100: 0 });
    // Samme uke for en med 40-timers uke: 2,5 t overtid
    expect(sum(lonnsdager(ans({ normaltid_uke: 40 }), uke("07:00", "16:00"), "2027-03-01", "2027-03-07")).ot50).toBe(2.5);
  });
  it("søndag og helligdag gir 100 %", () => {
    const tim = [t("2027-03-07", "08:00", "12:00", 0), t("2027-05-17", "08:00", "12:00", 0)];
    expect(sum(lonnsdager(ans(), tim, "2027-03-01", "2027-05-31"))).toEqual({ normal: 0, ot50: 0, ot100: 8 });
  });
  it("overtid i en uke over månedsskiftet havner på riktig dag", () => {
    // Uke 39 2027: man 27. sept – fre 1. okt. 9 t per dag = 45 t; overtiden kommer på slutten av uka (oktober)
    const tim = ["2027-09-27", "2027-09-28", "2027-09-29", "2027-09-30", "2027-10-01"].map((d) => t(d, "07:00", "16:30"));
    expect(sum(lonnsdager(ans(), tim, "2027-09-01", "2027-09-30"))).toEqual({ normal: 36, ot50: 0, ot100: 0 });
    expect(sum(lonnsdager(ans(), tim, "2027-10-01", "2027-10-31"))).toEqual({ normal: 1.5, ot50: 7.5, ot100: 0 });
  });
  it("2. påskedag gir 100 %", () => {
    expect(sum(lonnsdager(ans(), [t("2027-03-29", "07:00", "16:30")], "2027-03-01", "2027-03-31"))).toEqual({ normal: 0, ot50: 0, ot100: 9 });
  });
  it("trekker lunsj når den mangler, med mindre leder har godkjent unntak", () => {
    const a = ans({ lunsjtrekk: true, lunsj_min: 30 });
    const tim = [t("2027-03-01", "07:00", "15:30", 0), t("2027-03-02", "07:00", "15:30", 30), t("2027-03-03", "07:00", "12:00", 0), t("2027-03-04", "07:00", "15:30", 0, { lunsj_unntak: true })];
    const d = { timer: tim } as Data;
    const r = lonnTimer(d, a, "2027-03-01", "2027-03-07");
    expect(r.avvik).toEqual(["2027-03-01"]);       // 3. mars er kortere enn 5,5 t, 4. mars er godkjent
    expect(r.lunsjtrekk).toBe(0.5);
    expect(r.normal).toBe(8 + 8 + 5 + 8.5);
    // uten lunsjtrekk-avtale trekkes ingenting
    expect(lonnTimer(d, ans(), "2027-03-01", "2027-03-07").lunsjtrekk).toBe(0);
  });
});
