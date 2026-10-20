// Serviceoppdrag: små betalte oppdrag hos en kunde, gjort på en dag (maks to).
import type { Time } from "./timer";

export type ServicePrioritet = "haster" | "uke" | "ledig";
export type ServiceStatus = "ny" | "planlagt" | "ferdig" | "fakturert" | "avvist";
export interface ServiceMateriell { beskrivelse: string; antall: number; enhet: string; nobb?: string; pris?: number }
export interface Serviceoppdrag {
  id: string; kunde_id: string | null; kunde_navn: string; telefon: string; epost: string; adresse: string;
  tittel: string; beskrivelse: string; prioritet: ServicePrioritet; status: ServiceStatus;
  ansvarlig_id: string | null; dato: string | null; dager: number; kilde: "app" | "skjema"; registrert_av: string | null;
  materiell: ServiceMateriell[]; merknad: string; ferdig_av: string | null; ferdig_tid: string | null;
  visma_ordrenr: string; fakturert_tid: string | null; signert_navn: string; signatur: string; signert_tid: string | null;
  opprettet: string; endret: string;
}
export type NyService = Partial<Serviceoppdrag> & { tittel: string };

export const PRIORITET: Record<ServicePrioritet, string> = { haster: "Haster", uke: "Denne uken", ledig: "Når det passer" };
export const PRIORITET_IKON: Record<ServicePrioritet, string> = { haster: "🔴", uke: "🟡", ledig: "⚪" };
export const SERVICE_STATUS: Record<ServiceStatus, string> = { ny: "Ny", planlagt: "Planlagt", ferdig: "Ferdig – fakturer", fakturert: "Fakturert", avvist: "Avvist" };
export const SERVICE_CHIP: Record<ServiceStatus, string> = { ny: "venter", planlagt: "godkjent", ferdig: "demo", fakturert: "", avvist: "avslatt" };

export const aapenService = (s: Pick<Serviceoppdrag, "status">) => s.status === "ny" || s.status === "planlagt";

const PRI: Record<ServicePrioritet, number> = { haster: 0, uke: 1, ledig: 2 };
/** Åpne først, så etter hastegrad og dato */
export const sorterService = (a: Serviceoppdrag, b: Serviceoppdrag) =>
  Number(aapenService(b)) - Number(aapenService(a)) || PRI[a.prioritet] - PRI[b.prioritet]
  || (a.dato ?? "9999").localeCompare(b.dato ?? "9999") || a.opprettet.localeCompare(b.opprettet);

/** Siste dag oppdraget er planlagt (dato + 1 dag hvis det tar to) */
export function sisteDag(s: Pick<Serviceoppdrag, "dato" | "dager">) {
  if (!s.dato) return null;
  if (s.dager < 2) return s.dato;
  const d = new Date(`${s.dato}T12:00:00`); d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : d.getDay() === 6 ? 2 : 1));
  return d.toISOString().slice(0, 10);
}

/** Planlagt oppdrag som ikke er ferdig etter siste planlagte dag */
export const drarUt = (s: Serviceoppdrag, idag: string) => s.status === "planlagt" && !!sisteDag(s) && sisteDag(s)! < idag;

export const serviceTimer = (timer: Pick<Time, "service_id" | "timer">[], id: string) =>
  Math.round(timer.filter((t) => t.service_id === id).reduce((n, t) => n + Number(t.timer), 0) * 100) / 100;

/** Grunnlag for faktura: timer × timepris + materiell med pris */
export function grunnlag(s: Serviceoppdrag, timer: Pick<Time, "service_id" | "timer">[], timepris: number | null) {
  const t = serviceTimer(timer, s.id);
  const arbeid = timepris ? t * timepris : null;
  const materiell = s.materiell.reduce((n, m) => n + (m.pris ? m.pris * (m.antall || 1) : 0), 0);
  return { timer: t, arbeid, materiell, sum: (arbeid ?? 0) + materiell };
}

export const kundeNavn = (s: Serviceoppdrag, kunder: { id: string; navn: string }[]) =>
  (s.kunde_id && kunder.find((k) => k.id === s.kunde_id)?.navn) || s.kunde_navn || "Ukjent kunde";
