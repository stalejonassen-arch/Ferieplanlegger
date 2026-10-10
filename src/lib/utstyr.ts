// Utstyr: verktøy, arbeidstøy, verneutstyr og forbruk hver ansatt har tatt ut på sin utstyrskonto i Visma.
import { addMonths } from "./ferie";

export type UtstyrKategori = "verktoy" | "arbeidstoy" | "verneutstyr" | "forbruk";
export type UtstyrStatus = "i_bruk" | "service" | "levert" | "tapt";
export interface Utstyr {
  id: string; ansatt_id: string | null; kilde: "visma" | "manuell"; visma_ordrenr: number | null; dato: string;
  varenr: string; nobb_nr: string; beskrivelse: string; antall: number; enhet: string; pris: number;
  kategori: UtstyrKategori; kategori_manuell: boolean; serienr: string; bilde_sti: string | null;
  status: UtstyrStatus; merknad: string; bytte_avklart?: boolean;
}
/** Kvote: antall per periode på `aar` år (rullerende: 1 = siste 12 mnd, 2 = siste 24 mnd) */
export interface Kvote { antall: number; aar: number }
export type Kvoter = Record<string, Kvote>;
export interface UtstyrGrenser { arbeidstoy: number | null; verktoy: number | null; sammeMnd: number; kvoter?: Kvoter }

export const KATEGORI: Record<UtstyrKategori, string> = { verktoy: "Verktøy", arbeidstoy: "Arbeidstøy", verneutstyr: "Verneutstyr", forbruk: "Forbruk" };
export const STATUS: Record<UtstyrStatus, string> = { i_bruk: "I bruk", service: "Til service", levert: "Levert inn", tapt: "Tapt" };

/** Plaggtyper for arbeidstøy, med standardkvoter (vanlig klesordning i byggfirmaer) */
export const PLAGG: { type: string; navn: string; ord: RegExp; kategori?: UtstyrKategori }[] = [
  { type: "vernesko", navn: "Vernesko", ord: /SKO|STØVLE/, kategori: "verneutstyr" },
  { type: "vinter", navn: "Vinterjakke/-bukse", ord: /VINTER|PARKAS|FÔRET|FORET|THERMO/ },
  { type: "regntoy", navn: "Regntøy", ord: /REGN|PU-|PU |VANNTETT/ },
  { type: "bukse", navn: "Arbeidsbukser", ord: /BUKSE|SHORTS|SNEKKERBUKSE/ },
  { type: "jakke", navn: "Arbeidsjakker", ord: /JAKKE|SOFTSHELL|ANORAKK|VEST/ },
  { type: "genser", navn: "Gensere", ord: /GENSER|HETTE|FLEECE|COLLEGE/ },
  { type: "tskjorte", navn: "T-skjorter", ord: /T-SKJ|T-SHIRT|TSKJ|SKJORTE/ },
];
export const STANDARD_KVOTER: Kvoter = {
  bukse: { antall: 2, aar: 1 }, jakke: { antall: 1, aar: 1 }, vinter: { antall: 2, aar: 2 },
  tskjorte: { antall: 5, aar: 1 }, genser: { antall: 2, aar: 1 }, regntoy: { antall: 2, aar: 2 }, vernesko: { antall: 1, aar: 1 },
};

/** Plaggtype for en linje, eller null (lue, belte, sokker, hansker o.l. telles ikke) */
export function plaggtype(beskrivelse: string, kategori: UtstyrKategori = "arbeidstoy") {
  const b = beskrivelse.toUpperCase();
  return PLAGG.find((p) => (p.kategori ?? "arbeidstoy") === kategori && p.ord.test(b))?.type ?? null;
}

export const verdi = (u: Pick<Utstyr, "antall" | "pris">) => Math.round(u.antall * u.pris);
export const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;

