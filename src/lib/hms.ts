// Avvik og bilder.
export type AvvikType = "avvik" | "ruh" | "skade" | "forbedring";
export type AvvikStatus = "apen" | "under_arbeid" | "lukket";

export interface Avvik {
  id: string; prosjekt_id: string | null; meldt_av: string; type: AvvikType; tittel: string; beskrivelse: string;
  ansvarlig_id: string | null; frist: string | null; status: AvvikStatus; tiltak: string;
  lukket_av: string | null; lukket_tid: string | null; opprettet: string;
}
export interface Bilde { id: string; prosjekt_id: string | null; avvik_id: string | null; dagbok_id?: string | null; tillegg_id?: string | null; ansatt_id: string; sti: string; tekst: string; opprettet: string }

export const AVVIK_TYPE: Record<AvvikType, string> = {
  avvik: "Avvik", ruh: "Uønsket hendelse (RUH)", skade: "Skade på person", forbedring: "Forbedringsforslag",
};
export const AVVIK_STATUS: Record<AvvikStatus, string> = { apen: "Åpen", under_arbeid: "Under arbeid", lukket: "Lukket" };

export type NyttAvvik = Partial<Avvik> & { tittel: string };

/** Skalerer ned bilder fra mobilkamera (ofte 4–12 MB) til maks 1600 px JPEG, typisk 200–400 kB. */
export async function komprimer(fil: File, maks = 1600): Promise<Blob> {
  if (!fil.type.startsWith("image/") || fil.type === "image/heic") return fil;
  try {
    const bmp = await createImageBitmap(fil, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * skala);
    c.height = Math.round(bmp.height * skala);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? fil), "image/jpeg", 0.82));
  } catch {
    return fil;
  }
}

export interface Dagbok { id: string; prosjekt_id: string; ansatt_id: string; dato: string; vaer: string; tekst: string; hindringer: string; opprettet: string }
export type TilleggStatus = "utkast" | "signert" | "avvist" | "fakturert";
export interface Tillegg {
  id: string; prosjekt_id: string; opprettet_av: string; tittel: string; beskrivelse: string; timer: number | null; materiell: string;
  pris: number | null; status: TilleggStatus; signert_navn: string; signatur: string; signert_tid: string | null; opprettet: string;
}
export const TILLEGG_STATUS: Record<TilleggStatus, string> = { utkast: "Ikke signert", signert: "Signert av kunde", avvist: "Avvist", fakturert: "Fakturert" };
export const VAER = ["Sol", "Skyet", "Regn", "Snø", "Vind", "Kuling", "Frost"];
