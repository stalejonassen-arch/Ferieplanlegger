import { arbeidsdager } from "./fravaer";
// Timeføring og lønnsgrunnlag: normaltid, overtid og lunsjtrekk.
// Rene funksjoner, så reglene kan testes.
import { addDays, helligdag, ukedag, type Ansatt, type Data } from "./ferie";

export interface Kunde { id: string; visma_nr: number | null; navn: string; adresse: string; postnr: string; poststed: string; telefon: string; epost: string; aktiv: boolean }
export interface Prosjekt { id: string; visma_nr: number | null; navn: string; kunde_id: string | null; adresse: string; estimert_timer: number | null; start: string | null; slutt: string | null; aktiv: boolean; planlagt_start?: string | null; planlagt_slutt?: string | null; notat?: string }
export interface Time {
  id: string; ansatt_id: string; prosjekt_id: string | null; dato: string;
  fra: string; til: string; lunsj_min: number; timer: number; lunsj_unntak: boolean;
  km: number; reisetid: number; beskrivelse: string; status: "levert" | "godkjent"; fakturerbar?: boolean;
  /** stempel = logget inn/ut i sanntid, manuell = ført i etterkant, endret = stempel som er rettet */
  kilde?: "stempel" | "manuell" | "endret";
}
/** Pågående innlogging på jobb */
export interface Stempling { ansatt_id: string; prosjekt_id: string | null; dato: string; fra: string; startet: string }
export type NyTime = Omit<Time, "id" | "timer" | "lunsj_unntak" | "status" | "kilde"> & { id?: string };

/** Pause etter arbeidsmiljøloven § 10-9: rett på pause når arbeidstiden er over 5,5 timer. */
export const LUNSJGRENSE = 5.5;

export const normaltid = (a: Ansatt) => a.normaltid_uke ?? 37.5;

const minutter = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
/** Arbeidstid i timer, uten lunsj. Samme regel som databasen. */
export const varighet = (fra: string, til: string, lunsj = 0) => Math.round(((minutter(til) - minutter(fra) - lunsj) / 60) * 100) / 100;
export const hhmm = (s: string) => s.slice(0, 5);
export const t2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Mandag i uka datoen tilhører */
export const mandag = (iso: string) => addDays(iso, -((ukedag(iso) + 6) % 7));
export function ukenr(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const torsdag = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 864e5);
  const jan1 = Date.UTC(torsdag.getUTCFullYear(), 0, 1);
  return Math.floor((torsdag.getTime() - jan1) / 864e5 / 7) + 1;
}
/** Søndag og helligdager gir 100 % overtid */
export const helg100 = (iso: string) => ukedag(iso) === 0 || !!helligdag(iso);

export interface Dag {
  dato: string;
  /** Registrert arbeidstid, før eventuelt lunsjtrekk */
  timer: number;
  /** Lunsj som trekkes fordi den ikke er registrert (timer) */
  lunsjtrekk: number;
  /** Mangler lunsj og leder har ikke godkjent unntak */
  lunsjavvik: boolean;
  normal: number; ot50: number; ot100: number;
  km: number; reisetid: number;
}

/**
 * Lønnsgrunnlag per dag for én ansatt.
 * Overtid regnes per uke (mandag–søndag): timer over normaltiden i uka blir 50 %,
 * alle timer på søndag og helligdager blir 100 %.
 * For ansatte med lunsjtrekk trekkes lunsj på dager over 5,5 timer uten registrert lunsj,
 * med mindre leder har godkjent dagen som unntak.
 */
