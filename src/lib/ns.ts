// ByggLogg Kontrakt: regler per NS-standard og fristmotoren.
// Appen holder orden på frister og varsler – den avgjør ingen juridiske spørsmål.
// Regeltabellen skal kvalitetssikres av advokat før bruk i drift. Teksten i standardene gjengis ikke,
// bare punktnumre (Standard Norge har opphavsretten).

export type Standard = "8405" | "8406" | "8407" | "8415" | "8416" | "8417";
export type SakType = "endring" | "irregulaer" | "medvirkning" | "forsering" | "plunder_heft" | "rigg_drift" | "indeks" | "mengde" | "annet";
export type SakStatus = "ny" | "varslet" | "krav" | "avklart" | "avvist" | "bestridt" | "lukket";

export const STANDARDER: Record<Standard, { navn: string; rolle: "hoved" | "under"; speiler: "8405" | "8406" | "8407" }> = {
  "8405": { navn: "NS 8405 Utførelsesentreprise", rolle: "hoved", speiler: "8405" },
  "8406": { navn: "NS 8406 Forenklet utførelsesentreprise", rolle: "hoved", speiler: "8406" },
  "8407": { navn: "NS 8407 Totalentreprise", rolle: "hoved", speiler: "8407" },
  "8415": { navn: "NS 8415 Underentreprise (utførelse)", rolle: "under", speiler: "8405" },
  "8416": { navn: "NS 8416 Forenklet underentreprise", rolle: "under", speiler: "8406" },
  "8417": { navn: "NS 8417 Underentreprise (totalentreprise)", rolle: "under", speiler: "8407" },
};

export const SAKTYPER: Record<SakType, { navn: string; hjelp: string }> = {
  endring: { navn: "Endringsordre", hjelp: "Byggherren har bestilt en endring skriftlig." },
  irregulaer: { navn: "Pålegg uten endringsordre", hjelp: "Noen fra byggherren ber om noe som ikke står i kontrakten." },
  medvirkning: { navn: "Svikt fra byggherren", hjelp: "Tegninger, beslutninger, underlag eller andres arbeid kommer for sent eller er feil." },
  forsering: { navn: "Forsering", hjelp: "Byggherren holder fast på en frist vi mener vi har krav på å få forlenget." },
  plunder_heft: { navn: "Plunder og heft", hjelp: "Mange små forstyrrelser gjør arbeidet tregere enn planlagt." },
  rigg_drift: { navn: "Rigg og drift", hjelp: "Endringene gir økte kostnader til rigg og drift." },
  indeks: { navn: "Indeksregulering", hjelp: "Prisstigning som skal reguleres etter kontrakten." },
  mengde: { navn: "Økte mengder", hjelp: "Mengdene blir vesentlig større enn i kontrakten." },
  annet: { navn: "Annet", hjelp: "Noe annet som kan gi krav på tid eller penger." },
};

/** Er varslingsfristen for denne typen preklusiv (kravet kan tapes) etter standarden?
 *  NS 8405/8407 (og 8415/8417): stort sett ja. NS 8406 (og 8416): i langt mindre grad, men passivitet kan likevel koste. */
export function preklusiv(std: Standard, type: SakType): boolean {
  const s = STANDARDER[std].speiler;
  if (type === "endring" || type === "annet") return false;
  if (s === "8406") return false; // i langt mindre grad preklusivt – fristen vises likevel
  return true;
}

/** Punkt i standarden saken gjelder (der det er kontrollert). Tom streng = ikke kontrollert ennå. */
export function punkt(std: Standard, type: SakType): string {
  const s = STANDARDER[std].speiler;
  const t: Partial<Record<"8405" | "8406" | "8407", Partial<Record<SakType, string>>>> = {
    "8405": { endring: "pkt. 22.1", medvirkning: "pkt. 21.1", plunder_heft: "pkt. 25.3", rigg_drift: "pkt. 25.3" },
    "8406": { endring: "pkt. 19.1" },
    "8407": { endring: "pkt. 31.1", medvirkning: "pkt. 34.1.2", plunder_heft: "pkt. 34.1.3", rigg_drift: "pkt. 34.1.3" },
  };
  return t[s]?.[type] ?? "";
}

