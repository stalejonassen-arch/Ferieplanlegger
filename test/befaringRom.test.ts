import { describe, expect, it } from "vitest";
import { flettKiRom, lesAapning, lesMaal, mengdeTekst, nyttRom, rensRom, romMaalTekst, romMengder, romSkisse, sumMengder } from "../src/lib/befaringRom";
import { tilbudFraBefaring, type Befaring } from "../src/lib/befaring";

describe("befaring rom for rom", () => {
  it("leser mål slik håndverkere skriver dem", () => {
    expect(lesMaal("4,2")).toBe(4.2);
    expect(lesMaal("4.2 m")).toBe(4.2);
    expect(lesMaal("420 cm")).toBe(4.2);
    expect(lesMaal("420")).toBe(4.2);
    expect(lesMaal("4200 mm")).toBe(4.2);
    expect(lesMaal("4200")).toBe(4.2);
    expect(lesMaal("2,4")).toBe(2.4);
    expect(lesMaal("x")).toBeNull();
    expect(lesMaal("")).toBeNull();
    expect(lesAapning("120x140")).toEqual({ b: 1.2, h: 1.4 });
    expect(lesAapning("0,9 × 2,1")).toEqual({ b: 0.9, h: 2.1 });
    expect(lesAapning("90 ganger 210")).toEqual({ b: 0.9, h: 2.1 });
    expect(lesAapning("90")).toBeNull();
  });

  it("regner mengder: gulv, list minus dører, vegg minus åpninger, listverk", () => {
    const r = { ...nyttRom("Stue"), lengde: 5, bredde: 4, hoyde: 2.4, dorer: [{ antall: 1, b: 0.9, h: 2.1 }], vinduer: [{ antall: 2, b: 1.2, h: 1.4 }] };
    const m = romMengder(r);
    expect(m.gulv).toBe(20);
    expect(m.tak).toBe(20);
    expect(m.omkrets).toBe(18);
    expect(m.list).toBe(17.1);
    expect(m.veggBrutto).toBe(43.2);
    // 43,2 − 0,9·2,1 − 2·1,2·1,4 = 43,2 − 1,89 − 3,36
    expect(m.veggNetto).toBe(37.95);
    expect(m.dorer).toBe(1);
    expect(m.vinduer).toBe(2);
    // dør: 2·2,1 + 0,9 = 5,1; vinduer: 2 · 2·(1,2+1,4) = 10,4
    expect(m.listverk).toBe(15.5);
    expect(romMaalTekst(r)).toBe("5 × 4 m, takhøyde 2,4 m · 1 dør 90×210 · 2 vinduer 120×140");
    // Uten takhøyde: ingen veggflate, men gulv og list
    const uten = romMengder({ ...r, hoyde: null });
    expect(uten.veggNetto).toBe(0);
    expect(uten.gulv).toBe(20);
  });

  it("summerer rom og lager mengdetekst til tilbudet", () => {
    const a = { ...nyttRom("Stue"), lengde: 5, bredde: 4 };
    const b = { ...nyttRom("Gang"), lengde: 3, bredde: 1.5, dorer: [{ antall: 2, b: 0.9, h: 2.1 }] };
    const s = sumMengder([a, b]);
    expect(s.gulv).toBe(24.5);
    expect(s.list).toBe(18 + 9 - 1.8);
    const t = mengdeTekst([a, b, nyttRom("Tomt rom")]);
    expect(t).toContain("Stue: 5 × 4 m – gulv 20 m², gulvlist 18 lm");
    expect(t).toContain("Gang: 3 × 1,5 m · 2 dører 90×210");
    expect(t).toContain("Totalt: Gulv 24,5 m²");
    expect(t).not.toContain("Tomt rom");
    const bef = { notat: "Nytt gulv", punkter: [], rom: [a, b], dato: "2026-11-20" } as unknown as Befaring;
    const beskr = tilbudFraBefaring(bef);
    expect(beskr.indexOf("Rom og mål")).toBeGreaterThan(beskr.indexOf("Nytt gulv"));
    expect(beskr).toContain("Fra befaring 20.11.2026.");
  });

  it("fletter KI-rom: fyller bare tomme felt, legger til nye, gjetter ikke", () => {
    const stue = { ...nyttRom("Stue"), lengde: 5 };
    const { rom, endret } = flettKiRom([stue], [
      { navn: "stue", lengde: 6, bredde: 4, hoyde: 2.4, vinduer: [{ antall: 2, bredde: 120, hoyde: 140 }], notat: "Nytt parkett" },
      { navn: "Bad", lengde: 2.5, bredde: 2, dorer: [{}] },
      { navn: "" },
    ]);
    expect(endret).toBe(2);
    expect(rom[0].lengde).toBe(5); // skrevet inn av håndverkeren – står
    expect(rom[0].bredde).toBe(4);
    expect(rom[0].vinduer).toEqual([{ antall: 2, b: 1.2, h: 1.4 }]);
    expect(rom[0].notat).toBe("Nytt parkett");
    expect(rom[1].navn).toBe("Bad");
    expect(rom[1].dorer).toEqual([{ antall: 1, b: 0.9, h: 2.1 }]);
    expect(rom[1].hoyde).toBeNull();
    // Samme på nytt endrer ingenting
    expect(flettKiRom(rom, [{ navn: "Stue", notat: "Nytt parkett" }]).endret).toBe(0);
  });

  it("rensker før lagring og tegner skisse i riktig forhold", () => {
    const r = rensRom([{ ...nyttRom("  Stue "), lengde: 5.004, bredde: -1, dorer: [{ antall: 0, b: 1, h: 2 }, { antall: 1, b: 0.9, h: 2.1 }] }, nyttRom("  ")]);
    expect(r).toHaveLength(1);
    expect(r[0].navn).toBe("Stue");
    expect(r[0].lengde).toBe(5);
    expect(r[0].bredde).toBeNull();
    expect(r[0].dorer).toEqual([{ antall: 1, b: 0.9, h: 2.1 }]);
    expect(romSkisse(r[0], 200, 100)).toBeNull();
    const s = romSkisse({ ...nyttRom("Stue"), lengde: 6, bredde: 3, dorer: [{ antall: 1, b: 0.9, h: 2.1 }], vinduer: [{ antall: 2, b: 1.2, h: 1.2 }] }, 200, 200)!;
    expect(s.w).toBeCloseTo(200);
    expect(s.h).toBeCloseTo(100);
    expect(s.dorer).toHaveLength(1);
    expect(s.vinduer).toHaveLength(2);
    expect(s.vinduer[1].x).toBeGreaterThan(s.vinduer[0].x + s.vinduer[0].w);
  });
});
