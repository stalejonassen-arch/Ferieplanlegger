// Boligmappa: dokumentasjonen knyttes til eiendommen (matrikkel: kommune, gnr/bnr/fnr/snr, evt. bruksenhet)
// og merkes med fag. Eiendomsdata hentes fra Kartverkets åpne adresse-API ut fra adressen på prosjektet.
// Direkte sending krever partneravtale med Boligmappa (API-nøkler); til da lages en eksport med alt de trenger.
import type { Prosjekt } from "./timer";

export const FAG = ["Tømrer", "Murer", "Rørlegger", "Elektriker", "Maler", "Blikkenslager", "Taktekker", "Flislegger", "Membranlegger", "Graving/grunnarbeid", "Annet"];

export interface Eiendom {
  kommunenr: string; kommune: string; gnr: number | null; bnr: number | null; fnr: number | null; snr: number | null;
  bruksenhet: string; boligmappe_nr: string; fag: string;
}
export interface KartverketTreff extends Omit<Eiendom, "boligmappe_nr" | "fag" | "bruksenhet"> {
  adresse: string; postnr: string; poststed: string; bruksenheter: string[];
}

export const eiendom = (p: Prosjekt): Eiendom => ({
  kommunenr: p.kommunenr ?? "", kommune: p.kommune ?? "", gnr: p.gnr ?? null, bnr: p.bnr ?? null, fnr: p.fnr ?? null,
  snr: p.snr ?? null, bruksenhet: p.bruksenhet ?? "", boligmappe_nr: p.boligmappe_nr ?? "", fag: p.fag || "Tømrer",
});

/** «1508 Ålesund, gnr. 12 / bnr. 34» */
export function matrikkelTekst(e: Eiendom): string {
  if (!e.kommunenr || e.gnr == null || e.bnr == null) return "";
  const nr = [`gnr. ${e.gnr}`, `bnr. ${e.bnr}`, e.fnr ? `fnr. ${e.fnr}` : "", e.snr ? `snr. ${e.snr}` : ""].filter(Boolean).join(" / ");
  return `${e.kommunenr}${e.kommune ? " " + e.kommune : ""}, ${nr}`;
}

const tall = (v: unknown) => (v == null || v === "" || Number(v) === 0 ? null : Number(v));

/** Gjør om svar fra ws.geonorge.no/adresser/v1/sok til treff */
export function lesKartverket(svar: unknown): KartverketTreff[] {
  const adresser = (svar as { adresser?: Record<string, unknown>[] })?.adresser ?? [];
  return adresser.map((a) => ({
    adresse: String(a.adressetekst ?? ""), postnr: String(a.postnummer ?? ""), poststed: String(a.poststed ?? ""),
    kommunenr: String(a.kommunenummer ?? ""), kommune: String(a.kommunenavn ?? ""),
    gnr: tall(a.gardsnummer), bnr: tall(a.bruksnummer), fnr: tall(a.festenummer), snr: tall(a.undernummer),
    bruksenheter: Array.isArray(a.bruksenhetsnummer) ? (a.bruksenhetsnummer as unknown[]).map(String) : [],
  }));
}

