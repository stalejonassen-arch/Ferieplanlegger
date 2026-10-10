// Import av timelisteeksporten fra Svenn (Excel). Leses i nettleseren, uten eksterne biblioteker.
import type { Prosjekt } from "./timer";

type Celle = string | number | null;

/** Pakker ut én fil fra en zip (xlsx er en zip med XML-filer) */
async function pakkUt(buf: ArrayBuffer, navn: string): Promise<string | null> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Fila er ikke en Excel-fil (.xlsx).");
  const antall = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dek = new TextDecoder();
  for (let n = 0; n < antall; n++) {
    const metode = v.getUint16(p + 10, true), str = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), kl = v.getUint16(p + 32, true);
    const lokal = v.getUint32(p + 42, true);
    const filnavn = dek.decode(new Uint8Array(buf, p + 46, nl));
    p += 46 + nl + el + kl;
    if (filnavn !== navn) continue;
    const start = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
    const data = new Uint8Array(buf, start, str);
    if (metode === 0) return dek.decode(data);
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(ds).text();
  }
  return null;
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
