// Sluttrapport som ekte PDF (A4), laget i nettleseren med pdf-lib.
// Én fil med forside, prosjektinformasjon, utført arbeid, tilleggsarbeid, bilder, FDV, garanti og signatur,
// og med FDV-dokumenter og sjekklister lagt ved bakerst. Klar til å lastes opp i Boligmappa som ett dokument.
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export interface RapportData {
  firma: { navn: string; linje: string; adresse: string; orgnr: string; tlf: string };
  tittel: string;
  prosjektnr?: string;
  kunde?: string;
  adresse?: string;
  matrikkel?: string;
  fag: string;
  utfort?: string;          // «2. september – 14. oktober 2026»
  timer?: string;           // «312,5 timer»
  utarbeidetAv: string;
  dato: string;             // «15. oktober 2026»
  innledning?: string;
  dagbok: { dato: string; tekst: string }[];
  tillegg: { tittel: string; beskrivelse?: string; detaljer?: string; godkjent?: string; signatur?: string | null }[];
  bilder: { data: Uint8Array; tekst?: string }[];
  varer: { navn: string; nobb: string; antall: string; lenke: string }[];
  vedlegg: { navn: string; data: Uint8Array }[];
  boligmappa: boolean;
}

const A4 = { w: 595.28, h: 841.89 };
const M = 50;                      // marg
const BREDDE = A4.w - 2 * M;
const NAVY = rgb(0x0b / 255, 0x1f / 255, 0x5c / 255);
const GUL = rgb(1, 0xcd / 255, 0);
const TEKST = rgb(0x1b / 255, 0x22 / 255, 0x36 / 255);
const DEMPET = rgb(0x5a / 255, 0x62 / 255, 0x78 / 255);
const LINJE = rgb(0xd5 / 255, 0xda / 255, 0xe6 / 255);
const LYS = rgb(0xf3 / 255, 0xf5 / 255, 0xfa / 255);
const HVIT = rgb(1, 1, 1);

/** Deler tekst i linjer som får plass i en gitt bredde (beholder linjeskift) */
export function brytLinjer(tekst: string, font: { widthOfTextAtSize(t: string, s: number): number }, str: number, maks: number): string[] {
  const ut: string[] = [];
  for (const avsnitt of tekst.replace(/\r/g, "").split("\n")) {
    const ord = avsnitt.split(/\s+/).filter(Boolean);
    if (!ord.length) { ut.push(""); continue; }
    let linje = "";
    for (const o of ord) {
      const prov = linje ? `${linje} ${o}` : o;
      if (font.widthOfTextAtSize(prov, str) <= maks) { linje = prov; continue; }
      if (linje) ut.push(linje);
      // Ord som er lengre enn linja (lange lenker) deles
      let rest = o;
      while (font.widthOfTextAtSize(rest, str) > maks) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), str) > maks) n--;
        ut.push(rest.slice(0, n)); rest = rest.slice(n);
      }
      linje = rest;
    }
    ut.push(linje);
  }
  return ut;
}

async function hentFont(sti: string) {
  const r = await fetch(sti);
  if (!r.ok) throw new Error(`Fant ikke skrifttypen ${sti}`);
  return new Uint8Array(await r.arrayBuffer());
}

function erPng(b: Uint8Array) { return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47; }
function erJpg(b: Uint8Array) { return b[0] === 0xff && b[1] === 0xd8; }
function erPdf(b: Uint8Array) { return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; }

async function bilde(doc: PDFDocument, data: Uint8Array): Promise<PDFImage | null> {
  try {
    if (erJpg(data)) return await doc.embedJpg(data);
    if (erPng(data)) return await doc.embedPng(data);
  } catch { /* ødelagt bilde: hoppes over */ }
  return null;
}

function lenke(page: PDFPage, x: number, y: number, w: number, h: number, url: string) {
  const ctx = page.doc.context;
  const annot = ctx.register(ctx.obj({
    Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  }));
  const eks = page.node.lookup(PDFName.of("Annots"));
  if (eks && "push" in (eks as object)) (eks as unknown as { push(a: unknown): void }).push(annot);
  else page.node.set(PDFName.of("Annots"), ctx.obj([annot]));
}

