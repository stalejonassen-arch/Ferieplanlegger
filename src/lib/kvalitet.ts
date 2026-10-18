// Kvalitet og HMS på byggeplassen: sjekklister (egenkontroll), SJA, mannskapsliste og bestillinger.
import type { Ansatt } from "./ferie";
import type { Time } from "./timer";

// ------------------------------------------------------------ Sjekklister

export type Svar = "ok" | "avvik" | "na";
export interface Punkt { tekst: string; svar?: Svar | null; kommentar?: string }
export interface Sjekkliste {
  id: string; prosjekt_id: string; navn: string; mal: string; punkter: Punkt[]; status: "pagaar" | "signert";
  opprettet_av: string | null; opprettet: string; endret: string; signert_av: string | null; signert_tid: string | null;
}
export const SVAR: Record<Svar, string> = { ok: "OK", avvik: "Avvik", na: "Ikke aktuelt" };

/** Standardmaler. Punktene er en hjelp på veien – følg alltid produsentens monteringsanvisning. */
export const MALER: { id: string; navn: string; punkter: string[] }[] = [
  { id: "vatrom", navn: "Våtrom – membran og sluk", punkter: [
    "Underlaget er rent, tørt og plant før membran",
    "Fall mot sluk er kontrollert i dusjsonen",
    "Sluk er montert etter produsentens anvisning, og klemring eller mansjett er tett",
    "Alle rørgjennomføringer har mansjett",
    "Hjørner, overganger og skjøter er forsterket med duk eller bånd",
    "Membranen er påført i riktig tykkelse (målt)",
    "Membranen er ført opp på vegg etter anvisningen",
    "Membransystemet er produktdokumentert, og produktene er fra samme system",
    "Tørketiden er overholdt før flislegging",
    "Bilder er tatt av membran og sluk før flis",
  ] },
  { id: "tetthet", navn: "Vindtetting og lufttetting", punkter: [
    "Vindsperren er skjøtt og teipet etter anvisningen",
    "Det er tettet mellom vindsperre og vinduer/dører",
    "Dampsperren har klemte eller teipede skjøter",
    "Gjennomføringer i dampsperren er tettet",
    "Isolasjonen fyller hulrommene uten glipper",
    "Det er luftespalte bak kledningen, med insektnett nederst og øverst",
  ] },
  { id: "vinduer", navn: "Montering av vinduer og dører", punkter: [
    "Karmen står i vater og lodd",
    "Kiler og skruer er plassert etter monteringsanvisningen",
    "Fugen mellom karm og vegg er tettet (drev eller fugemasse)",
    "Vindsperren er tettet mot karmen",
    "Beslag over vinduet og vannbrett med fall utover er montert",
    "Åpning, lukking og låsing fungerer",
  ] },
  { id: "brann", navn: "Branntetting og gjennomføringer", punkter: [
    "Gjennomføringer i branncellebegrensende vegger og dekker er tettet med dokumentert produkt",
    "Branntettingen er merket",
    "Dører i brannskille lukker og tetter",
    "Branntettingen er dokumentert med bilder",
  ] },
  { id: "slutt", navn: "Sluttkontroll før overlevering", punkter: [
    "Byggeplassen er ryddet og rengjort",
    "Alle avvik på prosjektet er lukket",
    "Tilleggsarbeid er signert av kunden",
    "FDV-dokumentasjon er samlet",
    "Kunden er informert om bruk og vedlikehold",
    "Overflater er kontrollert for riper og skader",
  ] },
];

export const besvart = (s: Pick<Sjekkliste, "punkter">) => s.punkter.filter((p) => p.svar).length;
export const avvikIListe = (s: Pick<Sjekkliste, "punkter">) => s.punkter.filter((p) => p.svar === "avvik").length;

// ------------------------------------------------------------ SJA

