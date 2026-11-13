// Befaring: før tilbud, underveis på prosjektet og ved overtakelse (ferdigbefaring) med kunden.
// Punktene besvares med OK / Avvik / Ikke aktuelt, med merknad og eventuelt mål.
// På et prosjekt blir punkter med «Avvik» automatisk avvik i avviksregisteret (gjøres i databasen).

export type BefaringType = "tilbud" | "underveis" | "overtakelse";
export type BefaringSvar = "ok" | "avvik" | "na";

export interface BefaringPunkt {
  tekst: string;
  svar?: BefaringSvar | "";
  merknad?: string;
  /** Mål eller mengde (f.eks. «4,2 × 3,1 m» eller «18 m²») */
  maal?: string;
  avvik_id?: string;
}

export interface Befaring {
  id: string;
  type: BefaringType;
  prosjekt_id: string | null;
  kunde_id: string | null;
  kunde_navn: string; telefon: string; epost: string; adresse: string;
  tittel: string;
  dato: string;
  deltakere: string;
  notat: string;
  punkter: BefaringPunkt[];
  status: "apen" | "ferdig";
  utfort_av: string | null;
  tilbud_id: string | null;
  signert_navn: string; signatur: string; signert_tid: string | null;
  opprettet: string; endret: string;
}

export type NyBefaring = Partial<Omit<Befaring, "utfort_av" | "opprettet" | "endret" | "signert_tid">> & { tittel: string; type: BefaringType };

export const BEFARING_TYPE: Record<BefaringType, string> = {
  tilbud: "Befaring før tilbud",
  underveis: "Befaring underveis",
  overtakelse: "Overtakelse",
};
export const BEFARING_KORT: Record<BefaringType, string> = { tilbud: "Før tilbud", underveis: "Underveis", overtakelse: "Overtakelse" };
export const BEFARING_SVAR: Record<BefaringSvar, string> = { ok: "OK", avvik: "Avvik", na: "Ikke aktuelt" };

/** Standardpunkter for hver type. Kan endres og utvides på hver befaring. */
export const BEFARING_PUNKTER: Record<BefaringType, string[]> = {
  tilbud: [
    "Mål tatt (lengder, høyder, arealer)",
    "Adkomst, parkering og rigg (kran, stillas, lift)",
    "Eksisterende konstruksjon og underlag",
    "Fukt, råte eller skader",
    "Strøm og vann tilgjengelig",
    "Avfall og bortkjøring",
    "Kundens ønsker og materialvalg",
    "Ønsket oppstart og ferdig",
    "Søknadsplikt og ansvarsrett vurdert",
    "Behov for rørlegger, elektriker eller andre fag",
  ],
  underveis: [
    "Fremdrift i henhold til plan",
    "Utført i henhold til avtale og tegninger",
    "Tilleggsarbeid avklart med kunden",
    "Sikkerhet, rigg og orden på plassen",
    "Kundens merknader",
  ],
  overtakelse: [
    "Arbeidet er utført i henhold til avtalen",
    "Ingen synlige skader eller mangler",
    "Rengjort og ryddet",
    "Avfall og overskuddsmateriell fjernet",
    "FDV-dokumentasjon overlevert",
    "Nøkler og utstyr overlevert",
    "Kunden er informert om bruk og vedlikehold",
  ],
};

export const nyePunkter = (t: BefaringType): BefaringPunkt[] => BEFARING_PUNKTER[t].map((tekst) => ({ tekst, svar: "", merknad: "", maal: "" }));

/** Antall besvarte punkter og avvik */
export function befaringTall(b: Pick<Befaring, "punkter">) {
  const besvart = b.punkter.filter((p) => p.svar).length;
  const avvik = b.punkter.filter((p) => p.svar === "avvik").length;
  return { besvart, avvik, antall: b.punkter.length };
}

/** Kort tekst om kunden/stedet for lister */
export function befaringKunde(b: Pick<Befaring, "kunde_navn" | "adresse">, kundeNavn?: string) {
  return [kundeNavn || b.kunde_navn, b.adresse].filter(Boolean).join(" · ");
}

/** Beskrivelse til tilbudet som lages fra en befaring før tilbud */
export function tilbudFraBefaring(b: Befaring): string {
  const deler: string[] = [];
  if (b.notat.trim()) deler.push(b.notat.trim());
  const maal = b.punkter.filter((p) => (p.maal ?? "").trim()).map((p) => `${p.tekst}: ${p.maal!.trim()}`);
  if (maal.length) deler.push(`Mål: ${maal.join("; ")}`);
  const merk = b.punkter.filter((p) => (p.merknad ?? "").trim()).map((p) => `${p.tekst}: ${p.merknad!.trim()}`);
  if (merk.length) deler.push(merk.join("\n"));
  deler.push(`Fra befaring ${b.dato.split("-").reverse().join(".")}.`);
  return deler.join("\n\n").slice(0, 2000);
}
