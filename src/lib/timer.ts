// Timeføring og lønnsgrunnlag: normaltid, overtid og lunsjtrekk.
// Rene funksjoner, så reglene kan testes.
import { addDays, helligdag, ukedag, type Ansatt, type Data } from "./ferie";

export interface Kunde { id: string; visma_nr: number | null; navn: string; adresse: string; postnr: string; poststed: string; telefon: string; epost: string; aktiv: boolean }
export interface Prosjekt { id: string; visma_nr: number | null; navn: string; kunde_id: string | null; adresse: string; estimert_timer: number | null; start: string | null; slutt: string | null; aktiv: boolean }
export interface Time {
  id: string; ansatt_id: string; prosjekt_id: string | null; dato: string;
  fra: string; til: string; lunsj_min: number; timer: number; lunsj_unntak: boolean;
  km: number; reisetid: number; beskrivelse: string; status: "levert" | "godkjent";
}
export type NyTime = Omit<Time, "id" | "timer" | "lunsj_unntak" | "status"> & { id?: string };

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

export interface LonnTimer { ansatt: Ansatt; normal: number; ot50: number; ot100: number; km: number; reisetid: number; lunsjtrekk: number; avvik: string[]; ikkeGodkjent: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lonnTimer(d: Data, a: Ansatt, fra: string, til: string): LonnTimer {
  const dager = lonnsdager(a, d.timer, fra, til);
  const s = (f: (x: Dag) => number) => r2(dager.reduce((n, x) => n + f(x), 0));
  return {
    ansatt: a, normal: s((x) => x.normal), ot50: s((x) => x.ot50), ot100: s((x) => x.ot100),
    km: s((x) => x.km), reisetid: s((x) => x.reisetid), lunsjtrekk: s((x) => x.lunsjtrekk),
    avvik: dager.filter((x) => x.lunsjavvik).map((x) => x.dato),
    ikkeGodkjent: d.timer.filter((t) => t.ansatt_id === a.id && t.dato >= fra && t.dato <= til && t.status !== "godkjent").length,
  };
}

/** Timer brukt per prosjekt */
export function prosjektTimer(d: Data) {
  const m = new Map<string, number>();
  for (const t of d.timer) if (t.prosjekt_id) m.set(t.prosjekt_id, (m.get(t.prosjekt_id) ?? 0) + Number(t.timer));
  return m;
}
