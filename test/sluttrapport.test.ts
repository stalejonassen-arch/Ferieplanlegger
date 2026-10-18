import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { brytLinjer, lagSluttrapport, type RapportData } from "../src/lib/sluttrapport";
import { rapportFilnavn } from "../src/lib/boligmappa";

const fonter = {
  R: new Uint8Array(readFileSync("public/fonter/Barlow-Regular.ttf")),
  B: new Uint8Array(readFileSync("public/fonter/Barlow-SemiBold.ttf")),
  T: new Uint8Array(readFileSync("public/fonter/BarlowCondensed-ExtraBoldItalic.ttf")),
};
// 2x2 piksler PNG
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAWAgMBY8kD4AAAAABJRU5ErkJggg==", "base64"));

async function vedleggPdf(sider: number) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < sider; i++) d.addPage([595, 842]).drawText(`FDV side ${i + 1}`, { x: 50, y: 780, size: 20, font: f });
  return d.save();
}

const data = (x: Partial<RapportData> = {}): RapportData => ({
  firma: { navn: "Demo Bygg AS", linje: "Tømrer · Rehabilitering · Tilbygg", adresse: "Eksempelvegen 1, 6005 Ålesund", orgnr: "", tlf: "" },
  tittel: "Tilbygg og nytt bad, Myrvang", prosjektnr: "10879", kunde: "Merete Hansen", adresse: "Keiser Wilhelms gate 22, 6003 Ålesund",
  matrikkel: "1508 Ålesund, gnr. 12 / bnr. 34", fag: "Tømrer", utfort: "2. september – 14. oktober 2026", timer: "312,5 timer",
  utarbeidetAv: "Lars Berg", dato: "15. oktober 2026", innledning: "Takk for oppdraget! Her er en oppsummering av arbeidet vi har utført.",
  dagbok: Array.from({ length: 30 }, (_, i) => ({ dato: `${i + 1}. september 2026`, tekst: `Dag ${i + 1}: Riving av gammelt bad, membran og flis. Piotr Kowalski og Łukasz Wiśniewski jobbet med lekter og gips – æøå ÆØÅ.` })),
  tillegg: [{ tittel: "Ekstra stikkontakt på badet", beskrivelse: "Kunden ønsket en ekstra kontakt ved speilet.", detaljer: "1,5 timer · Kontakt og kabel", godkjent: "Godkjent av Merete Hansen, 20. september 2026", signatur: `data:image/png;base64,${Buffer.from(png).toString("base64")}` }],
  bilder: [{ data: png, tekst: "Før riving · 2. september 2026" }, { data: png, tekst: "Ferdig bad" }, { data: png }],
  varer: [{ navn: "Gipsplate standard 12,5 mm 1200x2400", nobb: "41234567", antall: "24 stk", lenke: "https://nobb.no/item/41234567" }],
  vedlegg: [],
  egenkontroll: [{ navn: "Våtrom – membran og sluk", signert: "Signert av Lars Berg, 10. oktober 2026", punkter: [
    { tekst: "Underlaget er rent, tørt og plant før membran", svar: "ok" },
    { tekst: "Membranen er påført i riktig tykkelse (målt)", svar: "avvik", kommentar: "0,8 mm målt – smurt et ekstra strøk, 1,1 mm etterpå" },
    { tekst: "Branntetting", svar: "na" },
  ] }],
  boligmappa: true,
  ...x,
});

describe("sluttrapport (PDF)", () => {
  it("bryter lange linjer og lange ord", () => {
    const f = { widthOfTextAtSize: (t: string) => t.length };
    expect(brytLinjer("en to tre fire", f, 1, 7)).toEqual(["en to", "tre", "fire"]);
    expect(brytLinjer("abcdefghij", f, 1, 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(brytLinjer("a\n\nb", f, 1, 10)).toEqual(["a", "", "b"]);
  });
  it("filnavn bruker adressen og datoen og er trygt som filnavn", () => {
    expect(rapportFilnavn("Storgata 1/B, 6005 Ålesund", "Bad", "2026-10-15")).toBe("Sluttdokumentasjon - Storgata 1 B - 2026-10-15.pdf");
    expect(rapportFilnavn(undefined, "Bad hos Hansen", "2026-10-15")).toBe("Sluttdokumentasjon - Bad hos Hansen - 2026-10-15.pdf");
  });
  it("lager en gyldig PDF med polske tegn, flere sider og vedlegg bakerst", async () => {
    const pdf = await lagSluttrapport(data({ vedlegg: [{ navn: "FDV Gips", data: await vedleggPdf(3) }, { navn: "Sjekkliste våtrom", data: png }, { navn: "Ødelagt", data: new Uint8Array([1, 2, 3]) }] }), fonter);
    const d = await PDFDocument.load(pdf);
    expect(d.getTitle()).toBe("Sluttdokumentasjon – Tilbygg og nytt bad, Myrvang");
    expect(d.getAuthor()).toBe("Demo Bygg AS");
    const n = d.getPageCount();
    expect(n).toBeGreaterThanOrEqual(3 + 3 + 1);
    if (process.env.SLUTTRAPPORT_UT) writeFileSync(process.env.SLUTTRAPPORT_UT, pdf);
  });
  it("virker uten bilder, dagbok og vedlegg", async () => {
    const pdf = await lagSluttrapport(data({ dagbok: [], bilder: [], tillegg: [], varer: [], innledning: undefined, kunde: undefined, matrikkel: undefined }), fonter);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
  });
});