/** Huset med haken (ByggLogg-merket) tegnet med streker */
function merke(page: PDFPage, x: number, y: number, s: number, farge = HVIT, hake = GUL) {
  const p = (px: number, py: number) => ({ x: x + px * s, y: y + (64 - py) * s });
  const strek = (a: [number, number], b: [number, number], t: number, c = farge) =>
    page.drawLine({ start: p(...a), end: p(...b), thickness: t * s, color: c, lineCap: 1 });
  strek([6, 30], [32, 9], 7); strek([32, 9], [58, 30], 7);
  strek([15, 27], [15, 55], 6); strek([15, 55], [49, 55], 6); strek([49, 55], [49, 27], 6);
  strek([23, 41], [30, 48], 6, hake); strek([30, 48], [42, 35], 6, hake);
}

export async function lagSluttrapport(d: RapportData, fonter?: { R: Uint8Array; B: Uint8Array; T: Uint8Array }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [fR, fB, fT] = fonter ? [fonter.R, fonter.B, fonter.T] : await Promise.all([
    hentFont("/fonter/Barlow-Regular.ttf"), hentFont("/fonter/Barlow-SemiBold.ttf"), hentFont("/fonter/BarlowCondensed-ExtraBoldItalic.ttf"),
  ]);
  const R = await doc.embedFont(fR, { subset: true });
  const B = await doc.embedFont(fB, { subset: true });
  const T = await doc.embedFont(fT, { subset: true });
  doc.setTitle(`Sluttdokumentasjon – ${d.tittel}`);
  doc.setAuthor(d.firma.navn);
  doc.setSubject([d.adresse, d.matrikkel].filter(Boolean).join(" · "));
  doc.setCreator("ByggLogg");
  doc.setProducer("ByggLogg (bygglogg.app)");
  doc.setLanguage("nb-NO");

  // ---------------------------------------------------------------- forside
  const f = doc.addPage([A4.w, A4.h]);
  f.drawRectangle({ x: 0, y: A4.h - 330, width: A4.w, height: 330, color: NAVY });
  // målebånd
  f.drawRectangle({ x: 0, y: A4.h - 342, width: A4.w, height: 12, color: GUL });
  for (let x = 0, i = 0; x < A4.w; x += 7.5, i++) f.drawLine({ start: { x, y: A4.h - 330 }, end: { x, y: A4.h - 330 - (i % 10 === 0 ? 9 : i % 5 === 0 ? 6 : 3.5) }, thickness: 0.7, color: TEKST });
  merke(f, M, A4.h - 100, 0.9);
  f.drawText(d.firma.navn, { x: M + 70, y: A4.h - 66, size: 18, font: B, color: HVIT });
  if (d.firma.linje) f.drawText(d.firma.linje, { x: M + 70, y: A4.h - 84, size: 10.5, font: R, color: rgb(0.78, 0.81, 0.92) });
  f.drawText("SLUTTDOKUMENTASJON", { x: M, y: A4.h - 175, size: 12, font: B, color: GUL });
  let ty = A4.h - 215;
  for (const l of brytLinjer(d.tittel, T, 40, BREDDE).slice(0, 3)) { f.drawText(l, { x: M, y: ty, size: 40, font: T, color: HVIT }); ty -= 42; }
  if (d.adresse) f.drawText(d.adresse, { x: M, y: Math.min(ty - 4, A4.h - 300), size: 13, font: R, color: rgb(0.85, 0.88, 0.96) });

  // nøkkelfakta i rutenett
  const fakta: [string, string][] = ([
    ["Kunde", d.kunde ?? ""], ["Adresse for utførelse", d.adresse ?? ""], ["Eiendom (matrikkel)", d.matrikkel ?? ""],
    ["Fag", d.fag], ["Utført", d.utfort ?? ""], ["Prosjektnr.", d.prosjektnr ?? ""], ["Dato", d.dato], ["Utarbeidet av", d.utarbeidetAv],
  ] as [string, string][]).filter(([, v]) => v);
  let fy = A4.h - 400;
  const kol = BREDDE / 2;
  fakta.forEach(([k, v], i) => {
    const x = M + (i % 2) * kol, y = fy - Math.floor(i / 2) * 58;
    f.drawText(k.toUpperCase(), { x, y, size: 8.5, font: B, color: DEMPET });
    brytLinjer(v, R, 12.5, kol - 16).slice(0, 2).forEach((l, n) => f.drawText(l, { x, y: y - 17 - n * 15, size: 12.5, font: R, color: TEKST }));
  });
  fy -= Math.ceil(fakta.length / 2) * 58;
  if (d.innledning) {
    const linjer = brytLinjer(d.innledning, R, 11.5, BREDDE - 28);
    const h = linjer.length * 16 + 22;
    f.drawRectangle({ x: M, y: fy - h + 10, width: BREDDE, height: h, color: LYS });
    f.drawRectangle({ x: M, y: fy - h + 10, width: 3, height: h, color: GUL });
    linjer.forEach((l, n) => f.drawText(l, { x: M + 16, y: fy - 6 - n * 16, size: 11.5, font: R, color: TEKST }));
  }

  // ---------------------------------------------------------------- innholdssider
  const sider: PDFPage[] = [f];
  let side = f, y = 0;
  const nySide = () => { side = doc.addPage([A4.w, A4.h]); sider.push(side); y = A4.h - M - 20; };
  const plass = (h: number) => { if (y - h < M + 40) nySide(); };
  let kapittel = 0;
  // behov: plass til første innhold, så overskriften aldri står alene nederst på en side
  const overskrift = (t: string, behov = 60) => {
    if (y < A4.h - M - 30) y -= 14;
    plass(46 + behov);
    kapittel++;
    side.drawRectangle({ x: M, y: y - 6, width: 24, height: 24, color: NAVY });
    const nr = String(kapittel);
    side.drawText(nr, { x: M + 12 - B.widthOfTextAtSize(nr, 12) / 2, y: y + 1, size: 12, font: B, color: HVIT });
    side.drawText(t, { x: M + 34, y, size: 17, font: B, color: TEKST });
    y -= 16;
    side.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.8, color: LINJE });
    y -= 20;
  };
  const avsnitt = (t: string, str = 10.5, font: PDFFont = R, farge = TEKST, innrykk = 0) => {
    for (const l of brytLinjer(t, font, str, BREDDE - innrykk)) { plass(str + 4); side.drawText(l, { x: M + innrykk, y, size: str, font, color: farge }); y -= str + 4.5; }
  };
  nySide();

  if (d.dagbok.length) {
    overskrift("Utført arbeid");
    const datoB = 110;
    for (const x of d.dagbok) {
      const linjer = brytLinjer(x.tekst, R, 10.5, BREDDE - datoB);
      plass(Math.min(linjer.length, 3) * 15 + 10);
      side.drawText(x.dato, { x: M, y, size: 10, font: B, color: DEMPET });
      for (const l of linjer) { plass(15); side.drawText(l, { x: M + datoB, y, size: 10.5, font: R, color: TEKST }); y -= 15; }
      y -= 4;
      side.drawLine({ start: { x: M, y: y + 6 }, end: { x: A4.w - M, y: y + 6 }, thickness: 0.4, color: LINJE });
      y -= 6;
    }
    y -= 10;
  }

  if (d.tillegg.length) {
    overskrift("Godkjent tilleggsarbeid", 110);
    for (const t of d.tillegg) {
      plass(80);
      avsnitt(t.tittel, 11.5, B);
      if (t.beskrivelse) avsnitt(t.beskrivelse);
      if (t.detaljer) avsnitt(t.detaljer, 9.5, R, DEMPET);
      if (t.signatur?.startsWith("data:image/png")) {
        try {
          const img = await doc.embedPng(t.signatur);
          const h = 36, w = Math.min(160, (img.width / img.height) * h);
          plass(h + 20);
          side.drawImage(img, { x: M, y: y - h + 10, width: w, height: h });
          y -= h + 4;
        } catch { /* ingen signatur */ }
      }
      if (t.godkjent) avsnitt(t.godkjent, 9.5, R, DEMPET);
      y -= 16;
    }
  }

  if (d.bilder.length) {
    const gap = 14, bw = (BREDDE - gap) / 2, bh = 180;
    overskrift("Bilder fra arbeidet", bh + 34);
    let i = 0;
    for (const b of d.bilder) {
      const img = await bilde(doc, b.data);
      if (!img) continue;
      if (i % 2 === 0) plass(bh + 34);
      const x = M + (i % 2) * (bw + gap);
      const s = Math.min(bw / img.width, bh / img.height);
      const w = img.width * s, h = img.height * s;
      side.drawRectangle({ x, y: y - bh, width: bw, height: bh, color: LYS });
      side.drawImage(img, { x: x + (bw - w) / 2, y: y - bh + (bh - h) / 2, width: w, height: h });
      if (b.tekst) brytLinjer(b.tekst, R, 9, bw).slice(0, 2).forEach((l, n) => side.drawText(l, { x, y: y - bh - 12 - n * 11, size: 9, font: R, color: DEMPET }));
      if (i % 2 === 1) y -= bh + 40;
      i++;
    }
    if (i % 2 === 1) y -= bh + 40;
  }

  if (d.varer.length || d.vedlegg.length) {
    overskrift("FDV – forvaltning, drift og vedlikehold", 110);
    avsnitt("Produktene som er brukt i arbeidet. Klikk på lenken for produktdatablad, FDV og monteringsanvisning hos NOBB.", 10, R, DEMPET);
    y -= 6;
    if (d.varer.length) {
      const kx = [M, M + 250, M + 320, M + 380];
      plass(60);
      side.drawRectangle({ x: M, y: y - 6, width: BREDDE, height: 20, color: LYS });
      ["Produkt", "NOBB", "Antall", "Dokumentasjon"].forEach((t, n) => side.drawText(t, { x: kx[n]! + 4, y, size: 9, font: B, color: DEMPET }));
      y -= 22;
      for (const v of d.varer) {
        const linjer = brytLinjer(v.navn, R, 9.5, 240);
        plass(linjer.length * 13 + 6);
        linjer.forEach((l, n) => side.drawText(l, { x: kx[0]! + 4, y: y - n * 13, size: 9.5, font: R, color: TEKST }));
        side.drawText(v.nobb, { x: kx[1]! + 4, y, size: 9.5, font: R, color: TEKST });
        side.drawText(v.antall, { x: kx[2]! + 4, y, size: 9.5, font: R, color: TEKST });
        if (v.lenke) {
          const vis = "Åpne FDV hos NOBB";
          side.drawText(vis, { x: kx[3]! + 4, y, size: 9.5, font: B, color: rgb(0.04, 0.12, 0.75) });
          lenke(side, kx[3]! + 4, y - 3, B.widthOfTextAtSize(vis, 9.5), 13, v.lenke);
        }
        y -= linjer.length * 13 + 5;
        side.drawLine({ start: { x: M, y: y + 8 }, end: { x: A4.w - M, y: y + 8 }, thickness: 0.4, color: LINJE });
      }
      y -= 10;
    }
  }

  // Vedlegg: last dem inn nå, så sidetallene kan stå i oversikten
  const lastet: { navn: string; doc?: PDFDocument; img?: Uint8Array }[] = [];
  for (const v of d.vedlegg) {
    if (erPdf(v.data)) {
      try { lastet.push({ navn: v.navn, doc: await PDFDocument.load(v.data, { ignoreEncryption: true }) }); continue; } catch { /* hoppes over */ }
    } else if (erJpg(v.data) || erPng(v.data)) { lastet.push({ navn: v.navn, img: v.data }); continue; }
    lastet.push({ navn: v.navn });
  }

  overskrift("Garanti og reklamasjon");
  avsnitt("Arbeidet er utført i henhold til avtale, gjeldende forskrifter og produsentenes monteringsanvisninger. Oppdager du feil eller mangler, gi oss beskjed så snart som mulig. Reklamasjon behandles etter avtalen og gjeldende lov. For forbrukere gjelder håndverkertjenesteloven, med en absolutt frist på fem år for arbeid som skal vare vesentlig lenger. Følg FDV-dokumentasjonen for riktig vedlikehold.");
  y -= 30;
  plass(70);
  const sb = (BREDDE - 40) / 3;
  [["Overlevert av", `${d.utarbeidetAv}, ${d.firma.navn}`], ["Mottatt av kunde", d.kunde ?? ""], ["Sted og dato", ""]].forEach(([k, v], n) => {
    const x = M + n * (sb + 20);
    side.drawLine({ start: { x, y }, end: { x: x + sb, y }, thickness: 0.8, color: TEKST });
    side.drawText(k!, { x, y: y - 13, size: 8.5, font: B, color: DEMPET });
    if (v) brytLinjer(v, R, 9, sb).slice(0, 2).forEach((l, i) => side.drawText(l, { x, y: y - 25 - i * 11, size: 9, font: R, color: TEKST }));
  });
  y -= 60;

  if (d.boligmappa) {
    const steg = [
      "Logg inn på boligmappa.no eller i Boligmappa-appen med BankID.",
      `Velg boligen${d.matrikkel ? ` (${d.matrikkel})` : ""}.`,
      "Last opp denne PDF-en som ett dokument. Velg «Sluttdokumentasjon» og faget «" + d.fag + "» hvis du blir spurt.",
      "Ta vare på den. Dokumentasjonen følger boligen og er nyttig ved salg, forsikring og vedlikehold.",
    ];
    const stegLinjer = steg.map((s) => brytLinjer(s, R, 10, BREDDE - 50));
    const boksH = 46 + stegLinjer.reduce((n, l) => n + l.length * 14 + 2, 0);
    plass(boksH + 20);
    side.drawRectangle({ x: M, y: y - boksH + 10, width: BREDDE, height: boksH, color: LYS });
    side.drawRectangle({ x: M, y: y - boksH + 10, width: 3, height: boksH, color: NAVY });
    let by = y - 12;
    side.drawText("Legg dokumentasjonen i Boligmappa", { x: M + 16, y: by, size: 12.5, font: B, color: TEKST }); by -= 20;
    stegLinjer.forEach((linjer, n) => {
      side.drawText(`${n + 1}.`, { x: M + 16, y: by, size: 10, font: B, color: NAVY });
      linjer.forEach((l) => { side.drawText(l, { x: M + 32, y: by, size: 10, font: R, color: TEKST }); by -= 14; });
      by -= 2;
    });
    y = y - boksH - 14;
  }

  // Vedleggsoversikt med sidetall
  if (lastet.length) {
    let start = sider.length + 1 + (y - 40 - lastet.length * 16 < M + 40 ? 1 : 0);
    const oversikt = lastet.map((v) => {
      const n = v.doc ? v.doc.getPageCount() : v.img ? 1 : 0;
      const r = { navn: v.navn, side: n ? start : null }; start += n; return r;
    });
    plass(40 + oversikt.length * 16);
    side.drawText("Vedlegg", { x: M, y, size: 12.5, font: B, color: TEKST }); y -= 18;
    oversikt.forEach((v, i) => {
      plass(16);
      side.drawText(`${i + 1}. ${v.navn}`, { x: M, y, size: 10, font: R, color: TEKST });
      const s = v.side ? `side ${v.side}` : "kunne ikke legges ved";
      side.drawText(s, { x: A4.w - M - R.widthOfTextAtSize(s, 10), y, size: 10, font: R, color: DEMPET });
      y -= 16;
    });
  }

  // Bunntekst og sidetall på rapportsidene
  const bunn = [d.firma.navn, d.firma.orgnr && `Org.nr. ${d.firma.orgnr}`, d.firma.adresse, d.firma.tlf && `Tlf. ${d.firma.tlf}`].filter(Boolean).join("  ·  ");
  const vedleggSider = lastet.reduce((n, v) => n + (v.doc ? v.doc.getPageCount() : v.img ? 1 : 0), 0);
  const totalt = sider.length + vedleggSider;
  sider.forEach((s, i) => {
    if (i > 0) {
      s.drawText(d.tittel.length > 60 ? d.tittel.slice(0, 59) + "…" : d.tittel, { x: M, y: A4.h - 32, size: 8.5, font: R, color: DEMPET });
      s.drawText("Sluttdokumentasjon", { x: A4.w - M - B.widthOfTextAtSize("Sluttdokumentasjon", 8.5), y: A4.h - 32, size: 8.5, font: B, color: DEMPET });
      s.drawLine({ start: { x: M, y: A4.h - 38 }, end: { x: A4.w - M, y: A4.h - 38 }, thickness: 0.5, color: LINJE });
    }
    s.drawLine({ start: { x: M, y: 40 }, end: { x: A4.w - M, y: 40 }, thickness: 0.5, color: LINJE });
    s.drawText(bunn, { x: M, y: 27, size: 8, font: R, color: DEMPET });
    const sn = `Side ${i + 1} av ${totalt}`;
    s.drawText(sn, { x: A4.w - M - R.widthOfTextAtSize(sn, 8), y: 27, size: 8, font: R, color: DEMPET });
  });

  // Legg ved FDV-dokumenter og sjekklister
  for (const v of lastet) {
    if (v.doc) {
      const kopier = await doc.copyPages(v.doc, v.doc.getPageIndices());
      kopier.forEach((p) => doc.addPage(p));
    } else if (v.img) {
      const img = await bilde(doc, v.img);
      if (!img) continue;
      const p = doc.addPage([A4.w, A4.h]);
      const s = Math.min((A4.w - 2 * M) / img.width, (A4.h - 2 * M - 20) / img.height);
      p.drawText(v.navn, { x: M, y: A4.h - 32, size: 9, font: B, color: DEMPET });
      p.drawImage(img, { x: (A4.w - img.width * s) / 2, y: (A4.h - img.height * s) / 2 - 10, width: img.width * s, height: img.height * s });
    }
  }
  return doc.save();
}