export interface Risiko { fare: string; tiltak: string }
export interface Sja {
  id: string; prosjekt_id: string; dato: string; arbeid: string; risikoer: Risiko[]; verneutstyr: string;
  deltakere: string[]; kvittert: Record<string, string>; opprettet_av: string | null; opprettet: string;
}
/** Vanlige farer på byggeplassen, som forslag når SJA-en fylles ut */
export const FARER = [
  "Fall fra høyde (tak, stillas, stige)", "Fallende gjenstander", "Kutt og stikk fra verktøy", "Støy", "Støv (tre, betong, isolasjon)",
  "Tunge løft", "Strøm og kabler i vegg", "Asbest eller andre farlige stoffer ved riving", "Kjemikalier (lim, membran, skum)", "Glatt eller ustabilt underlag",
];
export const kvitteringer = (s: Pick<Sja, "deltakere" | "kvittert">) => s.deltakere.filter((id) => s.kvittert[id]).length;

// ------------------------------------------------------------ Mannskapsliste

export interface MannskapDag { dato: string; ansatte: { ansatt: Ansatt; timer: number }[] }

/** Hvem som har vært på prosjektet hvilke dager, laget av timene som er ført (nyeste dag først) */
export function mannskapsliste(timer: Time[], ansatte: Ansatt[], prosjektId: string, fra?: string, til?: string): MannskapDag[] {
  const dager = new Map<string, Map<string, number>>();
  for (const t of timer) {
    if (t.prosjekt_id !== prosjektId || (fra && t.dato < fra) || (til && t.dato > til)) continue;
    const m = dager.get(t.dato) ?? new Map<string, number>();
    m.set(t.ansatt_id, (m.get(t.ansatt_id) ?? 0) + Number(t.timer));
    dager.set(t.dato, m);
  }
  return [...dager.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dato, m]) => ({
    dato,
    ansatte: [...m.entries()].map(([id, timer]) => ({ ansatt: ansatte.find((a) => a.id === id)!, timer: Math.round(timer * 100) / 100 }))
      .filter((x) => x.ansatt).sort((a, b) => a.ansatt.navn.localeCompare(b.ansatt.navn, "nb")),
  }));
}

/** HMS-kortet mangler eller har gått ut (eller går ut innen 30 dager) */
export function hmsKortStatus(a: Pick<Ansatt, "hms_kort_nr" | "hms_kort_gyldig">, idag: string): "mangler" | "utlopt" | "snart" | "ok" {
  if (!a.hms_kort_nr) return "mangler";
  if (a.hms_kort_gyldig && a.hms_kort_gyldig < idag) return "utlopt";
  if (a.hms_kort_gyldig && Date.parse(a.hms_kort_gyldig) - Date.parse(idag) < 30 * 864e5) return "snart";
  return "ok";
}

const celle = (v: string | number) => { const s = String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Mannskapslisten som CSV for Excel (semikolon og BOM) */
export function mannskapCsv(liste: MannskapDag[], prosjekt: string) {
  const rader: (string | number)[][] = [[`Mannskapsliste – ${prosjekt}`], ["Dato", "Navn", "HMS-kort", "HMS-kort gyldig til", "Timer"]];
  for (const d of liste) for (const x of d.ansatte) rader.push([d.dato, x.ansatt.navn, x.ansatt.hms_kort_nr ?? "", x.ansatt.hms_kort_gyldig ?? "", String(x.timer).replace(".", ",")]);
  return "﻿" + rader.map((r) => r.map(celle).join(";")).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------ Bestillinger

export type BestillingStatus = "ny" | "plukkes" | "klar" | "levert" | "avvist";
export interface Bestillingslinje { beskrivelse: string; antall: number; enhet: string; nobb?: string }
export interface Bestilling {
  id: string; prosjekt_id: string; bestilt_av: string | null; onsket_dato: string | null; merknad: string; linjer: Bestillingslinje[];
  status: BestillingStatus; svar: string; behandlet_av: string | null; leveranse_id: string | null; opprettet: string; endret: string;
}
export const BESTILLING_STATUS: Record<BestillingStatus, string> = { ny: "Ny", plukkes: "Plukkes", klar: "Klar til henting/levering", levert: "Levert", avvist: "Kan ikke leveres" };
export const aapenBestilling = (b: Pick<Bestilling, "status">) => b.status === "ny" || b.status === "plukkes" || b.status === "klar";
