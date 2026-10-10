import type { Lesing, Rapport } from "./rapport";
import type { Stempling } from "./timer";
import type { Fravaer } from "./fravaer";
// Ferieregler for N L Austnes AS: datoer, helligdager, saldo og regelsjekk.
// Rene funksjoner uten tilstand, så de kan testes og brukes overalt.

import type { Kunde, Prosjekt, Time } from "./timer";
import type { Avvik, Bilde, Dagbok, Tillegg } from "./hms";

export type Status = "venter" | "godkjent" | "avslatt";
export type Rolle = "ansatt" | "leder";

export interface Avdeling { id: number; navn: string; maks_borte: number; rekkefolge: number }
export interface Ansatt {
  id: string; navn: string; epost: string | null; avdeling_id: number; rolle: Rolle;
  dager: number; over60: boolean; aktiv: boolean; rekkefolge: number;
  /** Normal arbeidstid per uke (37,5 eller 40) */
  normaltid_uke?: number;
  /** Trekkes for lunsj */
  lunsjtrekk?: boolean;
  /** Ansattnummer som i Svenn/lønnssystemet */
  ansattnr?: string | null;
  /** Telles med i oversikten over kundetimer og interntid */
  i_timerapport?: boolean;
  lunsj_min?: number;
}
export interface Ferieaar { ansatt_id: string; aar: number; overfort: number }
export interface Soknad {
  id: string; ansatt_id: string; fra: string; til: string; merknad: string; status: Status;
  kommentar: string; behandlet_av: string | null; behandlet_tid: string | null; opprettet: string;
}
export interface Data {
  avdelinger: Avdeling[]; ansatte: Ansatt[]; ferieaar: Ferieaar[]; soknader: Soknad[];
  kunder: Kunde[]; prosjekter: Prosjekt[]; timer: Time[];
  avvik: Avvik[]; bilder: Bilde[]; dagbok: Dagbok[]; tillegg: Tillegg[];
  rapporter: Rapport[]; lest: Lesing[];
  stempling: Stempling[];
  fravaer: Fravaer[];
  /** Regler for egenmelding (per gang / ganger per 12 måneder) */
  egenmelding?: { maksDager: number; maksGanger: number };
  /** Mål for fakturerte timer i året */
  maal?: number;
}

/** «1 feriedag», «2 feriedager» */
export const vd = (n: number) => `${n} ${Math.abs(n) === 1 ? "feriedag" : "feriedager"}`;

/** Hovedferie: 18 virkedager etter loven = 3 uker = 15 feriedager (man–fre). */
export const HOVEDFERIE = 15;

export type Sjekk = { niva: "ok" | "advarsel" | "feil" | "info"; tekst: string };

// ---------------------------------------------------------------- Datoer

export const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
export const UKEDAG = ["S", "M", "T", "O", "T", "F", "L"];

const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toUTC = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (iso: string, n: number) => fromUTC(toUTC(iso) + n * 864e5);
export const addMonths = (iso: string, n: number) => { const d = new Date(toUTC(iso)); d.setUTCMonth(d.getUTCMonth() + n); return fromUTC(d.getTime()); };
export const ukedag = (iso: string) => new Date(toUTC(iso)).getUTCDay();
export const aarAv = (iso: string) => Number(iso.slice(0, 4));
export function kortDato(iso: string) { const [, m, d] = iso.split("-").map(Number); return `${d}. ${MND[m - 1].slice(0, 3)}.`; }
export const langDato = (iso: string) => `${kortDato(iso)} ${iso.slice(0, 4)}`;
export const periode = (fra: string, til: string) => fra === til ? langDato(fra) : `${kortDato(fra)} – ${langDato(til)}`;

