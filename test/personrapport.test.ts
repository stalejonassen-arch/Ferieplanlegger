import { describe, expect, it } from "vitest";
import { lagInnhold, rapportType } from "../src/lib/personrapport";
import type { Ansatt } from "../src/lib/ferie";
import type { Time } from "../src/lib/timer";

const a = (id: string, x: Partial<Ansatt> = {}) => ({ id, navn: id, epost: null, avdeling_id: 1, rolle: "ansatt", aktiv: true, ...x }) as Ansatt;
const t = (ansatt: string, dato: string, timer: number, prosjekt: string | null, fakturerbar = true) =>
  ({ id: Math.random().toString(), ansatt_id: ansatt, prosjekt_id: prosjekt, dato, fra: "07:00", til: "15:00", lunsj_min: 0, timer, lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: "", status: "levert", fakturerbar }) as Time;

describe("personlig månedsrapport", () => {
  const ansatte = [a("mads"), a("jim"), a("harald", { prosjektleder: true }), a("kari", { i_timerapport: false })];
  it("velger del ut fra rollen", () => {
    expect(rapportType(ansatte[0]!)).toEqual({ timer: true, dg: false });
    expect(rapportType(ansatte[2]!)).toEqual({ timer: false, dg: true });
    expect(rapportType(ansatte[3]!)).toEqual({ timer: false, dg: false });
  });
  it("timer på kunde mot interntid, med forrige måned, hittil i år og snitt", () => {
    const timer = [t("mads", "2026-09-02", 30, "p"), t("mads", "2026-09-03", 10, null), t("mads", "2026-08-03", 10, null), t("mads", "2026-08-04", 10, "p"),
      t("jim", "2026-09-02", 20, "p"), t("jim", "2026-09-03", 20, null)];
    const i = lagInnhold(ansatte[0]!, { timer, ansatte }, "2026-09-01");
    expect(i.timer).toMatchObject({ kunde: 30, intern: 10, sum: 40, andelIntern: 25, forrige: { sum: 20, andelIntern: 50 }, hittil: { sum: 60, andelIntern: 33.3 }, snittAndelIntern: 37.5 });
    expect(i.dg).toBeUndefined();
  });
  it("DG for prosjektleder: måned, forrige, hittil i år og i fjor", () => {
    const salgKategorier = [
      { aar: 2026, mnd: 9, kategori: "tak", omsetning: 1000, db: 300, linjer: 1 }, { aar: 2026, mnd: 8, kategori: "tak", omsetning: 1000, db: 100, linjer: 1 },
      { aar: 2025, mnd: 9, kategori: "tak", omsetning: 500, db: 50, linjer: 1 }, { aar: 2026, mnd: 9, kategori: "vinduer", omsetning: 2000, db: 400, linjer: 1 },
    ];
    const i = lagInnhold(ansatte[2]!, { timer: [], ansatte, salgKategorier, dgKategorier: [{ id: "vinduer", navn: "Vinduer" }, { id: "tak", navn: "Takplater" }] }, "2026-09-01");
    expect(i.timer).toBeUndefined();
    expect(i.dg![1]).toMatchObject({ id: "tak", mnd: { dg: 30 }, forrige: { dg: 10 }, hittil: { omsetning: 2000, dg: 20 }, ifjor: { dg: 10 } });
    expect(i.dg![0]!.mnd.dg).toBe(20);
  });
});
