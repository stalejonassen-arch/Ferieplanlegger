import { describe, expect, it } from "vitest";
import { dg, kategoriFor, sumKategori, type DgKategori } from "../src/lib/dg";

const R: DgKategori[] = [
  { id: "vinduer", navn: "Vinduer", med: ["vindu", "nordan", "natre", "h-karmen", "takv mh", "skyvedør"], uten: ["base", "kitt", "pensel", "holder", "vindusvr", "vrider", "deponer", "maling", "frakt", "beslag", "lås", "sålbenk", "rullesett"] },
  { id: "tak", navn: "Takplater", med: ["takpl", "takplate", "takpakke", "powertekk", "takpanne", "takshingel", "takstein", "plannja", "tata steel", "tata click", "tata takpl", "decra", "ruukki", "falstak", "click fals"], uten: ["glava", "flexi", "takrenne", "taklist", "undertak", "takstol", "sponpl", "takv", "spiker", "skrue", "huntonit", "trefib", "kraning"] },
];

describe("DG per kategori", () => {
  it("sorterer ekte linjer fra Visma etter teksten", () => {
    const v = ["Nordan Dør og vindupakke ordre N", "H-VINDUET+ 90", "H-KARMEN+ 90", "Skifte vindu", "TAKV MH 94X160 VEDLFRI 3 LAG", "Natre 2 ramsvinduer ordre 239475"];
    for (const t of v) expect(kategoriFor(t, R), t).toBe("vinduer");
    const tak = ["Powertekk tak grå Struktur", "TAKPL 20R1000 0,6MM HPS200 S", "Tata Steel Takpakke", "TATA CLICK FALS TAKPAKKE", "TAKPANNE KULLSORT CLASSIC DE", "TAKPLATER Tata", "TAKSHINGEL KATEPAL CLASSIC K", "TAKPL POWERTEKK RUSTIKK-RØD"];
    for (const t of tak) expect(kategoriFor(t, R), t).toBe("tak");
    const ingen = ["DØR OG VINDU BASE HVIT 2.7L", "VINDUSKITT CASCO WINDOWSEAL 290", "PENSEL VINDU 15MM", "Deponering av gml vindu", "FLEXI A-PLATE 198X575X1200", "GLAVA PROFF 34 PLATE 100X570", "TAKRENNE 120MM LGD 5M SORT", "UNDERTAK BASIC 1,50X50M", "Diverse", "Frakt frå dør/vindusfabrikk", "LÅSER DØR/VINDU DIVERSE TV SPS", "TAKPLATESPIKER SORT 4,0-95 RIL", "HUNTONIT TREFIB TAKPLATE ANTIK", "Kraning Takplater"];
    for (const t of ingen) expect(kategoriFor(t, R), t).toBeNull();
  });
  it("regner DG og summerer måneder", () => {
    expect(dg(1000, 250)).toBe(25);
    expect(dg(0, 0)).toBeNull();
    const rader = [{ aar: 2026, mnd: 8, kategori: "tak", omsetning: 1000, db: 200, linjer: 2 }, { aar: 2026, mnd: 9, kategori: "tak", omsetning: 3000, db: 900, linjer: 3 }, { aar: 2026, mnd: 9, kategori: "vinduer", omsetning: 5, db: 5, linjer: 1 }];
    expect(sumKategori(rader, "tak", { aar: 2026, mnd: 1 }, { aar: 2026, mnd: 9 })).toEqual({ omsetning: 4000, db: 1100, dg: 27.5, linjer: 5 });
    expect(sumKategori(rader, "tak", { aar: 2026, mnd: 9 }, { aar: 2026, mnd: 9 }).dg).toBe(30);
  });
});
