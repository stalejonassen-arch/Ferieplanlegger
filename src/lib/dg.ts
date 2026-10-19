// Dekningsgrad (DG) på salg per kategori (f.eks. vinduer og takplater).
// Ordrelinjene fra Visma sorteres etter teksten på linjen, slik at også «Diverse»-varenummer kommer med.
// Samme regel brukes i visma-sync (supabase/functions/visma-sync/index.ts) – hold dem like.

export interface DgKategori { id: string; navn: string; med: string[]; uten: string[] }
export interface SalgKategoriMnd { aar: number; mnd: number; kategori: string; omsetning: number; db: number; linjer: number; eksempler?: { tekst: string; omsetning: number; db: number }[]; oppdatert?: string }

/** Første kategori der teksten har et av ordene i «med» og ingen av ordene i «uten» (store/små bokstaver likt) */
export function kategoriFor(tekst: string, regler: DgKategori[]): string | null {
  const t = tekst.toLowerCase();
  for (const k of regler) {
    if (k.med.some((o) => o && t.includes(o.toLowerCase())) && !k.uten.some((o) => o && t.includes(o.toLowerCase()))) return k.id;
  }
  return null;
}

/** DG i prosent (dekningsbidrag / omsetning), null uten omsetning */
export const dg = (omsetning: number, db: number) => (omsetning > 0 ? Math.round((db / omsetning) * 1000) / 10 : null);

/** Sum for én kategori over et utvalg måneder */
export function sumKategori(rader: SalgKategoriMnd[], kategori: string, fra: { aar: number; mnd: number }, til: { aar: number; mnd: number }) {
  const n = (x: { aar: number; mnd: number }) => x.aar * 12 + x.mnd;
  const r = rader.filter((x) => x.kategori === kategori && n(x) >= n(fra) && n(x) <= n(til));
  const omsetning = r.reduce((s, x) => s + Number(x.omsetning), 0), db = r.reduce((s, x) => s + Number(x.db), 0);
  return { omsetning, db, dg: dg(omsetning, db), linjer: r.reduce((s, x) => s + x.linjer, 0) };
}
