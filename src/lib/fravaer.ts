// Sykefravær: egenmelding, sykmelding og sykt barn – regler fra folketrygdloven kapittel 8 og 9.
import { addDays, helligdag } from "./ferie";

export type FravaerType = "egenmelding" | "sykmelding" | "sykt_barn";
export interface Fravaer { id: string; ansatt_id: string; type: FravaerType; fra: string; til: string; grad: number; merknad: string; opprettet: string }
export const FRAVAER_TYPE: Record<FravaerType, string> = { egenmelding: "Egenmelding", sykmelding: "Sykmelding", sykt_barn: "Sykt barn" };

const ms = (iso: string) => Date.parse(iso + "T00:00:00Z");
/** Kalenderdager i perioden, begge dager med */
export const kalenderdager = (fra: string, til: string) => Math.round((ms(til) - ms(fra)) / 864e5) + 1;

/** Arbeidsdager (man–fre, ikke helligdag) i perioden, ev. avgrenset til [fraGrense, tilGrense] */
export function arbeidsdager(fra: string, til: string, fraGrense?: string, tilGrense?: string) {
  const a = fraGrense && fraGrense > fra ? fraGrense : fra, b = tilGrense && tilGrense < til ? tilGrense : til;
  let n = 0;
  for (let x = a; x <= b; x = addDays(x, 1)) { const wd = new Date(x + "T00:00:00Z").getUTCDay(); if (wd !== 0 && wd !== 6 && !helligdag(x)) n++; }
  return n;
}

/** Er den ansatte borte (syk) denne dagen? */
export const fravaerPaa = (f: Fravaer[], ansattId: string, iso: string) => f.find((x) => x.ansatt_id === ansattId && x.fra <= iso && x.til >= iso);

/** Egenmeldinger siste 12 måneder: antall ganger og dager */
export function egenmeldinger(f: Fravaer[], ansattId: string, idag: string) {
  const grense = addDays(idag, -365);
  const egne = f.filter((x) => x.ansatt_id === ansattId && x.type === "egenmelding" && x.til > grense);
  return { ganger: egne.length, dager: egne.reduce((n, x) => n + kalenderdager(x.fra, x.til), 0) };
}

/** Dager med sykt barn i et kalenderår (rett: 10 dager, 15 med mer enn to barn, dobbelt for alenefar/-mor) */
export const syktBarnDager = (f: Fravaer[], ansattId: string, aar: number) =>
  f.filter((x) => x.ansatt_id === ansattId && x.type === "sykt_barn" && x.fra.startsWith(`${aar}-`)).reduce((n, x) => n + arbeidsdager(x.fra, x.til), 0);

/**
 * Arbeidsgiverperioden for det siste sykefraværet: arbeidsgiver betaler de første 16 kalenderdagene.
 * Fravær med mindre enn 16 dager mellom seg regnes sammen. Returnerer brukte dager og når NAV overtar.
 */
export function arbeidsgiverperiode(f: Fravaer[], ansattId: string) {
  const syk = f.filter((x) => x.ansatt_id === ansattId && x.type !== "sykt_barn").sort((a, b) => a.fra.localeCompare(b.fra));
  if (!syk.length) return null;
  // Finn kjeden som slutter med det siste fraværet
  let start = syk.length - 1;
  while (start > 0 && kalenderdager(syk[start - 1].til, syk[start].fra) - 2 < 16) start--;
  let brukt = 0, navFra: string | null = null;
  for (const x of syk.slice(start)) {
    for (let dag = x.fra; dag <= x.til; dag = addDays(dag, 1)) {
      brukt++;
      if (brukt === 17) { navFra = dag; break; }
    }
    if (navFra) break;
  }
  return { dager: Math.min(brukt, 16), navFra, fra: syk[start].fra, til: syk[syk.length - 1].til };
}