/** Sum og antall uttak per kategori i et kalenderår, og siste uttak */
export function aarsforbruk(u: Utstyr[], ansattId: string, aar: number) {
  const egne = u.filter((x) => x.ansatt_id === ansattId && x.dato.startsWith(`${aar}`));
  const per = (k: UtstyrKategori) => {
    const r = egne.filter((x) => x.kategori === k);
    return { sum: r.reduce((n, x) => n + verdi(x), 0), uttak: new Set(r.map((x) => `${x.visma_ordrenr ?? x.id}`)).size, siste: r.reduce<string | null>((m, x) => (!m || x.dato > m ? x.dato : m), null) };
  };
  return { verktoy: per("verktoy"), arbeidstoy: per("arbeidstoy"), verneutstyr: per("verneutstyr"), forbruk: per("forbruk") };
}

/** Kvotene for en ansatt: hvor mange som er tatt ut i perioden, og når neste blir ledig */
export function kvotestatus(u: Utstyr[], ansattId: string, kvoter: Kvoter, idag: string) {
  return PLAGG.filter((p) => kvoter[p.type]?.antall > 0).map((p) => {
    const k = kvoter[p.type];
    const fra = addMonths(idag, -12 * k.aar);
    const r = u.filter((x) => x.ansatt_id === ansattId && x.kategori === (p.kategori ?? "arbeidstoy") && x.dato > fra && plaggtype(x.beskrivelse, x.kategori) === p.type)
      .sort((a, b) => a.dato.localeCompare(b.dato));
    const brukt = r.reduce((n, x) => n + Math.max(1, Math.round(x.antall)), 0);
    // Når det eldste uttaket faller ut av perioden, blir en ny ledig
    const ledigFra = brukt >= k.antall && r[0] ? addMonths(r[0].dato, 12 * k.aar) : null;
    return { type: p.type, navn: p.navn, brukt, maks: k.antall, aar: k.aar, over: brukt > k.antall, fullt: brukt >= k.antall, ledigFra, siste: r[r.length - 1]?.dato ?? null };
  });
}

/** Hva slags håndverktøy (første kjente ord), brukt for «nytt mot gammelt» */
const VERKTOYORD = ["HAMMER", "VATER", "MÅLEBÅND", "TOMMESTOKK", "METERSTOKK", "KNIV", "HUGGJERN", "MEISEL", "TANG", "SAKS", "SKRUJERN", "KOBEN", "BREKKJERN", "SPARKEL", "SAG", "TVINGE", "LYKT", "HOLDER"];
export function verktoytype(beskrivelse: string) {
  const b = beskrivelse.toUpperCase();
  if (/BLAD|BOR /.test(b)) return null;
  // Batterimaskiner: sammenlign på modell (f.eks. WHP18DA)
  const modell = b.match(/\b([A-Z]{1,4}\d{2,3}[A-Z]{1,4})\b/);
  if (modell && /KM|HSC|BATTERI|MASKIN/.test(b)) return `M:${modell[1]}`;
  if (/KOMBIHAMMER|SLAGSKRUTREKKER|SIRKELSAG|DRILL|SLIPER|BLÅSE|HØVEL/.test(b)) return null;
  return VERKTOYORD.find((o) => b.includes(o)) ?? null;
}

/** Nytt håndverktøy av et slag den ansatte allerede har i bruk: [gammelt, nytt] som ikke er avklart */
export function nyttMotGammelt(u: Utstyr[], ansattId: string) {
  const egne = u.filter((x) => x.ansatt_id === ansattId && x.kategori === "verktoy").sort((a, b) => a.dato.localeCompare(b.dato) || a.id.localeCompare(b.id));
  const ut: [Utstyr, Utstyr][] = [];
  egne.forEach((ny, i) => {
    if (ny.bytte_avklart) return;
    const t = verktoytype(ny.beskrivelse);
    if (!t) return;
    const gammel = egne.slice(0, i).reverse().find((g) => g.status === "i_bruk" && g.dato < ny.dato && verktoytype(g.beskrivelse) === t);
    if (gammel) ut.push([gammel, ny]);
  });
  return ut;
}

/** Andel av grensen brukt (0–1+), eller null når det ikke er satt grense */
export const andel = (sum: number, grense: number | null) => (grense ? sum / grense : null);
