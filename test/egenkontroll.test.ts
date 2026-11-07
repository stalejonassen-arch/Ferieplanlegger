import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { BIBLIOTEK, egenkontrollTall, forsinket, malTilTekst, nyePunkter, tekstTilMal, type Sjekkliste } from "../src/lib/kvalitet";
import { lagEgenkontrollRapport, type EgenkontrollData } from "../src/lib/egenkontrollRapport";

const fonter = {
  R: new Uint8Array(readFileSync("public/fonter/Barlow-Regular.ttf")),
  B: new Uint8Array(readFileSync("public/fonter/Barlow-SemiBold.ttf")),
};

const liste = (x: Partial<Sjekkliste>): Sjekkliste => ({ id: "s", prosjekt_id: "p", navn: "L", mal: "", punkter: [], status: "pagaar", opprettet_av: null,
  opprettet: "2026-11-01T08:00:00Z", endret: "2026-11-01T08:00:00Z", signert_av: null, signert_tid: null, ...x });

describe("egenkontroll", () => {
  it("maltekst: seksjoner og målinger fram og tilbake", () => {
    const tekst = "# Før start\nTegninger gjennomgått\n# Utførelse\nSenteravstand stendere [mm]\n\n  Lodd  ";
    const m = tekstTilMal(tekst);
    expect(m).toEqual([
      { tekst: "Tegninger gjennomgått", seksjon: "Før start" },
      { tekst: "Senteravstand stendere", maal: "mm", seksjon: "Utførelse" },
      { tekst: "Lodd", seksjon: "Utførelse" },
    ]);
    expect(tekstTilMal(malTilTekst(m))).toEqual(m);
    expect(nyePunkter(m)[1]).toEqual({ tekst: "Senteravstand stendere", seksjon: "Utførelse", maal: "mm", verdi: "", svar: null, kommentar: "" });
  });
  it("biblioteket har unike id-er, tømrermaler og målepunkter", () => {
    expect(new Set(BIBLIOTEK.map((m) => m.id)).size).toBe(BIBLIOTEK.length);
    expect(BIBLIOTEK.some((m) => m.id === "mottak")).toBe(true);
    expect(BIBLIOTEK.filter((m) => m.kategori === "Tømrer").length).toBeGreaterThanOrEqual(6);
    expect(BIBLIOTEK.find((m) => m.id === "reisverk")!.punkter.find((p) => p.maal === "mm")!.tekst).toBe("Senteravstand stendere");
  });
  it("tall for prosjektet: status, frist og åpne avvik", () => {
    const l = [
      liste({ id: "a", status: "planlagt", frist: "2026-11-01" }),
      liste({ id: "b", status: "pagaar", frist: "2026-12-01" }),
      liste({ id: "c", status: "signert", frist: "2026-10-01" }),
      liste({ id: "d", status: "signert", godkjent_av: "x" }),
    ];
    expect(forsinket(l[0]!, "2026-11-07")).toBe(true);
    expect(forsinket(l[2]!, "2026-11-07")).toBe(false);
    const t = egenkontrollTall(l, [{ sjekkliste_id: "c", status: "apen" }, { sjekkliste_id: "d", status: "lukket" }, { sjekkliste_id: "annen", status: "apen" }], "2026-11-07");
    expect(t).toEqual({ totalt: 4, planlagt: 1, pagaar: 1, signert: 1, godkjent: 1, forsinket: 1, aapneAvvik: 1 });
  });
  it("lager PDF med kontrollplan, avvik og sjekklister", async () => {
    const data: EgenkontrollData = {
      firma: "Testfirma AS", prosjekt: "1234 · Nytt tak", adresse: "Vegen 1", kunde: "Kari", utarbeidetAv: "Ståle", dato: "7. november 2026",
      plan: [{ navn: "Takkonstruksjon og undertak", dok: "EK-04 rev. 2", ansvarlig: "Mats", frist: "1. desember 2026", status: "Godkjent" }],
      avvik: [{ tittel: "Egenkontroll – Tak: Lufting", status: "Lukket", tiltak: "Lagt inn lufteåpning", lukket: "Lukket av Ståle, 6. november 2026" }],
      lister: [{ navn: "Takkonstruksjon og undertak", dok: "EK-04 rev. 2", signert: "Signert av Mats", godkjent: "Kontrollert og godkjent av Harald",
        punkter: Array.from({ length: 60 }, (_, i) => ({ seksjon: i < 30 ? "Bæresystem" : "Undertak", tekst: `Punkt ${i} med en ganske lang tekst som må brytes over flere linjer i rapporten`, svar: "OK", svarType: "ok" as const, maaling: i % 5 ? undefined : "Målt: 600 mm", utfort: "Mats 4. november 2026" })) }],
    };
    const pdf = await lagEgenkontrollRapport(data, fonter);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("Egenkontroll – 1234 · Nytt tak");
  });
});
