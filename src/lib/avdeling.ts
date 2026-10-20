// Salg per avdeling fra Visma (f.eks. Kjøkken og Interiør).
// Reell fortjeneste = dekningsbidraget fra Visma. Ordre uten innkjøpspris (kostnad 0) gir 100 % DG
// og holdes derfor utenfor DG og fortjeneste, men vises for seg så de kan rettes i Visma.
export interface VismaAvdeling { nr: number; navn: string }
export interface AvdelingSalg {
  visma_ordrenr: number; avdeling_nr: number; ordredato: string | null; fakturadato: string | null; kunde: string;
  selger_nr: number | null; ordresum: number; omsetning: number; db: number; kostnad: number;
}

/** Ordre der innkjøpsprisen mangler (all omsetning blir dekningsbidrag) */
export const manglerKost = (o: AvdelingSalg) => o.omsetning !== 0 && o.kostnad === 0;

export interface Sum {
  antall: number; omsetning: number;
  /** Bare ordre med innkjøpspris */
  medKost: { omsetning: number; db: number; dg: number | null };
  utenKost: { antall: number; omsetning: number };
}

export function summer(ordre: AvdelingSalg[]): Sum {
  const ut: Sum = { antall: 0, omsetning: 0, medKost: { omsetning: 0, db: 0, dg: null }, utenKost: { antall: 0, omsetning: 0 } };
  for (const o of ordre) {
    if (!o.fakturadato || o.omsetning === 0) continue;
    // Kreditnota (negativ) opphever et salg
    ut.antall += o.omsetning > 0 ? 1 : -1;
    ut.omsetning += o.omsetning;
    if (manglerKost(o)) { ut.utenKost.antall += o.omsetning > 0 ? 1 : -1; ut.utenKost.omsetning += o.omsetning; }
    else { ut.medKost.omsetning += o.omsetning; ut.medKost.db += o.db; }
  }
  ut.antall = Math.max(0, ut.antall);
  ut.utenKost.antall = Math.max(0, ut.utenKost.antall);
  ut.medKost.dg = ut.medKost.omsetning > 0 ? Math.round((ut.medKost.db / ut.medKost.omsetning) * 1000) / 10 : null;
  return ut;
}

/** Fakturerte ordre i en periode (fra og til er YYYY-MM-DD, begge med) */
export const iPeriode = (ordre: AvdelingSalg[], fra: string, til: string) =>
  ordre.filter((o) => o.fakturadato && o.fakturadato >= fra && o.fakturadato <= til);

/** Samme dag i fjor (29. februar → 28.) */
export function iFjor(dato: string) {
  const a = Number(dato.slice(0, 4)) - 1, m = dato.slice(5, 7);
  const d = m === "02" && dato.slice(8) === "29" ? "28" : dato.slice(8);
  return `${a}-${m}-${d}`;
}

export const dgFor = (o: AvdelingSalg) => (o.omsetning > 0 && !manglerKost(o) ? Math.round((o.db / o.omsetning) * 1000) / 10 : null);
