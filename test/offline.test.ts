import { describe, expect, it } from "vitest";
import { anvendKo, erNettfeil, koTekst, type KoOp } from "../src/lib/offline";
import type { Data } from "../src/lib/ferie";

const tom = { ansatte: [], stempling: [], timer: [] } as unknown as Data;
const lokal = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const idag = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

describe("uten nett", () => {
  it("kjenner igjen nettfeil, ikke feil fra serveren", () => {
    expect(erNettfeil(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(erNettfeil(new Error("Load failed"))).toBe(true);
    expect(erNettfeil(new Error("Du er allerede logget inn."))).toBe(false);
  });
  it("viser køet inn- og utstempling som stempling og timer med en gang", () => {
    const ko: KoOp[] = [
      { id: "1", type: "stemple", tid: lokal(7, 2), handling: "inn", prosjekt: "p", beskrivelse: "", lunsj: 0 },
      { id: "2", type: "stemple", tid: lokal(11, 31), handling: "bytt", prosjekt: "q", beskrivelse: "Riving", lunsj: 0 },
    ];
    const d = anvendKo(tom, ko, "meg");
    expect(d.stempling).toEqual([expect.objectContaining({ ansatt_id: "meg", prosjekt_id: "q", fra: "11:30", dato: idag })]);
    expect(d.timer).toEqual([expect.objectContaining({ prosjekt_id: "p", fra: "07:00", til: "11:30", timer: 4.5, beskrivelse: "Riving" })]);
    const ut = anvendKo(tom, [...ko, { id: "3", type: "stemple", tid: lokal(15, 29), handling: "ut", prosjekt: null, beskrivelse: "", lunsj: 30 }], "meg");
    expect(ut.stempling).toHaveLength(0);
    expect(ut.timer[1]).toMatchObject({ prosjekt_id: "q", fra: "11:30", til: "15:30", timer: 3.5 });
    expect(koTekst(ko)).toBe("2 stemplinger");
  });
});
