// Deler av appen som leder kan slå av for bedriften. Det som er slått av, forsvinner fra menyene,
// men ingenting slettes – slås det på igjen, ligger alt der som før.
import type { Data } from "./ferie";

export type Modul =
  | "chat" | "plan" | "materiell" | "bestilling" | "egenkontroll" | "sja" | "avvik" | "reklamasjon" | "service" | "dagbok" | "tillegg"
  | "utstyr" | "kurs" | "rapporter" | "kampanjer" | "vaer" | "okonomi" | "sluttdok";

export const MODULER: { id: Modul; navn: string; hva: string }[] = [
  { id: "chat", navn: "Chat", hva: "Meldinger i felles kanal, per prosjekt og mellom to ansatte" },
  { id: "plan", navn: "Arbeidsplan", hva: "Dele ut arbeid med datoer, ukeplan og «Mitt arbeid»" },
  { id: "materiell", navn: "Materialliste", hva: "Materiell delt i leveranser på prosjektet, og leveranser som skal ut" },
  { id: "bestilling", navn: "Bestilling fra byggeplassen", hva: "Snekkeren bestiller materiell, butikken plukker og leverer" },
  { id: "egenkontroll", navn: "Egenkontroll", hva: "Sjekklister som fylles ut og signeres på prosjektet" },
  { id: "sja", navn: "SJA og mannskapsliste", hva: "Sikker jobbanalyse, mannskapsliste og HMS-kort" },
  { id: "avvik", navn: "Avvik og RUH", hva: "Melde og følge opp avvik og uønskede hendelser" },
  { id: "service", navn: "Serviceoppdrag", hva: "Små betalte oppdrag hos kunden på en dag eller to – hastegrad, timer, materiell og fakturering" },
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
];

/** Er denne delen av appen slått på for bedriften? */
export const bruker = (d: Pick<Data, "modulerAv">, m: Modul) => !(d.modulerAv ?? []).includes(m);
