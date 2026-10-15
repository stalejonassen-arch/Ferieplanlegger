// Lønnsgrunnlaget som lønnslinjer (ansatt × lønnsart × antall), klare for Visma Lønn eller Tripletex.
// Bedriften velger selv hvilket lønnsartnummer hver type skal føres på.
import type { LonnRad } from "./lonn";
import type { LonnTimer } from "./timer";

export type LonnSystem = "excel" | "visma_lonn" | "tripletex";
export type Art = "normal" | "ot50" | "ot100" | "km" | "reisetid" | "ferie" | "egenmelding" | "sykmelding" | "syktBarn";
export type Lonnsarter = Partial<Record<Art, string>>;
export interface LonnOppsett { system: LonnSystem; arter: Lonnsarter }

export const ARTER: { art: Art; navn: string; enhet: string; hjelp?: string }[] = [
  { art: "normal", navn: "Normaltid", enhet: "timer", hjelp: "Timelønn. La stå tom for fastlønnede, eller hvis timene allerede hentes fra timelisten." },
  { art: "ot50", navn: "Overtid 50 %", enhet: "timer" },
  { art: "ot100", navn: "Overtid 100 %", enhet: "timer" },
  { art: "km", navn: "Kjøregodtgjørelse", enhet: "km" },
  { art: "reisetid", navn: "Reisetid", enhet: "timer" },
  { art: "ferie", navn: "Ferie", enhet: "dager", hjelp: "Godkjente feriedager i måneden (feriepengetrekk)." },
  { art: "egenmelding", navn: "Egenmelding", enhet: "dager" },
  { art: "sykmelding", navn: "Sykmelding", enhet: "dager" },
  { art: "syktBarn", navn: "Sykt barn", enhet: "dager" },
];
export const SYSTEMER: { id: LonnSystem; navn: string }[] = [
  { id: "excel", navn: "Regneark (Excel)" },
  { id: "visma_lonn", navn: "Visma Lønn (importfil)" },
  { id: "tripletex", navn: "Tripletex lønn" },
];

export interface Linje { ansatt_id: string; ansattnr: string; navn: string; art: Art; kode: string; antall: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lønnslinjer for måneden. Typer uten lønnsartnummer og linjer med 0 tas ikke med. */
export function lonnLinjer(timer: LonnTimer[], ferie: LonnRad[], arter: Lonnsarter): Linje[] {
  const ferieDager = new Map(ferie.map((f) => [f.ansatt.id, f.dager]));
  const ut: Linje[] = [];
  for (const t of timer) {
    const verdi: Record<Art, number> = {
      normal: t.normal, ot50: t.ot50, ot100: t.ot100, km: t.km, reisetid: t.reisetid,
      ferie: ferieDager.get(t.ansatt.id) ?? 0, egenmelding: t.egenmelding, sykmelding: t.sykmelding, syktBarn: t.syktBarn,
    };
    for (const { art } of ARTER) {
      const kode = arter[art]?.trim();
      const antall = r2(verdi[art]);
      if (!kode || !antall) continue;
      ut.push({ ansatt_id: t.ansatt.id, ansattnr: (t.ansatt.ansattnr ?? "").trim(), navn: t.ansatt.navn, art, kode, antall });
    }
  }
  return ut;
}

/** Ansatte som har linjer men mangler ansattnummer (Visma Lønn kjenner dem bare på nummer). */
export const utenAnsattnr = (linjer: Linje[]) => [...new Set(linjer.filter((l) => !l.ansattnr).map((l) => l.navn))];

/**
 * Importfil for Visma Lønn: Rutiner → Registrering → Import variable lønnsdata.
 * Semikolon, punktum som desimaltegn, ingen overskrift. 17 kolonner:
 * lønnsår; lønnskjøring; ansattnr; lønnsart; grunnlag; antall; sats; beløp; konto; motkonto; R1–R6; trekkode.
 * Sats og beløp står tomme, så Visma Lønn bruker satsen som ligger på den ansatte eller lønnsarten.
 */
export function vismaLonnFil(linjer: Linje[], aar: number, lonnskjoring = 1) {
  const tall = (n: number) => String(r2(n));
  return linjer.filter((l) => l.ansattnr).map((l) =>
    [aar, lonnskjoring, l.ansattnr, l.kode, "", tall(l.antall), "", "", "", "", "", "", "", "", "", "", 0].join(";"),
  ).join("\r\n") + "\r\n";
}

export function lastNedTekst(innhold: string, filnavn: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([innhold], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filnavn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
