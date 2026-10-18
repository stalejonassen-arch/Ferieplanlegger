// Reklamasjon: kunden melder feil eller mangel på en ferdig jobb.
import type { Time } from "./timer";

export type ReklamasjonStatus = "ny" | "godkjent" | "avvist" | "utbedret";
export interface Reklamasjon {
  id: string; prosjekt_id: string; meldt_av: string | null; meldt_dato: string; kontakt: string; tittel: string; beskrivelse: string;
  status: ReklamasjonStatus; vurdering: string; ansvarlig_id: string | null; frist: string | null; materiell_kost: number | null;
  behandlet_av: string | null; utbedret_av: string | null; utbedret_tid: string | null;
  signert_navn: string; signatur: string; signert_tid: string | null; opprettet: string; endret: string;
}
export type NyReklamasjon = Partial<Omit<Reklamasjon, "meldt_av" | "opprettet" | "endret" | "behandlet_av" | "utbedret_av" | "utbedret_tid" | "signert_tid">>;

export const REKLAMASJON_STATUS: Record<ReklamasjonStatus, string> = {
  ny: "Ny – ikke vurdert", godkjent: "Godkjent – skal utbedres", avvist: "Avvist", utbedret: "Utbedret",
};
export const REKLAMASJON_CHIP: Record<ReklamasjonStatus, string> = { ny: "venter", godkjent: "venter", avvist: "avslatt", utbedret: "godkjent" };
export const aapenReklamasjon = (r: Pick<Reklamasjon, "status">) => r.status === "ny" || r.status === "godkjent";

/** Timer ført på reklamasjonen */
export const reklamasjonTimer = (timer: Pick<Time, "reklamasjon_id" | "timer">[], id: string) =>
  Math.round(timer.filter((t) => t.reklamasjon_id === id).reduce((n, t) => n + Number(t.timer), 0) * 100) / 100;

/** Hele år fra overlevering (prosjektets sluttdato) til kunden meldte fra */
export function aarEtterOverlevering(slutt: string | null | undefined, meldt: string): number | null {
  if (!slutt || meldt < slutt) return null;
  const [a, b] = [new Date(slutt + "T12:00:00"), new Date(meldt + "T12:00:00")];
  let aar = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) aar--;
  return aar;
}

/** Samlet for et år: antall, timer og materiell */
export function reklamasjonerIAar(liste: Reklamasjon[], timer: Pick<Time, "reklamasjon_id" | "timer">[], aar: number) {
  const iAar = liste.filter((r) => r.meldt_dato.startsWith(String(aar)));
  return {
    antall: iAar.length,
    avvist: iAar.filter((r) => r.status === "avvist").length,
    timer: Math.round(iAar.reduce((n, r) => n + reklamasjonTimer(timer, r.id), 0) * 100) / 100,
    materiell: iAar.reduce((n, r) => n + (r.materiell_kost ?? 0), 0),
  };
}
