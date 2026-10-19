// Personlig månedsrapport per ansatt. Tallene regnes ut når leder lager rapporten og fryses i «innhold»,
// så rapporten viser det samme senere selv om timer eller salg endres.
//  - Snekkere (med i timerapporten): timer på kunde mot interntid. Lav interntid er bra.
//  - Prosjektleder/butikk (f.eks. Harald): DG på salg av vinduer og takplater.
import type { Ansatt, Data } from "./ferie";
import { sumKategori, type SalgKategoriMnd } from "./dg";
import { fordelingPerAnsatt, type Fordeling } from "./timer";

export interface Personrapport {
  id: string; ansatt_id: string; periode: string; innhold: Innhold; kommentar: string;
  publisert: string | null; lest: string | null; opprettet: string;
}

export interface TimerDel {
  kunde: number; ikkeFakturerbart: number; intern: number; sum: number; andelIntern: number;
  forrige: { sum: number; andelIntern: number } | null;
  hittil: { sum: number; andelIntern: number };
  /** Snitt for alle i timerapporten samme måned */
  snittAndelIntern: number | null;
}
export interface DgDel {
  id: string; navn: string;
  mnd: { omsetning: number; db: number; dg: number | null };
  forrige: { omsetning: number; db: number; dg: number | null };
  hittil: { omsetning: number; db: number; dg: number | null };
  ifjor: { omsetning: number; db: number; dg: number | null };
}
export interface Innhold { navn: string; periode: string; timer?: TimerDel; dg?: DgDel[] }

const r1 = (n: number) => Math.round(n * 10) / 10;
const andel = (f: Pick<Fordeling, "intern" | "sum">) => (f.sum ? r1((f.intern / f.sum) * 100) : 0);
const forrigeMnd = (periode: string) => { const a = Number(periode.slice(0, 4)), m = Number(periode.slice(5, 7)); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

/** Hvilke deler rapporten til en ansatt har */
export function rapportType(a: Ansatt): { timer: boolean; dg: boolean } {
  const dg = !!a.prosjektleder;
  return { dg, timer: !dg && a.i_timerapport !== false };
}

/** Lager innholdet i rapporten for én ansatt og én måned (periode = YYYY-MM-01) */
export function lagInnhold(a: Ansatt, d: Pick<Data, "timer" | "ansatte"> & { salgKategorier?: SalgKategoriMnd[]; dgKategorier?: { id: string; navn: string }[] }, periode: string): Innhold {
  const mnd = periode.slice(0, 7), aar = Number(periode.slice(0, 4)), m = Number(periode.slice(5, 7));
  const type = rapportType(a);
  const ut: Innhold = { navn: a.navn, periode };
  if (type.timer) {
    const denne = fordelingPerAnsatt(d.timer, mnd);
    const f = denne.get(a.id) ?? { fakturerbart: 0, ikkeFakturerbart: 0, intern: 0, sum: 0 };
    const fm = fordelingPerAnsatt(d.timer, forrigeMnd(periode)).get(a.id);
    const hittil = { intern: 0, sum: 0 };
    for (let i = 1; i <= m; i++) { const x = fordelingPerAnsatt(d.timer, `${aar}-${String(i).padStart(2, "0")}`).get(a.id); if (x) { hittil.intern += x.intern; hittil.sum += x.sum; } }
    const iRapport = d.ansatte.filter((x) => x.aktiv && x.i_timerapport !== false && !x.prosjektleder && denne.get(x.id)?.sum);
    const snitt = iRapport.length ? r1(iRapport.reduce((s, x) => s + andel(denne.get(x.id)!), 0) / iRapport.length) : null;
    ut.timer = {
      kunde: r1(f.fakturerbart), ikkeFakturerbart: r1(f.ikkeFakturerbart), intern: r1(f.intern), sum: r1(f.sum), andelIntern: andel(f),
      forrige: fm && fm.sum ? { sum: r1(fm.sum), andelIntern: andel(fm) } : null,
      hittil: { sum: r1(hittil.sum), andelIntern: andel(hittil) },
      snittAndelIntern: snitt,
    };
  }
  if (type.dg) {
    const rader = d.salgKategorier ?? [];
    const fm = forrigeMnd(periode);
    const p = { aar, mnd: m }, f = { aar: Number(fm.slice(0, 4)), mnd: Number(fm.slice(5, 7)) };
    const tall = (x: ReturnType<typeof sumKategori>) => ({ omsetning: Math.round(x.omsetning), db: Math.round(x.db), dg: x.dg });
    ut.dg = (d.dgKategorier ?? []).map((k) => ({
      id: k.id, navn: k.navn,
      mnd: tall(sumKategori(rader, k.id, p, p)),
      forrige: tall(sumKategori(rader, k.id, f, f)),
      hittil: tall(sumKategori(rader, k.id, { aar, mnd: 1 }, p)),
      ifjor: tall(sumKategori(rader, k.id, { aar: aar - 1, mnd: m }, { aar: aar - 1, mnd: m })),
    }));
  }
  return ut;
}

/** Personlige rapporter den ansatte ikke har lest */
export const ulestePerson = (r: Personrapport[] | undefined, ansattId: string) => (r ?? []).filter((x) => x.ansatt_id === ansattId && x.publisert && !x.lest);
