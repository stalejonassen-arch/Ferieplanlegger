// Månedsrapporter til de ansatte.
export interface Rapport {
  id: string; tittel: string; periode: string; ingress: string; lenke: string; sti: string;
  publisert: string | null; opprettet: string;
}
export interface Lesing { rapport_id: string; ansatt_id: string; lest: string }
export type NyRapport = { id?: string; tittel: string; periode: string; ingress: string; lenke: string; fil?: File | null; publiser: boolean };

/** Rapporter den ansatte ikke har lest ennå (bare publiserte). */
export function uleste(rapporter: Rapport[], lest: Lesing[], ansattId: string) {
  const sett = new Set(lest.filter((l) => l.ansatt_id === ansattId).map((l) => l.rapport_id));
  return rapporter.filter((r) => r.publisert && !sett.has(r.id));
}

/** Hvem har lest og hvem mangler, blant aktive ansatte. */
export function lesestatus<A extends { id: string; navn: string; aktiv: boolean }>(r: Rapport, lest: Lesing[], ansatte: A[]) {
  const per = new Map(lest.filter((l) => l.rapport_id === r.id).map((l) => [l.ansatt_id, l.lest]));
  const aktive = ansatte.filter((a) => a.aktiv).sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  return {
    lest: aktive.filter((a) => per.has(a.id)).map((a) => ({ ansatt: a, tid: per.get(a.id)! })),
    mangler: aktive.filter((a) => !per.has(a.id)),
  };
}

/** «september 2026» fra 2026-09-01 */
export const periodeNavn = (iso: string) => {
  const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  return `${MND[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};

/** Bare https-lenker godtas (f.eks. delt lenke til presentasjonen). */
export const gyldigLenke = (s: string) => s.trim() === "" || /^https:\/\/\S+$/.test(s.trim());
