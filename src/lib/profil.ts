// Plattform-versjonen av ByggLogg (for salg til flere bedrifter). Ekte brukere får navn, adresse og sted fra bedriftens
// profil i databasen (se firma()). Profilen her brukes før innlogging og i demoen: en nøytral «Demo Bygg AS», eller en
// bedrifts drakt via en unik lenke (/demo/<kode>) for å vise fram ByggLogg til nye kunder.
import type { Bedrift, Tema } from "./ferie";

export interface Profil {
  id: "bygglogg" | "thaugland";
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
  /** Firmaopplysninger til rapporter og sluttdokumentasjon */
  orgnr: string; adresse: string; postnr: string; poststed: string; telefon: string;
  /** Kort linje om hva bedriften driver med */
  beskrivelse: string;
}

const GENERISK: Profil = {
  id: "bygglogg", undertittel: "Demo Bygg AS", firma: "Demo Bygg AS", tema: "byggfag",
  sted: { navn: "Ålesund", lat: 62.472, lon: 6.155 }, kampanje: "Kampanje fra Byggfag",
  demoBrukere: [["stale@demo.no", "Kari Hansen (leder)"], ["mads@demo.no", "Ola Berg (snekker)"], ["jim@demo.no", "Jon Lie (lager)"], ["karianne@demo.no", "Anne Dahl (kjøkken)"]],
  snekkere: true,
  orgnr: "", adresse: "Eksempelvegen 1", postnr: "6000", poststed: "Ålesund", telefon: "",
  beskrivelse: "Tømrer · Byggevarer · Kjøkken og interiør",
};

const THAUGLAND: Profil = {
  id: "thaugland", undertittel: "Thaugland · Trelast og byggevarer siden 1913", firma: "Thaugland", tema: "thaugland",
  sted: { navn: "Oslo", lat: 59.913, lon: 10.752 }, kampanje: "Månedens tilbud",
  demoBrukere: [["stale@demo.no", "Kari Thorsen (daglig leder)"], ["mads@demo.no", "Martin Lie (proffsalg)"], ["jim@demo.no", "Erik Dahl (lager og levering)"], ["karianne@demo.no", "Ingrid Berg (butikk)"]],
  snekkere: false,
  orgnr: "", adresse: "", postnr: "", poststed: "Oslo", telefon: "", beskrivelse: "Trelast og byggevarer",
};

/** Unike, delbare demo-adresser: /demo/<kode>. Koden er vanskelig å gjette, så bare de som får lenken ser drakten. */
const DEMO_LENKER: Record<string, Profil> = { "thaugland-aoaidjjc": THAUGLAND };

/** Demo-drakt fra adressen (/demo/<kode>), eller null */
export function demoFraAdresse(): Profil | null {
  const m = location.pathname.match(/^\/demo\/([a-z0-9-]+)\/?$/i);
  return m ? DEMO_LENKER[m[1]!.toLowerCase()] ?? null : null;
}

function velg(): Profil {
  try {
    const fraAdresse = demoFraAdresse();
    if (fraAdresse) return fraAdresse;
    return sessionStorage.getItem("bygglogg-demo") === "thaugland-aoaidjjc" ? THAUGLAND : GENERISK;
  } catch { return GENERISK; }
}
export const PROFIL: Profil = velg();

/** Firmaopplysninger som vises i appen: fra bedriftens profil i databasen, ellers fra drakten */
export interface Firma {
  navn: string; undertittel: string; beskrivelse: string; orgnr: string; telefon: string; epost: string;
  /** «Gate 1, 1234 Sted» */
  adresseLinje: string;
  /** Navn på kampanjekortet */
  kampanje: string;
}

export function firma(b?: Bedrift): Firma {
  const linje = (a: string, nr: string, sted: string) => [a, [nr, sted].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (b) return {
    navn: b.navn, undertittel: b.undertittel || b.navn, beskrivelse: b.undertittel && b.undertittel !== b.navn ? b.undertittel : "",
    orgnr: b.orgnr ?? "", telefon: b.telefon ?? "", epost: b.epost ?? "",
    adresseLinje: linje(b.adresse ?? "", b.postnr ?? "", b.poststed ?? ""), kampanje: b.kampanje_tittel || "Kampanje",
  };
  return {
    navn: PROFIL.firma, undertittel: PROFIL.undertittel, beskrivelse: PROFIL.beskrivelse, orgnr: PROFIL.orgnr, telefon: PROFIL.telefon, epost: "",
    adresseLinje: linje(PROFIL.adresse, PROFIL.postnr, PROFIL.poststed), kampanje: PROFIL.kampanje,
  };
}

/** 832507652 -> «832 507 652» */
export const orgnrVis = (nr: string) => { const n = nr.replace(/\s/g, ""); return /^\d{9}$/.test(n) ? n.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") : nr; };
