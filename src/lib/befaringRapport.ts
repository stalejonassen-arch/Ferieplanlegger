// Befaringsrapport (PDF): punkter med svar, mål og merknader, notat, bilder og kundens signatur.
// Sendes til kunden etter befaring før tilbud, eller som protokoll ved overtakelse.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Data } from "./ferie";
import { langDato } from "./ferie";
import { BEFARING_SVAR, BEFARING_TYPE, type Befaring } from "./befaring";
import { PROFIL } from "./profil";
import { brytLinjer } from "./sluttrapport";

export interface BefaringRapportData {
  firma: string;
  tittel: string;
  type: string;
  info: [string, string][];
  notat: string;
  punkter: { tekst: string; svar: string; svarType: string; maal?: string; merknad?: string }[];
  bilder: { data: Uint8Array; tekst?: string }[];
  signatur?: { png: string; navn: string; tid: string };
  overtakelse: boolean;
}

/** Samler det som skal i rapporten. Bildene hentes av den som kaller (de ligger i lagringen). */
export function befaringData(d: Data, b: Befaring, bilder: { data: Uint8Array; tekst?: string }[]): BefaringRapportData {
  const navn = (id?: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const k = d.kunder.find((x) => x.id === b.kunde_id);
  const p = d.prosjekter.find((x) => x.id === b.prosjekt_id);
  const info: [string, string | undefined][] = [
    ["Kunde", k?.navn || b.kunde_navn],
    ["Adresse", b.adresse || p?.adresse],
    ["Telefon", b.telefon || k?.telefon],
    ["Prosjekt", p ? `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}` : undefined],
    ["Dato", langDato(b.dato)],
    ["Utført av", navn(b.utfort_av)],
    ["Til stede", b.deltakere],
  ];
  return {
    firma: PROFIL.firma,
    tittel: b.tittel,
    type: BEFARING_TYPE[b.type],
    info: info.filter((x): x is [string, string] => !!x[1]),
    notat: b.notat.trim(),
    punkter: b.punkter.map((x) => ({
      tekst: x.tekst, svar: x.svar ? BEFARING_SVAR[x.svar] : "–", svarType: x.svar || "",
      maal: (x.maal ?? "").trim() || undefined, merknad: (x.merknad ?? "").trim() || undefined,
    })),
    bilder,
    signatur: b.signatur ? { png: b.signatur, navn: b.signert_navn, tid: b.signert_tid ? langDato(b.signert_tid.slice(0, 10)) : "" } : undefined,
    overtakelse: b.type === "overtakelse",
  };
}

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const B_ = A4.w - 2 * M;
const NAVY = rgb(0x0b / 255, 0x1f / 255, 0x5c / 255);
const TEKST = rgb(0x1b / 255, 0x22 / 255, 0x36 / 255);
const DEMPET = rgb(0x5a / 255, 0x62 / 255, 0x78 / 255);
const LINJE = rgb(0xd5 / 255, 0xda / 255, 0xe6 / 255);
const FARGE: Record<string, ReturnType<typeof rgb>> = { ok: rgb(0.12, 0.5, 0.25), avvik: rgb(0.75, 0.2, 0.15), na: DEMPET };

async function hentFont(sti: string) {
  const r = await fetch(sti);
  if (!r.ok) throw new Error(`Fant ikke skrifttypen ${sti}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function bilde(doc: PDFDocument, data: Uint8Array): Promise<PDFImage | null> {
  try {
    if (data[0] === 0xff && data[1] === 0xd8) return await doc.embedJpg(data);
    if (data[0] === 0x89 && data[1] === 0x50) return await doc.embedPng(data);
  } catch { /* ødelagt bilde: hoppes over */ }
  return null;
}

export async function lagBefaringRapport(d: BefaringRapportData, fonter?: { R: Uint8Array; B: Uint8Array }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [fR, fB] = fonter ? [fonter.R, fonter.B] : await Promise.all([hentFont("/fonter/Barlow-Regular.ttf"), hentFont("/fonter/Barlow-SemiBold.ttf")]);
  const R = await doc.embedFont(fR, { subset: true });
  const B = await doc.embedFont(fB, { subset: true });
  doc.setTitle(`${d.type} – ${d.tittel}`);
  doc.setAuthor(d.firma);
  doc.setCreator("ByggLogg");
  doc.setLanguage("nb-NO");

  let side: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const nySide = () => { side = doc.addPage([A4.w, A4.h]); y = A4.h - M; };
  const plass = (h: number) => { if (y - h < M + 20) nySide(); };
  const tekst = (t: string, x: number, str: number, f: PDFFont = R, farge = TEKST) => side.drawText(t, { x, y, size: str, font: f, color: farge });
  const avsnitt = (t: string, str = 10, f: PDFFont = R, farge = TEKST, inn = 0) => {
    for (const del of t.split("\n")) for (const l of brytLinjer(del, f, str, B_ - inn)) { plass(str + 4); tekst(l, M + inn, str, f, farge); y -= str + 4; }
  };
  const overskrift = (t: string) => { plass(60); y -= 8; tekst(t, M, 15, B, NAVY); y -= 8; side.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: NAVY }); y -= 16; };

  // Hode
  side.drawRectangle({ x: 0, y: A4.h - 120, width: A4.w, height: 120, color: NAVY });
  side.drawText(d.firma, { x: M, y: A4.h - 44, size: 11, font: B, color: rgb(1, 0.8, 0) });
  side.drawText(d.type, { x: M, y: A4.h - 74, size: 26, font: B, color: rgb(1, 1, 1) });
  side.drawText(brytLinjer(d.tittel, R, 12, B_)[0] ?? "", { x: M, y: A4.h - 98, size: 12, font: R, color: rgb(1, 1, 1) });
  y = A4.h - 150;
  for (const [k, v] of d.info) {
    const linjer = brytLinjer(v, R, 10, B_ - 100);
    plass(linjer.length * 14);
    tekst(k, M, 10, B, DEMPET);
    linjer.forEach((l, n) => side.drawText(l, { x: M + 100, y: y - n * 14, size: 10, font: R, color: TEKST }));
    y -= linjer.length * 14 + 1;
  }

  if (d.notat) { overskrift("Notat"); avsnitt(d.notat); }

  if (d.punkter.length) {
    overskrift(d.overtakelse ? "Kontroll ved overtakelse" : "Punkter");
    for (const [i, pt] of d.punkter.entries()) {
      const linjer = brytLinjer(`${i + 1}. ${pt.tekst}`, R, 10, B_ - 90);
      const ekstra = [pt.maal ? `Mål: ${pt.maal}` : undefined, pt.merknad].filter((x): x is string => !!x).flatMap((x) => brytLinjer(x, R, 9, B_ - 30));
      plass(linjer.length * 13 + ekstra.length * 12 + 8);
      linjer.forEach((t, n) => side.drawText(t, { x: M + 4, y: y - n * 13, size: 10, font: R, color: TEKST }));
      side.drawText(pt.svar, { x: A4.w - M - B.widthOfTextAtSize(pt.svar, 9.5), y, size: 9.5, font: B, color: FARGE[pt.svarType] ?? DEMPET });
      y -= linjer.length * 13;
      for (const e of ekstra) { side.drawText(e, { x: M + 16, y, size: 9, font: R, color: DEMPET }); y -= 12; }
      side.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.3, color: LINJE });
      y -= 5;
    }
  }

  // Bilder, to i bredden
  if (d.bilder.length) {
    overskrift("Bilder");
    const bredde = (B_ - 12) / 2;
    let kol = 0, radHoyde = 0;
    for (const b of d.bilder) {
      const img = await bilde(doc, b.data);
      if (!img) continue;
      const h = Math.min(200, (img.height / img.width) * bredde);
      const w = (img.width / img.height) * h;
      if (kol === 0) { plass(h + 26); radHoyde = 0; }
      const x = M + kol * (bredde + 12);
      side.drawImage(img, { x, y: y - h, width: w, height: h });
      if (b.tekst) side.drawText(brytLinjer(b.tekst, R, 8.5, bredde)[0] ?? "", { x, y: y - h - 11, size: 8.5, font: R, color: DEMPET });
      radHoyde = Math.max(radHoyde, h + (b.tekst ? 18 : 8));
      kol = (kol + 1) % 2;
      if (kol === 0) y -= radHoyde + 8;
    }
    if (kol === 1) y -= radHoyde + 8;
  }

  // Kundens signatur
  if (d.signatur?.png.startsWith("data:image/png")) {
    overskrift(d.overtakelse ? "Overtatt av kunden" : "Kundens signatur");
    try {
      const img = await doc.embedPng(d.signatur.png);
      const h = 50, w = Math.min(200, (img.width / img.height) * h);
      plass(h + 30);
      side.drawImage(img, { x: M, y: y - h + 10, width: w, height: h });
      y -= h + 4;
    } catch { /* ingen signatur */ }
    avsnitt(`${d.signatur.navn}${d.signatur.tid ? `, ${d.signatur.tid}` : ""}`, 10, R, DEMPET);
  }

  const sider = doc.getPages();
  sider.forEach((s, n) => {
    const t = `${d.type} · ${d.tittel} · side ${n + 1} av ${sider.length}`;
    s.drawText(t.length > 110 ? `${t.slice(0, 107)}…` : t, { x: A4.w / 2 - Math.min(R.widthOfTextAtSize(t, 8), B_) / 2, y: 24, size: 8, font: R, color: DEMPET });
  });
  return doc.save();
}
