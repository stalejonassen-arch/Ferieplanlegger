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
