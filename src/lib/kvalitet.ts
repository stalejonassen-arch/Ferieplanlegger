// Kvalitet og HMS på byggeplassen: sjekklister (egenkontroll), SJA, mannskapsliste og bestillinger.
import type { Ansatt } from "./ferie";
import type { Time } from "./timer";

// ------------------------------------------------------------ Sjekklister

export type Svar = "ok" | "avvik" | "na";
export interface Punkt {
  tekst: string; svar?: Svar | null; kommentar?: string;
  /** Overskrift punktet hører inn under */
  seksjon?: string;
  /** Punktet krever en måling: enheten (mm, mm/m, cc …) og målt verdi */
  maal?: string; verdi?: string;
  /** Satt av databasen: avviket punktet ble til, og hvem som svarte når */
  avvik_id?: string; av?: string; tid?: string;
}
export type SjekklisteStatus = "planlagt" | "pagaar" | "signert";
export interface Sjekkliste {
  id: string; prosjekt_id: string; navn: string; mal: string; punkter: Punkt[]; status: SjekklisteStatus;
  opprettet_av: string | null; opprettet: string; endret: string; signert_av: string | null; signert_tid: string | null;
  /** Kontrollplan: hvem som skal gjøre kontrollen og innen når */
  ansvarlig_id?: string | null; frist?: string | null;
  /** Malens dokumentnummer og revisjon da listen ble laget */
  dok_nr?: string; revisjon?: number | null;
  /** Kontrollert og godkjent av faglig leder */
  godkjent_av?: string | null; godkjent_tid?: string | null;
}
export const SVAR: Record<Svar, string> = { ok: "OK", avvik: "Avvik", na: "Ikke aktuelt" };

export interface MalPunkt { tekst: string; seksjon?: string; maal?: string }
/** Bedriftens egne maler (tabellen sjekkliste_maler) */
export interface SjekklisteMal {
  id: string; navn: string; kategori: string; dok_nr: string; beskrivelse: string; punkter: MalPunkt[];
  revisjon: number; aktiv: boolean; endret: string; endret_av: string | null;
}

/** Punkt i biblioteket: «tekst», eller «tekst [enhet]» for punkter som skal måles */
const pk = (seksjon: string, ...t: string[]): MalPunkt[] => t.map((x) => {
  const m = x.match(/^(.*?)\s*\[([^\]]+)\]$/);
  return m ? { tekst: m[1]!, seksjon, maal: m[2]! } : { tekst: x, seksjon };
});