export function lonnsdager(a: Ansatt, timer: Time[], fra: string, til: string): Dag[] {
  const egne = timer.filter((t) => t.ansatt_id === a.id);
  const ut: Dag[] = [];
  // Start på mandag så ukas overtid blir riktig selv om perioden starter midt i uka
  for (let uke = mandag(fra); uke <= til; uke = addDays(uke, 7)) {
    let ordinaer = 0;
    for (let i = 0; i < 7; i++) {
      const dato = addDays(uke, i);
      const dagens = egne.filter((t) => t.dato === dato);
      if (!dagens.length) continue;
      const sum = dagens.reduce((n, t) => n + Number(t.timer), 0);
      const lunsj = dagens.reduce((n, t) => n + t.lunsj_min, 0);
      const unntak = dagens.some((t) => t.lunsj_unntak);
      const mangler = !!a.lunsjtrekk && lunsj === 0 && sum > LUNSJGRENSE;
      const trekk = mangler && !unntak ? (a.lunsj_min ?? 30) / 60 : 0;
      const netto = Math.max(0, sum - trekk);
      let normal = 0, ot50 = 0, ot100 = 0;
      if (helg100(dato)) ot100 = netto;
      else {
        const plass = Math.max(0, normaltid(a) - ordinaer);
        normal = Math.min(netto, plass);
        ot50 = netto - normal;
        ordinaer += netto;
      }
      if (dato >= fra && dato <= til) {
        ut.push({
          dato, timer: sum, lunsjtrekk: trekk, lunsjavvik: mangler && !unntak, normal, ot50, ot100,
          km: dagens.reduce((n, t) => n + Number(t.km), 0), reisetid: dagens.reduce((n, t) => n + Number(t.reisetid), 0),
        });
      }
    }
  }
  return ut;
}

