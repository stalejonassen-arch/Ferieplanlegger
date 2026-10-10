// Import av timelisteeksporten fra Svenn (Excel). Leses i nettleseren, uten eksterne biblioteker.
import type { Prosjekt } from "./timer";

type Celle = string | number | null;

/** Åpner en zip (xlsx er også en zip). Gir navnene og en funksjon som pakker ut én fil. */
export function apneZip(buf: ArrayBuffer) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Fila er ikke en gyldig zip/xlsx.");
  const antall = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dek = new TextDecoder();
  const oppf = new Map<string, { metode: number; str: number; lokal: number }>();
  for (let n = 0; n < antall; n++) {
    const metode = v.getUint16(p + 10, true), str = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), kl = v.getUint16(p + 32, true);
    oppf.set(dek.decode(new Uint8Array(buf, p + 46, nl)), { metode, str, lokal: v.getUint32(p + 42, true) });
    p += 46 + nl + el + kl;
  }
  const les = async (navn: string): Promise<Uint8Array | null> => {
    const o = oppf.get(navn);
    if (!o) return null;
    const start = o.lokal + 30 + v.getUint16(o.lokal + 26, true) + v.getUint16(o.lokal + 28, true);
    const data = new Uint8Array(buf, start, o.str);
    if (o.metode === 0) return data;
    const ds = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  };
  return { navn: [...oppf.keys()], les };
}
async function pakkUt(buf: ArrayBuffer, navn: string): Promise<string | null> {
  const b = await apneZip(buf).les(navn);
  return b ? new TextDecoder().decode(b) : null;
}

