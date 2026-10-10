// Utstyr: verktøy, arbeidstøy og forbruk hver ansatt har tatt ut på sin utstyrskonto i Visma.
import { addMonths } from "./ferie";

export type UtstyrKategori = "verktoy" | "arbeidstoy" | "forbruk";
export type UtstyrStatus = "i_bruk" | "service" | "levert" | "tapt";
export interface Utstyr {
  id: string; ansatt_id: string | null; kilde: "visma" | "manuell"; visma_ordrenr: number | null; dato: string;
  varenr: string; nobb_nr: string; beskrivelse: string; antall: number; enhet: string; pris: number;
  kategori: UtstyrKategori; kategori_manuell: boolean; serienr: string; bilde_sti: string | null;
  status: UtstyrStatus; merknad: string;
}
export interface UtstyrGrenser { arbeidstoy: number | null; verktoy: number | null; sammeMnd: number }

export const KATEGORI: Record<UtstyrKategori, string> = { verktoy: "Verktøy", arbeidstoy: "Arbeidstøy", forbruk: "Forbruk" };
export const STATUS: Record<UtstyrStatus, string> = { i_bruk: "I bruk", service: "Til service", levert: "Levert inn", tapt: "Tapt" };

export const verdi = (u: Pick<Utstyr, "antall" | "pris">) => Math.round(u.antall * u.pris);
export const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;

/** Sum og antall uttak per kategori i et kalenderår, og siste uttak */
export function aarsforbruk(u: Utstyr[], ansattId: string, aar: number) {
  const egne = u.filter((x) => x.ansatt_id === ansattId && x.dato.startsWith(`${aar}`));
  const per = (k: UtstyrKategori) => {
    const r = egne.filter((x) => x.kategori === k);
    return { sum: r.reduce((n, x) => n + verdi(x), 0), uttak: new Set(r.map((x) => `${x.visma_ordrenr ?? x.id}`)).size, siste: r.reduce<string | null>((m, x) => (!m || x.dato > m ? x.dato : m), null) };
  };
  return { verktoy: per("verktoy"), arbeidstoy: per("arbeidstoy"), forbruk: per("forbruk") };
}

/** Andel av grensen brukt (0–1+), eller null når det ikke er satt grense */
export const andel = (sum: number, grense: number | null) => (grense ? sum / grense : null);

/** Samme vare (verktøy/arbeidstøy) tatt ut igjen innen grensen: [tidligere, ny] */
export function gjentak(u: Utstyr[], ansattId: string, maaneder: number) {
  if (!maaneder) return [] as [Utstyr, Utstyr][];
  const egne = u.filter((x) => x.ansatt_id === ansattId && x.kategori !== "forbruk" && x.varenr && !/^(1000|T)$/.test(x.varenr))
    .sort((a, b) => a.dato.localeCompare(b.dato));
  const ut: [Utstyr, Utstyr][] = [];
  const sist = new Map<string, Utstyr>();
  for (const x of egne) {
    const f = sist.get(x.varenr);
    if (f && x.dato < addMonths(f.dato, maaneder) && x.visma_ordrenr !== f.visma_ordrenr) ut.push([f, x]);
    sist.set(x.varenr, x);
  }
  return ut;
}
