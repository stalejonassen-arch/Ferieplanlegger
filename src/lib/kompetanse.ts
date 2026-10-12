// Kurs og kompetansebevis per ansatt, med gyldighet og varsling før de går ut.

export interface Kompetanse {
  id: string; ansatt_id: string; type: string; navn: string; utsteder: string;
  utstedt: string | null; gyldig_til: string | null; sti: string | null; filnavn: string; merknad: string; opprettet: string;
}

/** Vanlige kurs og bevis i tømrer- og byggfag. Gyldighet varierer, så den føres fra beviset. */
export const KURS: { id: string; navn: string; hint?: string }[] = [
  { id: "stillas", navn: "Stillasmontør / stillaskurs", hint: "Hvilken høyde/klasse kurset gjelder" },
  { id: "hoyde", navn: "Arbeid i høyden / fallsikring" },
  { id: "lift", navn: "Personløfter / lift", hint: "Klasse, f.eks. A og B" },
  { id: "truck", navn: "Truck", hint: "Klasse, f.eks. T1 og T4" },
  { id: "kran", navn: "Kran og anhuker", hint: "Klasse, f.eks. G4 eller anhuker" },
  { id: "varme", navn: "Varme arbeider" },
  { id: "forstehjelp", navn: "Førstehjelp" },
  { id: "hms", navn: "HMS-kort" },
  { id: "verktoy", navn: "Maskiner og verktøy", hint: "F.eks. motorsag, spikerpistol" },
  { id: "asbest", navn: "Asbest og miljøsanering" },
  { id: "varsling", navn: "Arbeidsvarsling" },
  { id: "fagbrev", navn: "Fagbrev / svennebrev" },
  { id: "forerkort", navn: "Førerkort", hint: "Klasse, f.eks. BE eller C1" },
  { id: "annet", navn: "Annet kurs eller bevis" },
];
export const kursNavn = (type: string) => KURS.find((k) => k.id === type)?.navn ?? "Annet kurs eller bevis";

export type KStatus = "gyldig" | "snart" | "utlopt";
export const VARSEL_DAGER = 60;

/** Gyldig (eller uten utløp), utløper innen 60 dager, eller utløpt */
export function kStatus(k: Pick<Kompetanse, "gyldig_til">, idag: string): KStatus {
  if (!k.gyldig_til) return "gyldig";
  if (k.gyldig_til < idag) return "utlopt";
  const dager = (Date.parse(k.gyldig_til) - Date.parse(idag)) / 86400000;
  return dager <= VARSEL_DAGER ? "snart" : "gyldig";
}
export const STATUS_TEKST: Record<KStatus, string> = { gyldig: "Gyldig", snart: "Går ut snart", utlopt: "Utløpt" };

/** Beste bevis per ansatt og type (det som varer lengst), for oversikten */
export function besteBevis(liste: Kompetanse[]): Map<string, Kompetanse> {
  const m = new Map<string, Kompetanse>();
  for (const k of liste) {
    const n = `${k.ansatt_id}|${k.type}`;
    const f = m.get(n);
    if (!f || (f.gyldig_til && (!k.gyldig_til || k.gyldig_til > f.gyldig_til))) m.set(n, k);
  }
  return m;
}

/** Bevis som er utløpt eller går ut snart (bare det beste per ansatt og type teller) */
export function trengerFornyelse(liste: Kompetanse[], idag: string): Kompetanse[] {
  return [...besteBevis(liste).values()].filter((k) => kStatus(k, idag) !== "gyldig")
    .sort((a, b) => (a.gyldig_til ?? "").localeCompare(b.gyldig_til ?? ""));
}
