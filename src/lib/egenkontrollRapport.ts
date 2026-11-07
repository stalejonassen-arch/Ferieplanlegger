// Egenkontroll-rapport (PDF) for ett prosjekt: kontrollplan, avvik fra egenkontrollen og hver sjekkliste
// med svar, målinger, hvem som utførte og signerte, og kontroll av faglig leder.
// Dokumentasjon av egenkontroll etter byggesaksforskriften (sentral godkjenning / tilsyn).
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Data } from "./ferie";
import { langDato } from "./ferie";
import { AVVIK_STATUS } from "./hms";
import { KONTROLL_STATUS, SVAR, kontrollStatus, type Svar } from "./kvalitet";
import { PROFIL } from "./profil";
import { brytLinjer } from "./sluttrapport";
import type { Prosjekt } from "./timer";

export interface EgenkontrollData {
  firma: string;
  prosjekt: string;
  adresse?: string;
  kunde?: string;
  utarbeidetAv: string;
  dato: string;
  plan: { navn: string; dok: string; ansvarlig: string; frist: string; status: string }[];
  avvik: { tittel: string; status: string; tiltak: string; lukket: string }[];
  lister: {
    navn: string; dok: string; signert: string; godkjent: string;
    punkter: { seksjon?: string; tekst: string; svar: string; svarType?: Svar | null; maaling?: string; kommentar?: string; utfort?: string; avvik?: string }[];
  }[];
}

const dato = (t?: string | null) => (t ? langDato(t.slice(0, 10)) : "");