export function paaskedag(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(mo)}-${pad(da)}`;
}

const helligCache = new Map<number, Map<string, string>>();
export function helligdager(y: number) {
  let m: Map<string, string> | undefined = helligCache.get(y);
  if (m) return m;
  const e = paaskedag(y);
  m = new Map();
  const liste: [string, string][] = [
    [`${y}-01-01`, "1. nyttårsdag"], [addDays(e, -3), "Skjærtorsdag"], [addDays(e, -2), "Langfredag"],
    [e, "1. påskedag"], [addDays(e, 1), "2. påskedag"], [`${y}-05-01`, "Arbeidernes dag"],
    [`${y}-05-17`, "Grunnlovsdag"], [addDays(e, 39), "Kristi himmelfartsdag"], [addDays(e, 49), "1. pinsedag"],
    [addDays(e, 50), "2. pinsedag"], [`${y}-12-25`, "1. juledag"], [`${y}-12-26`, "2. juledag"],
  ];
  // Noen år faller to helligdager på samme dato (f.eks. 17. mai og 2. pinsedag i 2027)
  for (const [dato, navn] of liste) m.set(dato, m.has(dato) ? `${m.get(dato)} og ${navn}` : navn);
  helligCache.set(y, m);
  return m;
}
export const helligdag = (iso: string) => helligdager(aarAv(iso)).get(iso);

/** N L Austnes teller feriedager mandag–fredag: lørdag, søndag og helligdager trekkes ikke.
 *  (Ferieloven teller lørdag; 25 virkedager etter loven tilsvarer ca. 21 dager man–fre.) */
export const erVirkedag = (iso: string) => ukedag(iso) !== 0 && ukedag(iso) !== 6 && !helligdag(iso);

export function hverDag(fra: string, til: string, fn: (d: string) => void) {
  for (let d = fra; d <= til; d = addDays(d, 1)) fn(d);
}
export function virkedager(fra: string, til: string, kunAar?: number) {
  let n = 0;
  hverDag(fra, til, (d) => { if (erVirkedag(d) && (!kunAar || aarAv(d) === kunAar)) n++; });
  return n;
}
/** Virkedager i hovedferieperioden 1. juni–30. september (ferieloven § 7 nr. 1). */
export function hovedferieDager(fra: string, til: string, y: number) {
  const s = `${y}-06-01`, e = `${y}-09-30`;
  const a = fra < s ? s : fra, b = til > e ? e : til;
  return a > b ? 0 : virkedager(a, b);
}

// ---------------------------------------------------------------- Saldo

export function ferierett(a: Ansatt, y: number, ferieaar: Ferieaar[]) {
  const overfort = ferieaar.find((f) => f.ansatt_id === a.id && f.aar === y)?.overfort ?? 0;
  return { grunn: a.dager || 25, ekstra60: a.over60 ? 5 : 0, overfort, total: (a.dager || 25) + (a.over60 ? 5 : 0) + overfort };
}

export interface Saldo { total: number; godkjent: number; venter: number; igjen: number; hovedferie: number }

export function saldo(a: Ansatt, y: number, d: Pick<Data, "soknader" | "ferieaar">, unntaId?: string): Saldo {
  let godkjent = 0, venter = 0, hovedferie = 0;
  for (const s of d.soknader) {
    if (s.ansatt_id !== a.id || s.status === "avslatt" || s.id === unntaId) continue;
    if (s.til < `${y}-01-01` || s.fra > `${y}-12-31`) continue;
    const n = virkedager(s.fra, s.til, y);
    if (s.status === "godkjent") godkjent += n; else venter += n;
    hovedferie += hovedferieDager(s.fra, s.til, y);
  }
  const total = ferierett(a, y, d.ferieaar).total;
  return { total, godkjent, venter, igjen: total - godkjent - venter, hovedferie };
}

export const borteDag = (soknader: Soknad[], iso: string) =>
  soknader.filter((s) => s.status !== "avslatt" && s.fra <= iso && s.til >= iso);

// ---------------------------------------------------------------- Regelsjekk

export function regelsjekk(
  d: Data, a: Ansatt, fra: string, til: string, idag: string,
  opt: { unntaId?: string; du?: boolean } = {},
): Sjekk[] {
  const ut: Sjekk[] = [];
  const du = opt.du ?? true;
  const hen = du ? "du" : a.navn;
  if (!fra || !til) return ut;
  if (til < fra) return [{ niva: "feil", tekst: "Sluttdato er før startdato." }];
  if (aarAv(fra) !== aarAv(til)) return [{ niva: "feil", tekst: "Del opp ferie over nyttår i to søknader, én for hvert ferieår." }];

  const y = aarAv(fra), n = virkedager(fra, til);
  if (n === 0) return [{ niva: "feil", tekst: "Perioden har ingen feriedager (bare helg eller helligdager)." }];
  ut.push({ niva: "info", tekst: `${vd(n)} trekkes. Lørdager, søndager og helligdager teller ikke.` });
  const hd: string[] = [];
  hverDag(fra, til, (x) => { const h = helligdag(x); if (h) hd.push(h); });
  if (hd.length) ut.push({ niva: "info", tekst: `Helligdager som ikke trekkes: ${hd.join(", ")}.` });

  const egne = d.soknader.filter((s) => s.ansatt_id === a.id && s.status !== "avslatt" && s.id !== opt.unntaId && s.fra <= til && s.til >= fra);
  if (egne.length) ut.push({ niva: "feil", tekst: `Overlapper med en annen søknad (${periode(egne[0].fra, egne[0].til)}).` });

  const sd = saldo(a, y, d, opt.unntaId);
  if (n > sd.igjen) {
    ut.push({ niva: "feil", tekst: `${du ? "Du" : a.navn} har ${vd(sd.igjen)} igjen i ${y}, søknaden er på ${n}. Ferie utover retten må avtales som ulønnet permisjon eller forskudd.` });
  } else {
    ut.push({ niva: "ok", tekst: `Innenfor saldo. ${vd(sd.igjen - n)} igjen etter denne.` });
  }

  if (fra < idag) ut.push({ niva: "advarsel", tekst: "Perioden starter tilbake i tid." });
  else if (fra < addMonths(idag, 2)) ut.push({ niva: "advarsel", tekst: `Mindre enn 2 måneders varsel. Ansatte har rett til å få vite ferietidspunktet senest 2 måneder før, så dette krever enighet med leder (ferieloven § 6).` });
  else ut.push({ niva: "ok", tekst: "Minst 2 måneders varsel." });

  const hf = hovedferieDager(fra, til, y);
  if (hf > 0) {
    const tot = sd.hovedferie + hf;
    ut.push({ niva: tot >= HOVEDFERIE ? "ok" : "info", tekst: `Hovedferie 1. juni–30. september: ${Math.min(tot, HOVEDFERIE)} av ${HOVEDFERIE} feriedager (3 uker) ${hen} kan kreve.` });
  }

  const avd = d.avdelinger.find((x) => x.id === a.avdeling_id);
  if (avd) {
    const kolleger = d.ansatte.filter((x) => x.aktiv && x.avdeling_id === avd.id && x.id !== a.id);
    const konflikt = new Set<string>();
    hverDag(fra, til, (x) => {
      if (!erVirkedag(x)) return;
      const samme = borteDag(d.soknader, x).filter((s) => s.id !== opt.unntaId && s.ansatt_id !== a.id && kolleger.some((k) => k.id === s.ansatt_id));
      if (samme.length + 1 > avd.maks_borte) samme.forEach((s) => konflikt.add(d.ansatte.find((k) => k.id === s.ansatt_id)?.navn ?? "?"));
    });
    if (konflikt.size) ut.push({ niva: "advarsel", tekst: `${avd.navn}: maks ${avd.maks_borte} borte samtidig. Overlapper med ${[...konflikt].join(", ")}.` });
    else if (!kolleger.length) ut.push({ niva: "info", tekst: `${hen === "du" ? "Du" : a.navn} er alene i ${avd.navn}. Avtal hvem som tar henvendelser i perioden.` });
    else ut.push({ niva: "ok", tekst: `Bemanningen i ${avd.navn} holder.` });
  }
  return ut;
}

export const harFeil = (s: Sjekk[]) => s.some((x) => x.niva === "feil");

export function sorterAnsatte(d: Pick<Data, "ansatte" | "avdelinger">) {
  const rek = (id: number) => d.avdelinger.find((x) => x.id === id)?.rekkefolge ?? 99;
  return [...d.ansatte].sort((a, b) => rek(a.avdeling_id) - rek(b.avdeling_id) || a.rekkefolge - b.rekkefolge || a.navn.localeCompare(b.navn, "nb"));
}