export interface LonnTimer { ansatt: Ansatt; normal: number; ot50: number; ot100: number; km: number; reisetid: number; lunsjtrekk: number; avvik: string[]; ikkeGodkjent: number;
  /** Arbeidsdager med fravær i perioden */
  egenmelding: number; sykmelding: number; syktBarn: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

function fravaerDager(d: Data, ansattId: string, fra: string, til: string) {
  const ut = { egenmelding: 0, sykmelding: 0, syktBarn: 0 };
  for (const x of d.fravaer ?? []) {
    if (x.ansatt_id !== ansattId || x.til < fra || x.fra > til) continue;
    const n = arbeidsdager(x.fra, x.til, fra, til);
    if (x.type === "egenmelding") ut.egenmelding += n; else if (x.type === "sykmelding") ut.sykmelding += n; else ut.syktBarn += n;
  }
  return ut;
}

export function lonnTimer(d: Data, a: Ansatt, fra: string, til: string): LonnTimer {
  const dager = lonnsdager(a, d.timer, fra, til);
  const s = (f: (x: Dag) => number) => r2(dager.reduce((n, x) => n + f(x), 0));
  return {
    ansatt: a, normal: s((x) => x.normal), ot50: s((x) => x.ot50), ot100: s((x) => x.ot100),
    km: s((x) => x.km), reisetid: s((x) => x.reisetid), lunsjtrekk: s((x) => x.lunsjtrekk),
    avvik: dager.filter((x) => x.lunsjavvik).map((x) => x.dato),
    ikkeGodkjent: d.timer.filter((t) => t.ansatt_id === a.id && t.dato >= fra && t.dato <= til && t.status !== "godkjent").length,
    ...fravaerDager(d, a.id, fra, til),
  };
}

/** Fakturerbare timer per måned (1–12) i et år */
export function fakturertPerMnd(timer: Time[], aar: number) {
  const ut = Array(12).fill(0) as number[];
  for (const t of timer) if (t.fakturerbar !== false && t.prosjekt_id && t.dato.startsWith(`${aar}-`)) ut[Number(t.dato.slice(5, 7)) - 1] += Number(t.timer);
  return ut.map((n) => Math.round(n * 100) / 100);
}

/** Timer brukt per prosjekt */
export function prosjektTimer(d: Data) {
  const m = new Map<string, number>();
  for (const t of d.timer) if (t.prosjekt_id) m.set(t.prosjekt_id, (m.get(t.prosjekt_id) ?? 0) + Number(t.timer));
  return m;
}

export interface Fordeling { fakturerbart: number; ikkeFakturerbart: number; intern: number; sum: number }

/** Timer per måned (1–12) fordelt på fakturerbart prosjekt, ikke-fakturerbart prosjekt og interntid. */
export function fordelingPerMnd(timer: Time[], aar: number, ansatte?: Set<string>): Fordeling[] {
  const ut = Array.from({ length: 12 }, () => ({ fakturerbart: 0, ikkeFakturerbart: 0, intern: 0, sum: 0 }));
  for (const t of timer) {
    if (!t.dato.startsWith(`${aar}-`) || (ansatte && !ansatte.has(t.ansatt_id))) continue;
    const m = ut[Number(t.dato.slice(5, 7)) - 1], n = Number(t.timer);
    if (!t.prosjekt_id) m.intern += n; else if (t.fakturerbar === false) m.ikkeFakturerbart += n; else m.fakturerbart += n;
    m.sum += n;
  }
  return ut.map((m) => ({ fakturerbart: r2(m.fakturerbart), ikkeFakturerbart: r2(m.ikkeFakturerbart), intern: r2(m.intern), sum: r2(m.sum) }));
}

/** Samme fordeling per ansatt for én måned (YYYY-MM). */
export function fordelingPerAnsatt(timer: Time[], mnd: string) {
  const per = new Map<string, Fordeling>();
  for (const t of timer) {
    if (!t.dato.startsWith(`${mnd}-`)) continue;
    const m = per.get(t.ansatt_id) ?? { fakturerbart: 0, ikkeFakturerbart: 0, intern: 0, sum: 0 }, n = Number(t.timer);
    if (!t.prosjekt_id) m.intern += n; else if (t.fakturerbar === false) m.ikkeFakturerbart += n; else m.fakturerbart += n;
    m.sum += n;
    per.set(t.ansatt_id, m);
  }
  return per;
}

/** Andel (0–100) av timene som er interntid */
export const andelIntern = (f: Fordeling) => (f.sum ? Math.round((f.intern / f.sum) * 100) : 0);

/** Siste dato med aktivitet (timer eller dagbok) per prosjekt */
export function sistAktiv(d: Pick<Data, "timer" | "dagbok">) {
  const m = new Map<string, string>();
  const sett = (id: string | null, dato: string) => { if (id && dato > (m.get(id) ?? "")) m.set(id, dato); };
  for (const t of d.timer) sett(t.prosjekt_id, t.dato);
  for (const x of d.dagbok) sett(x.prosjekt_id, x.dato);
  return m;
}

/** Rund av klokkeslett (HH:MM) til nærmeste kvarter */
export function kvarter(d: Date) {
  let min = Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  if (min >= 24 * 60) min = 24 * 60 - 15;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Hverdager fra mandag til i går uten timer, ferie eller helligdag. */
export function dagerUtenTimer(ansattId: string, d: Pick<Data, "timer" | "soknader"> & { fravaer?: Data["fravaer"] }, fra: string, idag: string, helligdag: (iso: string) => string | undefined) {
  const ut: string[] = [];
  const ferie = [...d.soknader.filter((s) => s.ansatt_id === ansattId && s.status === "godkjent"), ...(d.fravaer ?? []).filter((x) => x.ansatt_id === ansattId)];
  const fort = new Set(d.timer.filter((t) => t.ansatt_id === ansattId).map((t) => t.dato));
  for (let i = 0; i < 7; i++) {
    const dt = new Date(fra + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + i);
    const iso = dt.toISOString().slice(0, 10), wd = dt.getUTCDay();
    if (iso >= idag) break;
    if (wd === 0 || wd === 6 || helligdag(iso) || fort.has(iso) || ferie.some((s) => s.fra <= iso && s.til >= iso)) continue;
    ut.push(iso);
  }
  return ut;
}

/** De sist brukte prosjektene for en ansatt (nyeste først) */
export function sisteProsjekter(timer: Time[], ansattId: string, antall = 4) {
  const sortert = timer.filter((t) => t.ansatt_id === ansattId && t.prosjekt_id).sort((a, b) => (b.dato + b.fra).localeCompare(a.dato + a.fra));
  return [...new Set(sortert.map((t) => t.prosjekt_id as string))].slice(0, antall);
}
