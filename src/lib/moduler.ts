// Deler av appen som leder kan slå av for bedriften. Det som er slått av, forsvinner fra menyene,
// men ingenting slettes – slås det på igjen, ligger alt der som før.
import type { Data } from "./ferie";

export type Modul =
  | "chat" | "plan" | "materiell" | "bestilling" | "egenkontroll" | "sja" | "avvik" | "hms" | "reklamasjon" | "service" | "befaring" | "ai" | "tilbud" | "dagbok" | "tillegg"
  | "utstyr" | "kurs" | "rapporter" | "kampanjer" | "vaer" | "okonomi" | "sluttdok" | "kontrakt";

export const MODULER: { id: Modul; navn: string; hva: string }[] = [
  { id: "chat", navn: "Chat", hva: "Meldinger i felles kanal, per prosjekt og mellom to ansatte" },
  { id: "plan", navn: "Arbeidsplan", hva: "Dele ut arbeid med datoer, ukeplan og «Mitt arbeid»" },
  { id: "materiell", navn: "Materialliste", hva: "Materiell delt i leveranser på prosjektet, og leveranser som skal ut" },
  { id: "bestilling", navn: "Bestilling fra byggeplassen", hva: "Snekkeren bestiller materiell, butikken plukker og leverer" },
  { id: "egenkontroll", navn: "Egenkontroll", hva: "Sjekklister som fylles ut og signeres på prosjektet" },
  { id: "sja", navn: "SJA og mannskapsliste", hva: "Sikker jobbanalyse, mannskapsliste og HMS-kort" },
  { id: "avvik", navn: "Avvik og RUH", hva: "Melde og følge opp avvik og uønskede hendelser" },
  { id: "hms", navn: "HMS-dokumenter og stoffkartotek", hva: "HMS-håndbok og rutiner som alle kvitterer for, og stoffkartotek med sikkerhetsdatablad" },
  { id: "service", navn: "Serviceoppdrag", hva: "Små betalte oppdrag hos kunden på en dag eller to – hastegrad, timer, materiell og fakturering" },
  { id: "befaring", navn: "Befaring", hva: "Befaring før tilbud, underveis og overtakelse med kunden – punkter, mål, bilder og kundens signatur" },
  { id: "ai", navn: "KI-hjelp", hva: "Snakk inn dagboken (også på polsk, engelsk og litauisk), og la KI fylle ut befaringen fra bilder og det som er sagt" },
  { id: "tilbud", navn: "Tilbudsoppfølging", hva: "Tilbud som bør følges opp med en telefon – fra Visma eller registrert i appen, med påminnelse og treffprosent" },
  { id: "reklamasjon", navn: "Reklamasjon", hva: "Kunden melder feil på ferdig jobb – vurdering, utbedring og kostnad" },
  { id: "dagbok", navn: "Dagbok", hva: "Dagbok på prosjektet" },
  { id: "tillegg", navn: "Tilleggsarbeid", hva: "Tilleggsarbeid som kunden signerer" },
  { id: "utstyr", navn: "Utstyr og arbeidstøy", hva: "Verktøy, arbeidstøy og forbruk per ansatt" },
  { id: "kurs", navn: "Kurs og bevis", hva: "Kompetanse, kurs og sertifikater" },
  { id: "rapporter", navn: "Rapporter", hva: "Månedsrapporter til de ansatte" },
  { id: "kampanjer", navn: "Kampanjer", hva: "Kampanjer fra kjeden på forsiden" },
  { id: "vaer", navn: "Vær", hva: "Værvarsel på forsiden" },
  { id: "okonomi", navn: "Økonomi på prosjektet", hva: "Lønnsomhet per prosjekt (bare leder ser den)" },
  { id: "sluttdok", navn: "Sluttdokumentasjon", hva: "Sluttrapport til kunden og Boligmappa" },
  { id: "kontrakt", navn: "Kontrakt (NS)", hva: "NS-kontrakter på større prosjekter – frister, varsler, saker og endringsordrer. Appen avgjør ingen juridiske spørsmål" },
];

/** Nye deler som er av til leder slår dem på. Er de slått på, står «<id>paa» i listen (samme kolonne, moduler_av). */
export const AV_SOM_STANDARD: readonly Modul[] = ["kontrakt"];
const paaMerke = (m: Modul) => `${m}paa`;

/** Er denne delen av appen slått på for bedriften? */
export const bruker = (d: Pick<Data, "modulerAv">, m: Modul) => {
  const av = d.modulerAv ?? [];
  if (av.includes(m)) return false;
  return !AV_SOM_STANDARD.includes(m) || av.includes(paaMerke(m));
};

/** Ny liste for moduler_av når leder slår en del av eller på. */
export function settModul(av: readonly string[], m: Modul, paa: boolean): string[] {
  const ny = new Set(av);
  ny.delete(m); ny.delete(paaMerke(m));
  if (!paa) { if (!AV_SOM_STANDARD.includes(m)) ny.add(m); }
  else if (AV_SOM_STANDARD.includes(m)) ny.add(paaMerke(m));
  return [...ny].sort();
}
