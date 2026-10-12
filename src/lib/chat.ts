// Meldinger i appen: felles kanal, én tråd per prosjekt og private samtaler mellom to ansatte.
import type { Ansatt } from "./ferie";
import type { Prosjekt } from "./timer";

export type Melding = {
  id: string; ansatt_id: string; kanal: string; tekst: string; bilde_sti: string | null;
  opprettet: string; endret: string | null;
};
export type Lest = Record<string, string>; // kanal -> sist lest (ISO)

export const FELLES = "felles";
export const prosjektKanal = (id: string) => `p:${id}`;
/** Privat samtale: id-ene sortert så begge får samme kanal */
export const dmKanal = (a: string, b: string) => (a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`);
export const erDm = (k: string) => k.startsWith("dm:");
/** Den andre i en privat samtale */
export const motpart = (k: string, meg: string) => { const [, a, b] = k.split(":"); return a === meg ? b : a; };

export function kanalNavn(k: string, meg: string, ansatte: Ansatt[], prosjekter: Prosjekt[]): string {
  if (k === FELLES) return "Alle i firmaet";
  if (k.startsWith("p:")) { const p = prosjekter.find((x) => x.id === k.slice(2)); return p ? `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}` : "Prosjekt"; }
  if (erDm(k)) return ansatte.find((a) => a.id === motpart(k, meg))?.navn ?? "Privat";
  return k;
}

/** Antall uleste per kanal (meldinger fra andre etter sist lest) */
export function uleste(meldinger: Melding[], lest: Lest, meg: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of meldinger) {
    if (x.ansatt_id === meg) continue;
    const l = lest[x.kanal];
    if (!l || x.opprettet > l) m.set(x.kanal, (m.get(x.kanal) ?? 0) + 1);
  }
  return m;
}

export type KanalRad = { kanal: string; siste: Melding | null; uleste: number };

/** Kanallista: felles øverst, så samtaler med aktivitet (nyeste først) */
export function kanaler(meldinger: Melding[], lest: Lest, meg: string): KanalRad[] {
  const siste = new Map<string, Melding>();
  for (const x of meldinger) { const s = siste.get(x.kanal); if (!s || x.opprettet > s.opprettet) siste.set(x.kanal, x); }
  const u = uleste(meldinger, lest, meg);
  const rader = [...siste.keys()].filter((k) => k !== FELLES)
    .map((k) => ({ kanal: k, siste: siste.get(k)!, uleste: u.get(k) ?? 0 }))
    .sort((a, b) => b.siste.opprettet.localeCompare(a.siste.opprettet));
  return [{ kanal: FELLES, siste: siste.get(FELLES) ?? null, uleste: u.get(FELLES) ?? 0 }, ...rader];
}

/** Klokkeslett i dag, ellers dato */
export function tidTekst(iso: string, naa = new Date()): string {
  const t = new Date(iso);
  const sammeDag = t.toDateString() === naa.toDateString();
  const igar = new Date(naa.getTime() - 864e5).toDateString() === t.toDateString();
  const kl = t.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  if (sammeDag) return kl;
  if (igar) return `i går ${kl}`;
  return t.toLocaleDateString("nb-NO", { day: "numeric", month: "short" }) + ` ${kl}`;
}

/** Initialer til avatar */
export const initialer = (navn: string) => navn.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
/** Fast farge per person */
export function personFarge(id: string): string {
  const f = ["#0A1EBE", "#18804A", "#C2410C", "#7C3AED", "#0E7490", "#BE185D", "#A16207", "#4338CA", "#15803D"];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return f[h % f.length]!;
}