export async function sokKartverket(adresse: string): Promise<KartverketTreff[]> {
  const sok = adresse.replace(/\s+/g, " ").trim();
  if (!sok) return [];
  const u = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(sok)}&fuzzy=true&treffPerSide=8&utkoordsys=4258`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("Fikk ikke svar fra Kartverket.");
  return lesKartverket(await r.json());
}

export interface Klarpunkt { tekst: string; ok: boolean; krav: boolean }
/** Hva som er på plass før dokumentasjonen kan legges i Boligmappa */
export function klarForBoligmappa(e: Eiendom, adr: string, n: { dagbok: number; bilder: number; fdv: number; sjekklister: number }): Klarpunkt[] {
  return [
    { tekst: "Adresse", ok: !!adr.trim(), krav: true },
    { tekst: "Matrikkel (kommune, gnr og bnr)", ok: !!matrikkelTekst(e), krav: true },
    { tekst: "Fag", ok: !!e.fag, krav: true },
    { tekst: "Beskrivelse av utført arbeid (dagbok)", ok: n.dagbok > 0, krav: true },
    { tekst: "Bilder", ok: n.bilder > 0, krav: false },
    { tekst: "FDV-dokumentasjon", ok: n.fdv > 0, krav: false },
    { tekst: "Sjekklister / samsvarserklæring", ok: n.sjekklister > 0, krav: false },
  ];
}

export const erSjekkliste = (navn: string) => /sjekkliste|kontroll|samsvar|egenkontroll|checklist/i.test(navn);

export interface BoligmappaEksport {
  format: "bygglogg-boligmappa"; versjon: 1; laget: string;
  utforende: { navn: string; orgnr: string; fag: string };
  eiendom: { adresse: string; postnr: string; poststed: string; kommunenr: string; kommune: string; gnr: number | null; bnr: number | null; fnr: number | null; snr: number | null; bruksenhet: string; boligmappe_nr: string };
  prosjekt: { navn: string; visma_nr: number | null; kunde: string; fra: string | null; til: string | null; beskrivelse: string };
  dokumenter: { tittel: string; type: "sluttdokumentasjon" | "bilde" | "fdv" | "sjekkliste" | "produkt"; fil?: string; dato?: string; lenke?: string }[];
}

/** «Ola Nordmanns veg 3, 6290 Haramsøy» -> adresse, postnr og sted */
export function delAdresse(adr: string): { adresse: string; postnr: string; poststed: string } {
  const m = adr.match(/^(.*?)[,\s]+(\d{4})\s+(.+)$/);
  return m ? { adresse: m[1].trim(), postnr: m[2], poststed: m[3].trim() } : { adresse: adr.trim(), postnr: "", poststed: "" };
}

export const filnavn = (s: string) => s.normalize("NFKD").replace(/[^\w.\- æøåÆØÅ]/g, "").replace(/\s+/g, "_").slice(0, 80) || "fil";

// Enkel zip (uten komprimering – bilder og PDF er allerede komprimert)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function lagZip(filer: { navn: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const deler: Uint8Array[] = []; const sentral: Uint8Array[] = []; let pos = 0;
  for (const f of filer) {
    const navn = enc.encode(f.navn); const crc = crc32(f.data); const n = f.data.length;
    const lok = new DataView(new ArrayBuffer(30));
    lok.setUint32(0, 0x04034b50, true); lok.setUint16(4, 20, true); lok.setUint16(6, 0x0800, true); lok.setUint16(8, 0, true);
    lok.setUint16(10, 0, true); lok.setUint16(12, 0x21, true); lok.setUint32(14, crc, true); lok.setUint32(18, n, true); lok.setUint32(22, n, true);
    lok.setUint16(26, navn.length, true); lok.setUint16(28, 0, true);
    const sen = new DataView(new ArrayBuffer(46));
    sen.setUint32(0, 0x02014b50, true); sen.setUint16(4, 20, true); sen.setUint16(6, 20, true); sen.setUint16(8, 0x0800, true); sen.setUint16(10, 0, true);
    sen.setUint16(12, 0, true); sen.setUint16(14, 0x21, true); sen.setUint32(16, crc, true); sen.setUint32(20, n, true); sen.setUint32(24, n, true);
    sen.setUint16(28, navn.length, true); sen.setUint32(42, pos, true);
    deler.push(new Uint8Array(lok.buffer), navn, f.data);
    sentral.push(new Uint8Array(sen.buffer), navn);
    pos += 30 + navn.length + n;
  }
  const senLen = sentral.reduce((s, x) => s + x.length, 0);
  const slutt = new DataView(new ArrayBuffer(22));
  slutt.setUint32(0, 0x06054b50, true); slutt.setUint16(8, filer.length, true); slutt.setUint16(10, filer.length, true);
  slutt.setUint32(12, senLen, true); slutt.setUint32(16, pos, true);
  const alle = [...deler, ...sentral, new Uint8Array(slutt.buffer)];
  const ut = new Uint8Array(alle.reduce((s, x) => s + x.length, 0)); let o = 0;
  for (const x of alle) { ut.set(x, o); o += x.length; }
  return ut;
}
