import { describe, it, expect } from "vitest";
import { fakturertVismaPerMnd, ikkeFakturert, perKunde, type FakturertTime } from "../src/lib/faktura";
import type { Data } from "../src/lib/ferie";

const f = (o: Partial<FakturertTime>): FakturertTime => ({ visma_ordrenr: 1, linjenr: 1, ordredato: null, fakturadato: null, fakturanr: "", kunde_id: "k1", prosjekt_id: null, antall: 0, fakturert: 0, ikke_fakturert: 0, pris: 700, ...o });
const linjer = [
  f({ fakturadato: "2026-03-10", fakturert: 20 }),
  f({ fakturadato: "2026-03-28", fakturert: 7.5, kunde_id: "k2" }),
  f({ fakturadato: "2025-12-01", fakturert: 99 }),
  f({ fakturadato: "2026-04-02", fakturert: -4 }), // kreditnota
  f({ ikke_fakturert: 12 }),
];

describe("fakturerte timer", () => {
  it("summerer per måned etter fakturadato, med kreditnota", () => {
    const m = fakturertVismaPerMnd(linjer, 2026);
    expect(m[2]).toBe(27.5);
    expect(m[3]).toBe(-4);
    expect(m.reduce((a, b) => a + b, 0)).toBe(23.5);
    expect(ikkeFakturert(linjer)).toBe(12);
  });
  it("per kunde: registrert mot fakturert og åpent", () => {
    const d = {
      kunder: [{ id: "k1", navn: "Siri" }, { id: "k2", navn: "Kyrre" }], prosjekter: [{ id: "p1", kunde_id: "k1" }],
      timer: [{ prosjekt_id: "p1", dato: "2026-03-02", timer: 40, fakturerbar: true }, { prosjekt_id: "p1", dato: "2026-03-03", timer: 8, fakturerbar: false }],
      fakturerteTimer: linjer,
    } as unknown as Data;
    expect(perKunde(d, 2026).map((k) => [k.navn, k.registrert, k.fakturert, k.aapent])).toEqual([["Siri", 40, 16, 12], ["Kyrre", 0, 7.5, 0]]);
  });
});

describe("fastpris", () => {
  it("holder fastprisprosjekter utenfor registrert og fakturert", async () => {
    const { perKunde, registrertUtenFastpris } = await import("../src/lib/faktura");
    const d = {
      kunder: [{ id: "k1", navn: "Siri" }], prosjekter: [{ id: "p1", kunde_id: "k1", fastpris: true }, { id: "p2", kunde_id: "k1" }],
      timer: [{ prosjekt_id: "p1", dato: "2026-03-02", timer: 100 }, { prosjekt_id: "p2", dato: "2026-03-02", timer: 10 }],
      fakturerteTimer: [f({ prosjekt_id: "p1", fakturadato: "2026-03-05", fakturert: 5 }), f({ fakturadato: "2026-03-05", fakturert: 8 })],
    } as unknown as Data;
    expect(registrertUtenFastpris(d, 2026)).toEqual({ vanlig: 10, fastpris: 100 });
    expect(perKunde(d, 2026).map((k) => [k.registrert, k.fakturert])).toEqual([[10, 8]]);
  });
});

describe("fastprisberegning", () => {
  it("arbeid = fakturert kunde − materialkost på egne ordrer − Arbeid alt telt, delt på timepris", async () => {
    const { fastprisBeregning } = await import("../src/lib/faktura");
    const o = (x: object) => ({ prosjekt_id: "p1", transaksjonstype: 1, ordretype: 1, fakturert: 0, kostnad: 0, ordredato: "2026-03-01", ferdig: null, kunde_nr: 2, ...x });
    const d = {
      kunder: [], prosjekter: [{ id: "p1", navn: "Siri", fastpris: true }], timer: [{ prosjekt_id: "p1", dato: "2026-03-02", timer: 900 }],
      egetKundenr: 1, timepris: 800,
      ordrer: [o({ fakturert: 600000, ordredato: "2026-03-10" }), o({ fakturert: 200000, ordredato: "2026-05-10" }), o({ kunde_nr: 1, kostnad: 150000 }), o({ ordretype: 5, fakturert: 999999 }), o({ fakturert: 50000, ordredato: "2025-11-01" })],
      fakturerteTimer: [f({ prosjekt_id: "p1", fakturadato: "2026-03-05", fakturert: 10, pris: 800 })],
    } as unknown as Data;
    const r = fastprisBeregning(d, 2026);
    // 800 000 − 150 000 − 8 000 = 642 000 kr → 802,5 t, fordelt 3:1 på mars og mai
    expect([r.prosjekter[0].salg, r.prosjekter[0].material, r.prosjekter[0].arbeidKr, r.timer]).toEqual([800000, 150000, 642000, 802.5]);
    expect([r.perMnd[2], r.perMnd[4]]).toEqual([601.9, 200.6]);
  });
});