/** Malbiblioteket. Punktene er en hjelp på veien – følg alltid produsentens monteringsanvisning og TEK17. */
export const BIBLIOTEK: { id: string; navn: string; kategori: string; punkter: MalPunkt[] }[] = [
  { id: "mottak", navn: "Mottakskontroll av materialer", kategori: "Generelt", punkter: pk("Mottak",
    "Leveransen stemmer med bestilling og følgeseddel",
    "Materialene har riktig dimensjon, kvalitet og sortering",
    "Konstruksjonsvirke er styrkesortert og merket",
    "Produktene har nødvendig produktdokumentasjon (FDV, DoP/CE)",
    "Fuktinnhold i trevirke er målt [%]",
    "Materialene er lagret tørt, luftet og over bakken",
    "Skadde eller feil materialer er reklamert") },
  { id: "reisverk", navn: "Bindingsverk og reisverk", kategori: "Tømrer", punkter: [
    ...pk("Før start", "Tegninger og beskrivelse er gjennomgått", "Underlaget (grunnmur/dekke) er kontrollert for mål, vater og rett", "Fuktsikring/syllunderlag er lagt under svill"),
    ...pk("Utførelse",
      "Svill er forankret etter beskrivelsen",
      "Senteravstand stendere [mm]",
      "Stendere står i lodd (avvik målt over 2 m) [mm]",
      "Åpninger har riktig mål og overliggere etter beskrivelsen",
      "Avstiving (vindkryss/plater) er utført etter beskrivelsen",
      "Spikring/skruing følger spikerplan eller anvisning",
      "Branncellebegrensende vegger er bygget etter beskrivelsen"),
  ] },
  { id: "bjelkelag", navn: "Etasjeskiller og bjelkelag", kategori: "Tømrer", punkter: pk("Utførelse",
    "Bjelkedimensjon og kvalitet stemmer med beskrivelsen",
    "Senteravstand bjelker [mm]",
    "Opplegg/oppleggslengde er tilstrekkelig [mm]",
    "Bjelkesko/beslag er montert og spikret med riktig spiker",
    "Utveksling ved åpninger er utført etter beskrivelsen",
    "Bjelkelaget er plant (avvik målt over 2 m) [mm]",
    "Lydtiltak (isolasjon, lydbøyler) er utført etter beskrivelsen",
    "Gulvplater er limt og skrudd etter anvisningen") },
  { id: "takkonstruksjon", navn: "Takkonstruksjon og undertak", kategori: "Tømrer", punkter: [
    ...pk("Bæresystem",
      "Takstoler/sperrer er i henhold til tegning og leveranse",
      "Senteravstand takstoler/sperrer [mm]",
      "Takstoler er avstivet og forankret etter anvisningen",
      "Takfoten er forankret mot vind (oppdrift)"),
    ...pk("Undertak og lufting",
      "Undertak er lagt med riktig omlegg og festet etter anvisningen",
      "Lufting ved takfot og møne er sikret",
      "Gjennomføringer i undertak er tettet",
      "Lekter og sløyfer har riktig dimensjon og avstand [mm]"),
  ] },
  { id: "taktekking", navn: "Taktekking", kategori: "Tømrer", punkter: pk("Utførelse",
    "Takets fall er kontrollert mot produktets minimum [grader]",
    "Tekking er lagt etter produsentens anvisning",
    "Beslag ved møne, vindskier, piper og gjennomføringer er tette",
    "Takrenner har fall mot nedløp",
    "Snøfangere og takstige er montert der det kreves",
    "Taket er ryddet for spon og avfall") },
  { id: "tetthet", navn: "Vindtetting og lufttetting", kategori: "Tømrer", punkter: pk("Utførelse",
    "Vindsperren er skjøtt og teipet etter anvisningen",
    "Det er tettet mellom vindsperre og vinduer/dører",
    "Dampsperren har klemte eller teipede skjøter",
    "Gjennomføringer i dampsperren er tettet",
    "Isolasjonen fyller hulrommene uten glipper",
    "Isolasjonstykkelse [mm]") },
  { id: "kledning", navn: "Utvendig kledning", kategori: "Tømrer", punkter: pk("Utførelse",
    "Lufting bak kledning [mm]",
    "Insektnett er montert nederst og øverst",
    "Kledningen er spikret med riktig spiker og avstand",
    "Avstand fra terreng til kledning [mm]",
    "Endeved og kapp er grunnet/behandlet",
    "Beslag over vinduer og dører har fall utover") },
  { id: "vinduer", navn: "Montering av vinduer og dører", kategori: "Tømrer", punkter: pk("Utførelse",
    "Karmen står i vater og lodd",
    "Kiler og skruer er plassert etter monteringsanvisningen",
    "Fugen mellom karm og vegg er tettet (drev eller fugemasse)",
    "Vindsperren er tettet mot karmen",
    "Beslag over vinduet og vannbrett med fall utover er montert",
    "Åpning, lukking og låsing fungerer") },
  { id: "innvendig", navn: "Innvendig kledning og gips", kategori: "Tømrer", punkter: pk("Utførelse",
    "Underlaget er rett før kledning (avvik over 2 m) [mm]",
    "Plater er skrudd med riktig avstand og skruetype",
    "Skjøter er forskjøvet og ligger på stender/lekt",
    "Våtromsplater er brukt der det kreves",
    "Branngips er brukt og montert etter beskrivelsen der det er brannkrav",
    "Overflaten er klar for sparkling/maling") },
  { id: "vatrom", navn: "Våtrom – membran og sluk", kategori: "Våtrom", punkter: pk("Utførelse",
    "Underlaget er rent, tørt og plant før membran",
    "Fall mot sluk i dusjsonen [mm/m]",
    "Sluk er montert etter produsentens anvisning, og klemring eller mansjett er tett",
    "Alle rørgjennomføringer har mansjett",
    "Hjørner, overganger og skjøter er forsterket med duk eller bånd",
    "Membrantykkelse [mm]",
    "Membranen er ført opp på vegg etter anvisningen",
    "Membransystemet er produktdokumentert, og produktene er fra samme system",
    "Tørketiden er overholdt før flislegging",
    "Bilder er tatt av membran og sluk før flis") },
  { id: "brann", navn: "Branntetting og gjennomføringer", kategori: "Brann", punkter: pk("Utførelse",
    "Gjennomføringer i branncellebegrensende vegger og dekker er tettet med dokumentert produkt",
    "Branntettingen er merket",
    "Dører i brannskille lukker og tetter",
    "Branntettingen er dokumentert med bilder") },
  { id: "slutt", navn: "Sluttkontroll før overlevering", kategori: "Generelt", punkter: pk("Sluttkontroll",
    "Byggeplassen er ryddet og rengjort",
    "Alle avvik på prosjektet er lukket",
    "Arbeidet er utført i samsvar med tegninger, beskrivelse og TEK17",
    "Tilleggsarbeid er signert av kunden",
    "FDV-dokumentasjon er samlet",
    "Kunden er informert om bruk og vedlikehold",
    "Overflater er kontrollert for riper og skader") },
];
/** Gammelt navn (brukes av eldre kode og tester) */
export const MALER = BIBLIOTEK.map((m) => ({ id: m.id, navn: m.navn, punkter: m.punkter.map((x) => x.tekst) }));