const xmlTekst = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const kolonne = (ref: string) => { let n = 0; for (const c of ref.replace(/\d+$/, "")) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

/** Første ark i en xlsx som rader med celler (tekst eller tall) */
export async function lesXlsx(buf: ArrayBuffer): Promise<Celle[][]> {
  const sst = await pakkUt(buf, "xl/sharedStrings.xml");
  const delt = sst ? [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlTekst(t[1])).join("")) : [];
  const ark = await pakkUt(buf, "xl/worksheets/sheet1.xml");
  if (!ark) throw new Error("Fant ikke noe ark i Excel-fila.");
  const rader: Celle[][] = [];
  for (const r of ark.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rad: Celle[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = c[1].match(/\bt="(\w+)"/)?.[1];
      const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let verdi: Celle = null;
      if (type === "s" && v != null) verdi = delt[Number(v)] ?? "";
      else if (type === "inlineStr") verdi = [...(c[2] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlTekst(t[1])).join("");
      else if (type === "str" && v != null) verdi = xmlTekst(v);
      else if (v != null) verdi = Number(v);
      rad[kolonne(ref)] = verdi;
    }
    rader.push(Array.from(rad, (x) => x ?? null));
  }
  return rader;
}

/** Én føring fra Svenn */
export interface SvennRad {
  dato: string; ansattnr: string; ansatt: string; kunde: string; prosjekt: string; prosjektnr: string;
  fra: number; arbeid: number; lunsj: number; kommentar: string; nokkel: string;
}

const rens = (s: Celle) => String(s ?? "").replace(/\s+/g, " ").trim();
const minutter = (s: Celle) => { const m = rens(s).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** Varighet i Excel er brøkdel av et døgn; i tekst «t:mm» */
const varighet = (c: Celle) => (typeof c === "number" ? Math.round(c * 1440) : minutter(c) ?? 0);

/** Nøkkel for et Svenn-prosjekt: navn#nummer, eller #kunde:<kunde> når føringen ikke har prosjekt */
export const svennNokkel = (prosjekt: string, nr: string, kunde: string) => (prosjekt ? `${prosjekt}#${nr}` : `#kunde:${kunde}`);

/** Leser timelista («Timeliste»-rapporten i Svenn, eksportert til Excel) */
export function lesSvenn(rader: Celle[][]) {
  const h = rader.findIndex((r) => r.some((c) => rens(c) === "Dato") && r.some((c) => rens(c) === "Ansatt ID"));
  if (h < 0) throw new Error("Fant ikke kolonnene Dato og Ansatt ID. Bruk «Timeliste»-rapporten fra Svenn, eksportert til Excel.");
  const kol = (navn: string) => rader[h].findIndex((c) => rens(c).toLowerCase().startsWith(navn.toLowerCase()));
  const K = { dato: kol("Dato"), kunde: kol("Kunde"), prosjekt: kol("Prosjekt"), nr: kol("Prosjektnummer"), ansatt: kol("Ansatt"), id: kol("Ansatt ID"),
    fra: kol("Fra"), totalt: kol("Totalt (uten reise)"), lunsj: kol("Lunsj"), kommentar: kol("Kommentar") };
  if ([K.dato, K.id, K.fra, K.totalt].some((i) => i < 0)) throw new Error("Fila mangler kolonnene Fra eller Totalt (uten reise).");
  const ut: SvennRad[] = [];
  let tomme = 0;
  for (const r of rader.slice(h + 1)) {
    const d = rens(r[K.dato]).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const fra = minutter(r[K.fra]);
    if (!d || fra == null || r[K.id] == null) continue;
    const arbeid = varighet(r[K.totalt]);
    if (arbeid <= 0) { tomme++; continue; }
    const prosjekt = rens(r[K.prosjekt]), nr = rens(r[K.nr]), kunde = K.kunde >= 0 ? rens(r[K.kunde]) : "";
    ut.push({ dato: `${d[3]}-${d[2]}-${d[1]}`, ansattnr: rens(r[K.id]), ansatt: K.ansatt >= 0 ? rens(r[K.ansatt]) : "", kunde, prosjekt, prosjektnr: nr,
      fra, arbeid, lunsj: Math.min(120, K.lunsj >= 0 ? varighet(r[K.lunsj]) : 0), kommentar: K.kommentar >= 0 ? rens(r[K.kommentar]).slice(0, 500) : "",
      nokkel: svennNokkel(prosjekt, nr, kunde) });
  }
  return { rader: ut, tomme };
}

/** Hva et Svenn-prosjekt skal bli i ByggLogg */
export interface Kobling { nokkel: string; prosjekt_id: string | null; ny_navn: string | null; fakturerbar: boolean }
export interface SvennProsjekt { nokkel: string; navn: string; nr: string; kunde: string; timer: number; rader: number }

/** Svenn-prosjektene i fila, størst først */
export function svennProsjekter(rader: SvennRad[]): SvennProsjekt[] {
  const m = new Map<string, SvennProsjekt>();
  for (const r of rader) {
    const p = m.get(r.nokkel) ?? { nokkel: r.nokkel, navn: r.prosjekt, nr: r.prosjektnr, kunde: r.kunde, timer: 0, rader: 0 };
    p.timer += r.arbeid / 60; p.rader++; if (!p.kunde && r.kunde) p.kunde = r.kunde;
    m.set(r.nokkel, p);
  }
  return [...m.values()].sort((a, b) => b.timer - a.timer);
}

const IKKE_FAKTURERBAR = /intern|lastebil|truck|kjøkken og interiør|bygge kasser/i;
const GENERISK = /^(ekstra|skifte bordkledning|salongen|bay|diverse|div)$/i;

/** Forslag til kobling: lagret valg, ellers internt / samme navn som et prosjekt / nytt prosjekt */
export function foreslaKobling(p: SvennProsjekt, prosjekter: Prosjekt[], lagret: Map<string, { prosjekt_id: string | null; fakturerbar: boolean }>, bedriftNavn = ""): Kobling {
  const l = lagret.get(p.nokkel);
  if (l) return { nokkel: p.nokkel, prosjekt_id: l.prosjekt_id, ny_navn: null, fakturerbar: l.fakturerbar };
  const lik = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!p.navn && (!p.kunde || (bedriftNavn && lik(p.kunde, bedriftNavn)))) return { nokkel: p.nokkel, prosjekt_id: null, ny_navn: null, fakturerbar: false };
  if (/^interntid/i.test(p.navn) && !/lastebil/i.test(p.navn)) return { nokkel: p.nokkel, prosjekt_id: null, ny_navn: null, fakturerbar: false };
  const navn = p.navn || `${p.kunde} (uten prosjekt)`;
  const finnes = prosjekter.find((x) => lik(x.navn, navn));
  if (finnes) return { nokkel: p.nokkel, prosjekt_id: finnes.id, ny_navn: null, fakturerbar: !IKKE_FAKTURERBAR.test(navn) };
  return { nokkel: p.nokkel, prosjekt_id: null, ny_navn: GENERISK.test(navn) && p.kunde ? `${navn} – ${p.kunde}` : navn, fakturerbar: !IKKE_FAKTURERBAR.test(navn) };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Rader klare for import. Til-tiden regnes som fra + arbeidstid + lunsj, slik at summen blir nøyaktig
 * den samme som i Svenn (Svenns egne fra/til kan avvike pga. reise og avrunding).
 */
export function importRader(rader: SvennRad[]) {
  const DOGN = 24 * 60 - 1;
  return rader.map((r) => {
    let { fra, lunsj } = r;
    if (fra + r.arbeid + lunsj > DOGN) fra = Math.max(0, DOGN - r.arbeid - lunsj);
    if (fra + r.arbeid + lunsj > DOGN) { lunsj = 0; fra = Math.max(0, DOGN - r.arbeid); }
    const til = Math.min(DOGN, fra + r.arbeid + lunsj);
    return { d: r.dato, a: r.ansattnr, f: hhmm(fra), t: hhmm(til), l: lunsj, k: r.nokkel, c: r.kommentar };
  });
}

/** Dokumentasjonsarkiv fra Svenn (laget fra prosjektfilene i Svenn) */
export interface SvennFil { fil: string; navn: string; mappe: string; type: "bilde" | "dokument"; svenn_id: number; dato: string; prosjekt: string; forelder: string | null; nr: string; nokkel: string }
export interface SvennManifest { kilde: "svenn"; filer: SvennFil[] }

export async function lesSvennArkiv(buf: ArrayBuffer) {
  const zip = apneZip(buf);
  const m = await zip.les("manifest.json");
  if (!m) throw new Error("Fant ikke manifest.json. Bruk arkivet «svenn-dokumentasjon.zip».");
  const manifest = JSON.parse(new TextDecoder().decode(m)) as SvennManifest;
  if (manifest.kilde !== "svenn" || !Array.isArray(manifest.filer)) throw new Error("Arkivet er ikke fra Svenn.");
  return { manifest, les: zip.les };
}

/** Prosjektene i arkivet med antall bilder og dokumenter, størst først */
export function arkivProsjekter(filer: SvennFil[]) {
  const m = new Map<string, SvennProsjekt & { bilder: number; dokumenter: number }>();
  for (const f of filer) {
    const navn = f.forelder ? `${f.forelder} - ${f.prosjekt}` : f.prosjekt;
    const p = m.get(f.nokkel) ?? { nokkel: f.nokkel, navn, nr: f.nr, kunde: "", timer: 0, rader: 0, bilder: 0, dokumenter: 0 };
    p.rader++; if (f.type === "bilde") p.bilder++; else p.dokumenter++;
    m.set(f.nokkel, p);
  }
  return [...m.values()].sort((a, b) => b.rader - a.rader);
}

/** Tekst under et importert bilde: mappe og dato fra Svenn */
export const svennBildetekst = (f: SvennFil) =>
  [f.mappe, `fra Svenn ${f.dato.slice(0, 10).split("-").reverse().join(".")}`].filter(Boolean).join(" · ");
