// Tilbudsoppfølging: åpne tilbud fra Visma (ordretype 5) som bør følges opp med en telefon.
// Et tilbud skal følges opp når det har ligget i en uke uten kontakt, eller når datoen for neste kontakt er nådd.

export type TilbudStatus = "apen" | "vunnet" | "avsluttet" | "borte";
export type TilbudHandling = "ringt" | "utsett" | "tapt" | "ikke_aktuelt" | "gjenapne" | "notat";
export interface TilbudLogg { dato: string; av: string | null; hva: TilbudHandling; notat: string }
export interface Tilbud {
  id: string; visma_ordrenr: number; tilbudsnr: number | null; dato: string | null; kunde: string; kunde_nr: number | null; referanse: string;
  belop: number; selger_nr: number | null; selger_navn: string; avdeling_nr: number | null; status: TilbudStatus; status_dato: string | null;
  utfall: "tapt" | "ikke_aktuelt" | null; sist_kontakt: string | null; neste_kontakt: string | null; notat: string; logg: TilbudLogg[];
}

/** Dager før et tilbud uten kontakt skal følges opp */
export const FORSTE_OPPFOLGING = 7;
/** Tilbud eldre enn dette uten kontakt regnes som gamle og vises ikke i «Følg opp nå» */
export const GAMMELT = 120;
/** Minste beløp som vises som standard (små tilbud kan tas med) */
export const MIN_BELOP = 5000;

const dagerMellom = (fra: string, til: string) => Math.round((Date.parse(`${til}T12:00:00Z`) - Date.parse(`${fra}T12:00:00Z`)) / 864e5);
export const alder = (t: Pick<Tilbud, "dato">, idag: string) => (t.dato ? dagerMellom(t.dato, idag) : 0);
export const plussDager = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Åpent i Visma og ikke merket tapt / ikke aktuelt i ByggLogg */
export const aapent = (t: Pick<Tilbud, "status" | "utfall">) => t.status === "apen" && !t.utfall;

/** Skal følges opp i dag (eller er på overtid) */
export function folgOppNaa(t: Tilbud, idag: string) {
  if (!aapent(t)) return false;
  if (t.neste_kontakt) return t.neste_kontakt <= idag;
  const a = alder(t, idag);
  return a >= FORSTE_OPPFOLGING && a <= GAMMELT;
}

/** Når tilbudet skal følges opp (neste kontakt, eller en uke etter tilbudsdato) */
export const oppfolgingsdato = (t: Tilbud) => t.neste_kontakt ?? (t.dato ? plussDager(t.dato, FORSTE_OPPFOLGING) : null);

/** Mest på overtid først, deretter største beløp */
export const sorterTilbud = (a: Tilbud, b: Tilbud) =>
  (oppfolgingsdato(a) ?? "9999").localeCompare(oppfolgingsdato(b) ?? "9999") || b.belop - a.belop;

/** Vunnet og tapt i perioden (etter datoen tilbudet ble avgjort) */
export function treff(liste: Tilbud[], fra: string, til: string) {
  const i = (d: string | null) => !!d && d >= fra && d <= til;
  const vunnet = liste.filter((t) => t.status === "vunnet" && i(t.status_dato));
  const sisteLogg = (t: Tilbud) => [...t.logg].reverse().find((l) => l.hva === "tapt")?.dato ?? t.status_dato;
  const tapt = liste.filter((t) => t.status !== "vunnet" && t.utfall === "tapt" && i(sisteLogg(t)));
  const sum = (x: Tilbud[]) => x.reduce((s, t) => s + t.belop, 0);
  const avgjort = vunnet.length + tapt.length;
  return { vunnet: vunnet.length, vunnetKr: sum(vunnet), tapt: tapt.length, taptKr: sum(tapt), treff: avgjort ? Math.round((vunnet.length / avgjort) * 100) : null };
}
