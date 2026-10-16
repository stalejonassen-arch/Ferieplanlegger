// Arbeidsplan (oppgaver delt ut til ansatte med fra–til-dato) og materialliste delt i leveranser.
import { addDays } from "./ferie";
import { mandag } from "./timer";

export type OppgaveStatus = "planlagt" | "pagaar" | "ferdig";
export interface Oppgave {
  id: string; prosjekt_id: string; tittel: string; beskrivelse: string; fra: string; til: string;
  ansatte: string[]; rekkefolge: number; status: OppgaveStatus; opprettet_av: string | null; ferdig_tid: string | null;
}
export type NyOppgave = Pick<Oppgave, "prosjekt_id" | "tittel" | "beskrivelse" | "fra" | "til" | "ansatte"> & { id?: string; rekkefolge?: number };

export type LeveranseStatus = "planlagt" | "bestilt" | "levert";
export interface Leveranse {
  id: string; prosjekt_id: string; navn: string; rekkefolge: number; dato: string | null;
  status: LeveranseStatus; leverandor: string; notat: string;
}
export type NyLeveranse = Pick<Leveranse, "prosjekt_id" | "navn" | "dato" | "leverandor" | "notat"> & { id?: string; rekkefolge?: number; status?: LeveranseStatus };

export interface Materiale {
  id: string; prosjekt_id: string; leveranse_id: string | null; rekkefolge: number; varenr: string; nobb_nr: string;
  beskrivelse: string; antall: number; enhet: string; notat: string; levert: boolean;
}
export type NyttMateriale = Pick<Materiale, "prosjekt_id" | "leveranse_id" | "beskrivelse" | "antall" | "enhet"> & Partial<Pick<Materiale, "id" | "varenr" | "nobb_nr" | "notat" | "rekkefolge">>;

export const OPPGAVE_STATUS: Record<OppgaveStatus, string> = { planlagt: "Planlagt", pagaar: "Pågår", ferdig: "Ferdig" };
export const LEVERANSE_STATUS: Record<LeveranseStatus, string> = { planlagt: "Planlagt", bestilt: "Bestilt", levert: "Levert" };

/** Oppgaver sortert i rekkefølge: først etter rekkefølge-tall, så startdato, så tittel */
export const sorterOppgaver = (o: Oppgave[]) =>
  [...o].sort((a, b) => a.rekkefolge - b.rekkefolge || a.fra.localeCompare(b.fra) || a.tittel.localeCompare(b.tittel, "nb"));

/** Oppgavene en ansatt har en bestemt dag */
export const oppgaverPaa = (o: Oppgave[], ansattId: string, dato: string) =>
  o.filter((x) => x.ansatte.includes(ansattId) && x.fra <= dato && x.til >= dato);

/** Dagene i uka (mandag–søndag) datoen hører til */
export const ukeDager = (dato: string) => { const m = mandag(dato); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); };

/** Er oppgaven forsinket (sluttdato passert uten at den er ferdig)? */
export const forsinket = (o: Oppgave, idag: string) => o.status !== "ferdig" && o.til < idag;

/** Leveranser i rekkefølge, med linjene som hører til; linjer uten leveranse samles til slutt */
export function grupperMateriell(lev: Leveranse[], mat: Materiale[]) {
  const sortert = [...lev].sort((a, b) => a.rekkefolge - b.rekkefolge || (a.dato ?? "9999").localeCompare(b.dato ?? "9999") || a.navn.localeCompare(b.navn, "nb"));
  const linjer = (id: string | null) => mat.filter((m) => m.leveranse_id === id).sort((a, b) => a.rekkefolge - b.rekkefolge || a.beskrivelse.localeCompare(b.beskrivelse, "nb"));
  const ut: { leveranse: Leveranse | null; linjer: Materiale[] }[] = sortert.map((l) => ({ leveranse: l, linjer: linjer(l.id) }));
  const uten = linjer(null).filter((m) => !lev.some((l) => l.id === m.leveranse_id));
  if (uten.length) ut.push({ leveranse: null, linjer: uten });
  return ut;
}

/** Materiallinjer fra Visma-forbruket som ikke allerede står i listen (samme varenummer) */
export function nyeFraVisma(varer: { varenr: string; beskrivelse: string; antall: number; enhet: string; nobb_nr?: string }[], mat: Materiale[]) {
  const finnes = new Set(mat.map((m) => m.varenr).filter(Boolean));
  return varer.filter((v) => v.varenr && !finnes.has(v.varenr));
}