/** Malpunkter som tekst for redigering: «# Seksjon» på egen linje, «tekst [enhet]» for målinger */
export function malTilTekst(punkter: MalPunkt[]): string {
  const ut: string[] = [];
  let sek: string | undefined;
  for (const p of punkter) {
    if ((p.seksjon || undefined) !== sek) { sek = p.seksjon || undefined; if (sek) ut.push(`# ${sek}`); }
    ut.push(p.maal ? `${p.tekst} [${p.maal}]` : p.tekst);
  }
  return ut.join("\n");
}
export function tekstTilMal(tekst: string): MalPunkt[] {
  const ut: MalPunkt[] = [];
  let sek = "";
  for (const r of tekst.split("\n").map((x) => x.trim()).filter(Boolean)) {
    if (r.startsWith("#")) { sek = r.replace(/^#+\s*/, "").trim(); continue; }
    const m = r.match(/^(.*?)\s*\[([^\]]+)\]$/);
    const p: MalPunkt = m ? { tekst: m[1]!.trim(), maal: m[2]!.trim() } : { tekst: r };
    if (sek) p.seksjon = sek;
    if (p.tekst) ut.push(p);
  }
  return ut;
}
/** Tomme punkter til en ny sjekkliste */
export const nyePunkter = (m: MalPunkt[]): Punkt[] => m.map((x) => ({ tekst: x.tekst, ...(x.seksjon ? { seksjon: x.seksjon } : {}), ...(x.maal ? { maal: x.maal, verdi: "" } : {}), svar: null, kommentar: "" }));

/** Status for én kontroll i kontrollplanen */
export type KontrollStatus = "planlagt" | "pagaar" | "signert" | "godkjent";
export const kontrollStatus = (s: Pick<Sjekkliste, "status" | "godkjent_av">): KontrollStatus => (s.godkjent_av ? "godkjent" : s.status);
export const KONTROLL_STATUS: Record<KontrollStatus, string> = { planlagt: "Planlagt", pagaar: "Påbegynt", signert: "Signert – venter på kontroll", godkjent: "Godkjent" };
export const forsinket = (s: Pick<Sjekkliste, "status" | "frist">, idag: string) => s.status !== "signert" && !!s.frist && s.frist < idag;

/** Egenkontrollen på et prosjekt i tall */
export function egenkontrollTall(lister: Sjekkliste[], avvik: { sjekkliste_id?: string | null; status: string }[], idag: string) {
  const ider = new Set(lister.map((s) => s.id));
  const t = { totalt: lister.length, planlagt: 0, pagaar: 0, signert: 0, godkjent: 0, forsinket: 0, aapneAvvik: 0 };
  for (const s of lister) { t[kontrollStatus(s)]++; if (forsinket(s, idag)) t.forsinket++; }
  t.aapneAvvik = avvik.filter((a) => a.sjekkliste_id && ider.has(a.sjekkliste_id) && a.status !== "lukket").length;
  return t;
}

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
