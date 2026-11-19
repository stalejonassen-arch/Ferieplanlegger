// Stoffkartotek (kjemikalier med sikkerhetsdatablad) og HMS-dokumenter (håndbok, rutiner) med lesebekreftelse.

export interface Stoff {
  id: string; navn: string; leverandor: string; nobb: string; bruk: string; plassering: string;
  farer: string[]; verneutstyr: string; datablad_dato: string | null; sti: string | null; filnavn: string; lenke: string;
  aktiv: boolean; lagt_inn_av: string | null; opprettet: string; endret: string;
}
export type NyttStoff = Omit<Stoff, "id" | "lagt_inn_av" | "opprettet" | "endret"> & { id?: string };

export type HmsKategori = "handbok" | "rutine" | "beredskap" | "risiko" | "kvalitet" | "annet";
export const HMS_KATEGORI: Record<HmsKategori, string> = {
  handbok: "HMS-håndbok", rutine: "Rutine", beredskap: "Beredskap og førstehjelp", risiko: "Risikovurdering", kvalitet: "Kvalitetssystem (KS)", annet: "Annet",
};
export interface HmsDokument {
  id: string; tittel: string; kategori: HmsKategori; versjon: string; gyldig_fra: string | null; revideres: string | null;
  beskrivelse: string; sti: string | null; filnavn: string; lenke: string; ma_leses: boolean; opprettet: string; endret: string;
}
export type NyttHmsDokument = Omit<HmsDokument, "id" | "opprettet" | "endret"> & { id?: string };
export interface HmsLest { dokument_id: string; ansatt_id: string; tid: string }

/** Farepiktogrammene (CLP/GHS) slik de står i sikkerhetsdatabladet */
export const FAREPIKTOGRAM: { id: string; navn: string; tegn: string }[] = [
  { id: "GHS02", navn: "Brannfarlig", tegn: "🔥" },
  { id: "GHS05", navn: "Etsende", tegn: "🧪" },
  { id: "GHS06", navn: "Giftig", tegn: "☠️" },
  { id: "GHS07", navn: "Helsefare / irriterende", tegn: "❗" },
  { id: "GHS08", navn: "Alvorlig helsefare", tegn: "🫁" },
  { id: "GHS09", navn: "Miljøfare", tegn: "🐟" },
  { id: "GHS01", navn: "Eksplosiv", tegn: "💥" },
  { id: "GHS03", navn: "Oksiderende", tegn: "⭕" },
  { id: "GHS04", navn: "Gass under trykk", tegn: "🧯" },
];

/** Sikkerhetsdatablad bør sjekkes mot leverandørens nyeste utgave minst hvert tredje år */
export const DATABLAD_AAR = 3;
const plussAar = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}`;

/** Hva mangler eller er gammelt for et stoff? Tom liste = i orden. */
export function stoffMangler(s: Pick<Stoff, "sti" | "lenke" | "datablad_dato">, idag: string): string[] {
  const ut: string[] = [];
  if (!s.sti && !s.lenke) ut.push("mangler sikkerhetsdatablad");
  else if (!s.datablad_dato) ut.push("dato på databladet mangler");
  else if (plussAar(s.datablad_dato, DATABLAD_AAR) < idag) ut.push(`databladet er over ${DATABLAD_AAR} år gammelt`);
  return ut;
}

/** HMS-dokument som skal revideres (passert dato eller innen 30 dager) */
export function revisjonStatus(d: Pick<HmsDokument, "revideres">, idag: string): "ok" | "snart" | "over" {
  if (!d.revideres) return "ok";
  if (d.revideres < idag) return "over";
  const om30 = new Date(Date.parse(`${idag}T12:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10);
  return d.revideres <= om30 ? "snart" : "ok";
}

/** Hvem har ikke lest dokumentet (blant aktive ansatte) */
export function ikkeLest<A extends { id: string; aktiv: boolean }>(dok: Pick<HmsDokument, "id" | "ma_leses">, ansatte: A[], lest: HmsLest[]): A[] {
  if (!dok.ma_leses) return [];
  const har = new Set(lest.filter((l) => l.dokument_id === dok.id).map((l) => l.ansatt_id));
  return ansatte.filter((a) => a.aktiv && !har.has(a.id));
}

/** Stoffkartoteket som CSV (til Arbeidstilsynet / vernerunde) */
export function stoffCsv(stoffer: Stoff[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const navn = (id: string) => FAREPIKTOGRAM.find((f) => f.id === id)?.navn ?? id;
  return ["Produkt;Leverandør;NOBB;Bruksområde;Plassering;Farer;Verneutstyr;Datablad datert",
    ...stoffer.filter((s) => s.aktiv).map((s) => [s.navn, s.leverandor, s.nobb, s.bruk, s.plassering, s.farer.map(navn).join(", "), s.verneutstyr, s.datablad_dato ?? ""].map(q).join(";"))].join("\n");
}
