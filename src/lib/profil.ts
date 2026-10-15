// Hvilken bedrift appen vises for. Den ekte appen er alltid N L Austnes; demoen kan vises i andre bedrifters drakt
// via en unik lenke (/demo/<kode>) for å vise fram ByggLogg til nye kunder. Bare utseende, navn og eksempeldata endres.
import type { Tema } from "./ferie";

export interface Profil {
  id: "austnes" | "thaugland" | "demo";
  /** Liten linje over «ByggLogg» i toppen */
  undertittel: string;
  firma: string;
  tema: Tema;
  /** Sted for værmeldingen */
  sted: { navn: string; lat: number; lon: number };
  /** Bedriftens adresse i kartet (utgangspunkt for km til prosjektene) */
  base: { lat: number; lon: number };
  /** Navn på kampanjekortet */
  kampanje: string;
  /** Innlogging i demoen: e-post og navn */
  demoBrukere: [string, string][];
  /** Har bedriften egne snekkere/montører? */
  snekkere: boolean;
  /** Firmaopplysninger i sluttdokumentasjon og eksport */
  bedrift: { linje: string; adresse: string; orgnr: string; tlf: string };
}

const AUSTNES: Profil = {
  id: "austnes", undertittel: "Byggfag · N L Austnes AS", firma: "N L Austnes AS", tema: "byggfag",
  sted: { navn: "Haramsøy", lat: 62.665, lon: 6.405 }, base: { lat: 62.646733, lon: 6.261610 }, kampanje: "Kampanje fra Byggfag",
  demoBrukere: [],
  snekkere: true,
  bedrift: { linje: "Tømrer · Byggevarer · Kjøkken og interiør", adresse: "Larsnilsvegen 41, 6290 Haramsøy", orgnr: "832 507 652", tlf: "70 21 01 09" },
};

/** Den åpne demoen (bygglogg.app/?demo): et oppdiktet firma, så ingen ekte bedrift eller ansatte vises */
const DEMO: Profil = {
  id: "demo", undertittel: "Demo Bygg AS", firma: "Demo Bygg AS", tema: "byggfag",
  sted: { navn: "Ålesund", lat: 62.472, lon: 6.155 }, base: { lat: 62.4723, lon: 6.1549 }, kampanje: "Månedens kampanje",
  demoBrukere: [["lars@demo.no", "Lars Berg (daglig leder)"], ["ola@demo.no", "Ola Nordmann (snekker)"], ["tomasz@demo.no", "Tomasz Nowak (lager)"], ["kari@demo.no", "Kari Holm (kjøkken)"]],
  snekkere: true,
  bedrift: { linje: "Tømrer · Rehabilitering · Tilbygg", adresse: "Eksempelvegen 1, 6005 Ålesund", orgnr: "", tlf: "" },
};

const THAUGLAND: Profil = {
  id: "thaugland", undertittel: "Thaugland · Trelast og byggevarer siden 1913", firma: "Thaugland", tema: "thaugland",
  sted: { navn: "Oslo", lat: 59.913, lon: 10.752 }, base: { lat: 59.913, lon: 10.752 }, kampanje: "Månedens tilbud",
  demoBrukere: [["kari@demo.no", "Kari Thorsen (daglig leder)"], ["martin@demo.no", "Martin Lie (proffsalg)"], ["erik@demo.no", "Erik Dahl (lager og levering)"], ["ingrid@demo.no", "Ingrid Berg (butikk)"]],
  snekkere: false,
  bedrift: { linje: "Trelast og byggevarer", adresse: "Oslo", orgnr: "", tlf: "" },
};

/** Unike, delbare demo-adresser: /demo/<kode>. Koden er vanskelig å gjette, så bare de som får lenken ser drakten. */
const DEMO_LENKER: Record<string, Profil> = { "thaugland-aoaidjjc": THAUGLAND };

/** Demo-drakt fra adressen (/demo/<kode>), eller null */
export function demoFraAdresse(): Profil | null {
  const m = location.pathname.match(/^\/demo\/([a-z0-9-]+)\/?$/i);
  return m ? DEMO_LENKER[m[1]!.toLowerCase()] ?? null : null;
}

/** Er demoen valgt? Samme regler som i api.ts (?demo, /demo/<kode> eller tidligere valgt i denne fanen) */
function demoAktiv(): boolean {
  if (/^\/demo\//i.test(location.pathname)) return true;
  const q = new URLSearchParams(location.search);
  if (q.has("demo")) return q.get("demo") !== "av";
  return !!sessionStorage.getItem("bygglogg-demo") || !import.meta.env.VITE_SUPABASE_URL;
}

function velg(): Profil {
  try {
    const fraAdresse = demoFraAdresse();
    if (fraAdresse) return fraAdresse;
    if (sessionStorage.getItem("bygglogg-demo") === "thaugland-aoaidjjc") return THAUGLAND;
    // I demoen vises aldri N L Austnes – bare den ekte appen er Austnes
    return demoAktiv() ? DEMO : AUSTNES;
  } catch { return AUSTNES; }
}
export const PROFIL: Profil = velg();