/** Samler det som skal i rapporten fra appens data */
export function egenkontrollData(d: Data, p: Prosjekt, utarbeidetAv: string, idag: string): EgenkontrollData {
  const navn = (id?: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const k = d.kunder.find((x) => x.id === p.kunde_id);
  const lister = (d.sjekklister ?? []).filter((s) => s.prosjekt_id === p.id)
    .sort((a, b) => (a.frist ?? "9999").localeCompare(b.frist ?? "9999") || a.opprettet.localeCompare(b.opprettet));
  const ider = new Set(lister.map((s) => s.id));
  return {
    firma: PROFIL.firma,
    prosjekt: `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}`,
    adresse: p.adresse || undefined,
    kunde: k?.navn || undefined,
    utarbeidetAv, dato: langDato(idag),
    plan: lister.map((s) => ({
      navn: s.navn, dok: s.dok_nr ? `${s.dok_nr}${s.revisjon ? ` rev. ${s.revisjon}` : ""}` : "",
      ansvarlig: navn(s.ansvarlig_id ?? s.opprettet_av), frist: s.frist ? langDato(s.frist) : "", status: KONTROLL_STATUS[kontrollStatus(s)],
    })),
    avvik: d.avvik.filter((a) => a.sjekkliste_id && ider.has(a.sjekkliste_id)).map((a) => ({
      tittel: a.tittel, status: AVVIK_STATUS[a.status], tiltak: a.tiltak,
      lukket: a.status === "lukket" ? `Lukket av ${navn(a.lukket_av)}${a.lukket_tid ? `, ${dato(a.lukket_tid)}` : ""}` : "",
    })),
    lister: lister.filter((s) => s.status !== "planlagt").map((s) => ({
      navn: s.navn, dok: s.dok_nr ? `${s.dok_nr}${s.revisjon ? ` rev. ${s.revisjon}` : ""}` : "",
      signert: s.signert_av ? `Signert av ${navn(s.signert_av)}${s.signert_tid ? `, ${dato(s.signert_tid)}` : ""}` : "Ikke signert",
      godkjent: s.godkjent_av ? `Kontrollert og godkjent av ${navn(s.godkjent_av)}${s.godkjent_tid ? `, ${dato(s.godkjent_tid)}` : ""}` : "Ikke kontrollert av faglig leder",
      punkter: s.punkter.map((x) => {
        const a = x.avvik_id ? d.avvik.find((y) => y.id === x.avvik_id) : undefined;
        return {
          seksjon: x.seksjon, tekst: x.tekst, svar: x.svar ? SVAR[x.svar] : "Ikke besvart", svarType: x.svar ?? null,
          maaling: x.maal ? `Målt: ${(x.verdi ?? "").trim() || "–"} ${x.maal}` : undefined,
          kommentar: (x.kommentar ?? "").trim() || undefined,
          utfort: x.av ? `${navn(x.av)}${x.tid ? ` ${dato(x.tid)}` : ""}` : undefined,
          avvik: a ? `Avvik ${AVVIK_STATUS[a.status].toLowerCase()}${a.tiltak ? ` – tiltak: ${a.tiltak}` : ""}` : undefined,
        };
      }),
    })),
  };
}

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const B_ = A4.w - 2 * M;
const NAVY = rgb(0x0b / 255, 0x1f / 255, 0x5c / 255);
const TEKST = rgb(0x1b / 255, 0x22 / 255, 0x36 / 255);
const DEMPET = rgb(0x5a / 255, 0x62 / 255, 0x78 / 255);
const LINJE = rgb(0xd5 / 255, 0xda / 255, 0xe6 / 255);
const LYS = rgb(0xf3 / 255, 0xf5 / 255, 0xfa / 255);
const FARGE: Record<string, ReturnType<typeof rgb>> = { ok: rgb(0.12, 0.5, 0.25), avvik: rgb(0.75, 0.2, 0.15), na: DEMPET };

async function hentFont(sti: string) {
  const r = await fetch(sti);
  if (!r.ok) throw new Error(`Fant ikke skrifttypen ${sti}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function lagEgenkontrollRapport(d: EgenkontrollData, fonter?: { R: Uint8Array; B: Uint8Array }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [fR, fB] = fonter ? [fonter.R, fonter.B] : await Promise.all([hentFont("/fonter/Barlow-Regular.ttf"), hentFont("/fonter/Barlow-SemiBold.ttf")]);
  const R = await doc.embedFont(fR, { subset: true });
  const B = await doc.embedFont(fB, { subset: true });
  doc.setTitle(`Egenkontroll – ${d.prosjekt}`);
  doc.setAuthor(d.firma);
  doc.setCreator("ByggLogg");
  doc.setLanguage("nb-NO");

  let side: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const nySide = () => { side = doc.addPage([A4.w, A4.h]); y = A4.h - M; };
  const plass = (h: number) => { if (y - h < M + 20) nySide(); };
  const tekst = (t: string, x: number, str: number, f: PDFFont = R, farge = TEKST) => side.drawText(t, { x, y, size: str, font: f, color: farge });
  const avsnitt = (t: string, str = 10, f: PDFFont = R, farge = TEKST, inn = 0) => {
    for (const l of brytLinjer(t, f, str, B_ - inn)) { plass(str + 4); tekst(l, M + inn, str, f, farge); y -= str + 4; }
  };
  const overskrift = (t: string) => { plass(60); y -= 8; tekst(t, M, 15, B, NAVY); y -= 8; side.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: NAVY }); y -= 16; };

  // Hode
  side.drawRectangle({ x: 0, y: A4.h - 120, width: A4.w, height: 120, color: NAVY });
  side.drawText(d.firma, { x: M, y: A4.h - 44, size: 11, font: B, color: rgb(1, 0.8, 0) });
  side.drawText("Egenkontroll", { x: M, y: A4.h - 74, size: 26, font: B, color: rgb(1, 1, 1) });
  side.drawText(d.prosjekt, { x: M, y: A4.h - 98, size: 12, font: R, color: rgb(1, 1, 1) });
  y = A4.h - 150;
  const info: [string, string | undefined][] = [["Adresse", d.adresse], ["Kunde", d.kunde], ["Utarbeidet av", d.utarbeidetAv], ["Dato", d.dato]];
  for (const [k, v] of info) if (v) { tekst(k, M, 10, B, DEMPET); tekst(v, M + 100, 10); y -= 15; }
  y -= 4;
  avsnitt("Dokumentasjon av egenkontroll for arbeidet på prosjektet: kontrollplan, utførte kontroller med svar og målinger, avvik og hvordan de er lukket, og kontroll av faglig leder.", 9.5, R, DEMPET);

  // Kontrollplan
  overskrift("Kontrollplan");
  if (!d.plan.length) avsnitt("Ingen kontroller er registrert.", 10, R, DEMPET);
  else {
    const kx = [M, M + 200, M + 305, M + 390];
    side.drawRectangle({ x: M, y: y - 5, width: B_, height: 18, color: LYS });
    ["Kontroll", "Ansvarlig", "Frist", "Status"].forEach((t, n) => tekst(t, kx[n]! + 4, 9, B, DEMPET));
    y -= 20;
    for (const r of d.plan) {
      const linjer = brytLinjer(r.dok ? `${r.navn} (${r.dok})` : r.navn, R, 9.5, 192);
      const st = brytLinjer(r.status, R, 9.5, B_ - (kx[3]! - M) - 4);
      plass(Math.max(linjer.length, st.length) * 12 + 8);
      linjer.forEach((l, n) => side.drawText(l, { x: kx[0]! + 4, y: y - n * 12, size: 9.5, font: R, color: TEKST }));
      side.drawText(brytLinjer(r.ansvarlig || "–", R, 9.5, 105)[0]!, { x: kx[1]! + 4, y, size: 9.5, font: R, color: TEKST });
      side.drawText(r.frist || "–", { x: kx[2]! + 4, y, size: 9.5, font: R, color: TEKST });
      st.forEach((l, n) => side.drawText(l, { x: kx[3]! + 4, y: y - n * 12, size: 9.5, font: R, color: TEKST }));
      y -= Math.max(linjer.length, st.length) * 12;
      side.drawLine({ start: { x: M, y: y + 3 }, end: { x: A4.w - M, y: y + 3 }, thickness: 0.3, color: LINJE });
      y -= 6;
    }
  }

  // Avvik
  overskrift("Avvik fra egenkontrollen");
  if (!d.avvik.length) avsnitt("Ingen avvik er registrert i egenkontrollen.", 10, R, DEMPET);
  for (const a of d.avvik) {
    plass(40);
    avsnitt(`${a.tittel} – ${a.status}`, 10, B);
    if (a.tiltak) avsnitt(`Tiltak: ${a.tiltak}`, 9.5, R, TEKST, 10);
    if (a.lukket) avsnitt(a.lukket, 9, R, DEMPET, 10);
    y -= 4;
  }

  // Sjekklistene
  for (const l of d.lister) {
    overskrift(l.dok ? `${l.navn} (${l.dok})` : l.navn);
    avsnitt(l.signert, 9.5, R, DEMPET);
    avsnitt(l.godkjent, 9.5, R, DEMPET);
    y -= 6;
    let sek: string | undefined;
    for (const [i, pt] of l.punkter.entries()) {
      if (pt.seksjon && pt.seksjon !== sek) { sek = pt.seksjon; plass(30); y -= 2; tekst(pt.seksjon.toUpperCase(), M, 8.5, B, DEMPET); y -= 13; }
      const linjer = brytLinjer(`${i + 1}. ${pt.tekst}`, R, 10, B_ - 90);
      const ekstra = [pt.maaling, pt.kommentar, pt.avvik, pt.utfort ? `Utført av ${pt.utfort}` : undefined].filter((x): x is string => !!x)
        .flatMap((x) => brytLinjer(x, R, 8.5, B_ - 100));
      plass(linjer.length * 13 + ekstra.length * 11 + 8);
      linjer.forEach((t, n) => side.drawText(t, { x: M + 4, y: y - n * 13, size: 10, font: R, color: TEKST }));
      side.drawText(pt.svar, { x: A4.w - M - B.widthOfTextAtSize(pt.svar, 9.5), y, size: 9.5, font: B, color: (pt.svarType && FARGE[pt.svarType]) || DEMPET });
      y -= linjer.length * 13;
      for (const e of ekstra) { side.drawText(e, { x: M + 16, y, size: 8.5, font: R, color: DEMPET }); y -= 11; }
      side.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.3, color: LINJE });
      y -= 5;
    }
  }

  // Sidetall
  const sider = doc.getPages();
  sider.forEach((s, n) => {
    const t = `${d.prosjekt} · Egenkontroll · side ${n + 1} av ${sider.length}`;
    s.drawText(t, { x: A4.w / 2 - R.widthOfTextAtSize(t, 8) / 2, y: 24, size: 8, font: R, color: DEMPET });
  });
  return doc.save();
}
