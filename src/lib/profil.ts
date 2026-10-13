// Hvilken bedrift appen vises for. Den ekte appen er alltid N L Austnes; demoen kan vises i andre bedrifters drakt
// (f.eks. ?demo=thaugland) for å vise fram ByggLogg til nye kunder. Bare utseende, navn og eksempeldata endres.
import type { Tema } from "./ferie";

export interface Profil {
  id: "austnes" | "thaugland";
  /** Liten linje over «ByggLogg» i toppen */
  undertittel: string;
  firma: string;
  tema: Tema;
  /** Sted for værmeldingen */
  sted: { navn: string; lat: number; lon: number };
  /** Navn på kampanjekortet */
  kampanje: string;
  /** Innlogging i demoen: e-post og navn */
  demoBrukere: [string, string][];
  /** Har bedriften egne snekkere/montører? */
  snekkere: boolean;
}

const AUSTNES: Profil = {
  id: "austnes", undertittel: "Byggfag · N L Austnes AS", firma: "N L Austnes AS", tema: "byggfag",
  sted: { navn: "Haramsøy", lat: 62.665, lon: 6.405 }, kampanje: "Kampanje fra Byggfag",
  demoBrukere: [["stale@demo.no", "Ståle (leder)"], ["mads@demo.no", "Mads Kjerstad"], ["jim@demo.no", "Jim Kato"], ["karianne@demo.no", "Karianne"]],
  snekkere: true,
};

const THAUGLAND: Profil = {
  id: "thaugland", undertittel: "Thaugland · Trelast og byggevarer siden 1913", firma: "Thaugland", tema: "thaugland",
  sted: { navn: "Oslo", lat: 59.913, lon: 10.752 }, kampanje: "Månedens tilbud",
  demoBrukere: [["stale@demo.no", "Kari Thorsen (daglig leder)"], ["mads@demo.no", "Martin Lie (proffsalg)"], ["jim@demo.no", "Erik Dahl (lager og levering)"], ["karianne@demo.no", "Ingrid Berg (butikk)"]],
  snekkere: false,
};

function velg(): Profil {
  try {
    // Lest før api.ts rydder adressen, så vi ser både ?demo=… og lagret valg
    const q = new URLSearchParams(location.search).get("demo");
    const valg = q ?? sessionStorage.getItem("bygglogg-demo");
    return valg === "thaugland" ? THAUGLAND : AUSTNES;
  } catch { return AUSTNES; }
}
export const PROFIL: Profil = velg();