/** Skriftlighet: e-post gjelder bare som skriftlig hvis det er avtalt (NS 8405 pkt. 8, NS 8406 pkt. 7). */
export function epostHolder(std: Standard, avtalt: boolean): boolean {
  return avtalt || STANDARDER[std].speiler === "8407";
}

// ---------------------------------------------------------------------------
// Fristmotoren
// ---------------------------------------------------------------------------
export type Kontrakt = { id: string; standard: Standard; overtakelse: string | null; sluttfrist: string | null; varsel_dager: number };
export type Sak = { id: string; nr: number; type: SakType; tittel: string; oppdaget: string; status: SakStatus };
export type Varsel = { sak_id: string; retning: "ut" | "inn"; type: "varsel" | "krav" | "svar" | "innsigelse" | "forbehold"; sendt: string | null; svar_tid: string | null };
export type KFrist = { id: string; type: string; tittel: string; dato: string; dagmulkt: boolean; ferdig: boolean };

export type Niva = "over" | "idag" | "snart" | "ok";
export type Frist = { hva: string; dato: string; niva: Niva; sak_id?: string; preklusiv: boolean; hvem: "prosjektleder" | "daglig_leder" };

const dag = (iso: string) => iso.slice(0, 10);
export function leggTil(iso: string, dager: number): string {
  const d = new Date(`${dag(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dager);
  return d.toISOString().slice(0, 10);
}
export function leggTilMnd(iso: string, mnd: number): string {
  const [a, m, d] = dag(iso).split("-").map(Number) as [number, number, number];
  const slutt = new Date(Date.UTC(a, m - 1 + mnd + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + mnd, Math.min(d, slutt), 12)).toISOString().slice(0, 10);
}
const dagerMellom = (fra: string, til: string) =>
  Math.round((Date.parse(`${dag(til)}T12:00:00Z`) - Date.parse(`${dag(fra)}T12:00:00Z`)) / 864e5);

export function niva(dato: string, idag: string, snartDager = 3): Niva {
  const n = dagerMellom(idag, dato);
  return n < 0 ? "over" : n === 0 ? "idag" : n <= snartDager ? "snart" : "ok";
}

/** Alle åpne frister for en kontrakt, sortert med det mest presserende først.
 *  Purring: er en frist passert, går den også til daglig leder. */
export function frister(k: Kontrakt, saker: Sak[], varsler: Varsel[], kfrister: KFrist[], idag: string): Frist[] {
  const ut: Frist[] = [];
  const legg = (f: Omit<Frist, "niva" | "hvem">) => {
    const n = niva(f.dato, idag);
    ut.push({ ...f, niva: n, hvem: n === "over" ? "daglig_leder" : "prosjektleder" });
  };
  for (const s of saker) {
    if (s.status === "lukket" || s.status === "avklart" || s.status === "avvist") continue;
    const v = varsler.filter((x) => x.sak_id === s.id && x.sendt);
    const sendtVarsel = v.some((x) => x.retning === "ut" && (x.type === "varsel" || x.type === "krav"));
    if (!sendtVarsel && s.type !== "endring") {
      legg({ hva: `Varsle byggherren: ${s.tittel} (sak ${s.nr})`, dato: leggTil(s.oppdaget, k.varsel_dager), sak_id: s.id, preklusiv: preklusiv(k.standard, s.type) });
    }
    // Venter vi på svar fra byggherren? Følg opp etter en uke.
    const sisteUt = v.filter((x) => x.retning === "ut").map((x) => x.sendt!).sort().pop();
    const fattSvar = v.some((x) => x.retning === "inn" || x.svar_tid);
    if (sisteUt && !fattSvar) {
      legg({ hva: `Følg opp svar fra byggherren (sak ${s.nr})`, dato: leggTil(sisteUt, 7), sak_id: s.id, preklusiv: false });
    }
  }
  for (const f of kfrister) {
    if (f.ferdig) continue;
    legg({ hva: f.tittel + (f.dagmulkt ? " (dagmulkt)" : ""), dato: f.dato, preklusiv: false });
  }
  if (k.overtakelse) {
    const sluttoppgjorSendt = varsler.some((x) => x.retning === "ut" && x.type === "forbehold" && x.sendt);
    if (!sluttoppgjorSendt) legg({ hva: "Send sluttoppstilling med alle krav og forbehold", dato: leggTilMnd(k.overtakelse, 2), preklusiv: true });
  }
  const rang: Record<Niva, number> = { over: 0, idag: 1, snart: 2, ok: 3 };
  return ut.sort((a, b) => rang[a.niva] - rang[b.niva] || a.dato.localeCompare(b.dato));
}

// ---------------------------------------------------------------------------
// Radene slik de ligger i databasen (0086_kontrakt.sql)
// ---------------------------------------------------------------------------
export type FristType = "delfrist" | "sluttfrist" | "ettaarsbefaring" | "garanti" | "annet";
export type VarselType = Varsel["type"];

export interface NsKontrakt extends Kontrakt {
  prosjekt_id: string;
  kontraktssum: number | null;
  dagmulkt_promille: number | null;
  sikkerhet: string;
  /** Byggherrens representant */
  bh_navn: string; bh_epost: string; bh_telefon: string;
  /** Er det avtalt at e-post gjelder som skriftlig? */
  epost_skriftlig: boolean;
  /** Krever byggherren egne skjema for varsler? */
  bh_skjema: boolean;
  notat: string;
  opprettet_av: string | null; opprettet: string; oppdatert: string;
}
export interface KontraktFrist extends KFrist { kontrakt_id: string; type: FristType }
export interface NsSak extends Sak {
  kontrakt_id: string; prosjekt_id: string;
  beskrivelse: string;
  meldt_av: string | null; ansvarlig_id: string | null;
  avvik_id: string | null; dagbok_id: string | null;
  belop: number | null;
  /** Krav om fristforlengelse i dager */
  dager: number | null;
  opprettet: string;
}
export interface NsVarsel extends Varsel {
  id: string;
  tekst: string;
  sendt_til: string;
  lest: string | null;
  svar: string;
  opprettet_av: string | null; opprettet: string;
}

export type NyKontrakt = Partial<Omit<NsKontrakt, "id" | "opprettet_av" | "opprettet" | "oppdatert">> & { id?: string; prosjekt_id: string; standard: Standard };
export type NyKontraktFrist = Partial<Omit<KontraktFrist, "id">> & { id?: string; kontrakt_id: string; tittel: string; dato: string };
export type NySak = Partial<Pick<NsSak, "beskrivelse" | "ansvarlig_id" | "avvik_id" | "dagbok_id" | "status" | "belop" | "dager" | "oppdaget">> & { id?: string; kontrakt_id: string; type: SakType; tittel: string };
export type NyttVarsel = Partial<Pick<NsVarsel, "tekst" | "sendt" | "sendt_til" | "lest" | "svar" | "svar_tid">> & { id?: string; sak_id: string; retning: NsVarsel["retning"]; type: VarselType };

/** Status saken får når et varsel sendes ut (samme regel som vakten i databasen) */
export function statusEtterVarsel(s: SakStatus, type: VarselType): SakStatus {
  if (type === "krav" && (s === "ny" || s === "varslet")) return "krav";
  if (type === "varsel" && s === "ny") return "varslet";
  return s;
}

// ---------------------------------------------------------------------------
// Visning og skjema (Kontrakt-fanen på prosjektet)
// ---------------------------------------------------------------------------
export const SAK_STATUS: Record<SakStatus, string> = {
  ny: "Ny", varslet: "Varslet", krav: "Krav sendt", avklart: "Avklart", avvist: "Avvist", bestridt: "Bestridt", lukket: "Lukket",
};
/** Fargen på statusbrikken (samme klasser som ellers i appen) */
export const SAK_CHIP: Record<SakStatus, "venter" | "godkjent" | "avslatt" | "demo"> = {
  ny: "avslatt", varslet: "venter", krav: "venter", avklart: "godkjent", avvist: "demo", bestridt: "avslatt", lukket: "demo",
};
export const NIVA_TEKST: Record<Niva, string> = { over: "Passert", idag: "I dag", snart: "Snart", ok: "" };
export const NIVA_CHIP: Record<Niva, "venter" | "godkjent" | "avslatt" | "demo"> = { over: "avslatt", idag: "avslatt", snart: "venter", ok: "demo" };
export const FRISTTYPER: Record<FristType, string> = {
  delfrist: "Delfrist", sluttfrist: "Sluttfrist", ettaarsbefaring: "Ettårsbefaring", garanti: "Garanti", annet: "Annet",
};
/** Åpen sak = noe som fortsatt skal følges opp */
export const aapenSak = (s: Pick<Sak, "status">) => s.status !== "lukket" && s.status !== "avklart" && s.status !== "avvist";
/** Åpne saker først, deretter nyeste først */
export function sorterSaker<T extends Pick<Sak, "status" | "nr">>(saker: T[]): T[] {
  return [...saker].sort((a, b) => Number(aapenSak(b)) - Number(aapenSak(a)) || b.nr - a.nr);
}

/** Feltene i kontraktsskjemaet slik de skrives inn */
export type KontraktSkjema = {
  standard: Standard; kontraktssum: string; dagmulkt: string; sluttfrist: string; overtakelse: string; varsel_dager: string;
  bh_navn: string; bh_epost: string; bh_telefon: string; epost_skriftlig: boolean; bh_skjema: boolean; sikkerhet: string; notat: string;
};

export function tilSkjema(k?: NsKontrakt | null): KontraktSkjema {
  const tall = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
  return {
    standard: k?.standard ?? "8405", kontraktssum: tall(k?.kontraktssum), dagmulkt: tall(k?.dagmulkt_promille),
    sluttfrist: k?.sluttfrist ?? "", overtakelse: k?.overtakelse ?? "", varsel_dager: String(k?.varsel_dager ?? 5),
    bh_navn: k?.bh_navn ?? "", bh_epost: k?.bh_epost ?? "", bh_telefon: k?.bh_telefon ?? "",
    epost_skriftlig: k?.epost_skriftlig ?? false, bh_skjema: k?.bh_skjema ?? false, sikkerhet: k?.sikkerhet ?? "", notat: k?.notat ?? "",
  };
}

/** «2 450 000», «2450000,50» og «1,5» → tall. Tomt → null. Ugyldig → NaN. */
export function lesTall(s: string): number | null {
  const t = s.replace(/[\s ]/g, "").replace(/^kr/i, "").replace(",", ".");
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Skjemaet → rad som kan lagres, eller en feilmelding på norsk (samme grenser som databasen) */
export function fraSkjema(f: KontraktSkjema, prosjekt_id: string, id?: string): { ok: NyKontrakt } | { feil: string } {
  if (!(f.standard in STANDARDER)) return { feil: "Velg hvilken standard kontrakten bygger på." };
  const sum = lesTall(f.kontraktssum);
  if (Number.isNaN(sum)) return { feil: "Kontraktssummen må være et tall (kroner eks. mva)." };
  const dm = lesTall(f.dagmulkt);
  if (Number.isNaN(dm) || (dm != null && dm > 100)) return { feil: "Dagmulkten må være mellom 0 og 100 promille." };
  const vd = lesTall(f.varsel_dager);
  if (vd == null || Number.isNaN(vd) || !Number.isInteger(vd) || vd < 1 || vd > 30) return { feil: "Egen varslingsfrist må være mellom 1 og 30 dager." };
  const epost = f.bh_epost.trim();
  if (epost && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) return { feil: "E-postadressen til byggherrens representant ser ikke riktig ut." };
  return { ok: {
    ...(id ? { id } : {}), prosjekt_id, standard: f.standard, kontraktssum: sum, dagmulkt_promille: dm,
    sluttfrist: f.sluttfrist || null, overtakelse: f.overtakelse || null, varsel_dager: vd,
    bh_navn: f.bh_navn.trim(), bh_epost: epost, bh_telefon: f.bh_telefon.trim(),
    epost_skriftlig: f.epost_skriftlig, bh_skjema: f.bh_skjema, sikkerhet: f.sikkerhet.trim(), notat: f.notat.trim(),
  } };
}
