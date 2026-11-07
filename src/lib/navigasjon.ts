// Hopp rett til en del av et prosjekt fra et annet sted i appen (f.eks. egenkontroll-oversikten).
// Settes før man går til #prosjekter; Prosjekter og ProsjektSide leser det. Ønsket gjelder i noen sekunder,
// slik at det tåler at React leser det to ganger (StrictMode) uten å henge igjen til neste gang.
let neste: { prosjekt: string; del: string; tid: number } | null = null;
const gyldig = () => (neste && Date.now() - neste.tid < 3000 ? neste : null);

export function apneProsjektDel(prosjekt: string, del: string) {
  neste = { prosjekt, del, tid: Date.now() };
  if (location.hash === "#prosjekter") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#prosjekter";
}
/** Prosjektet som skal åpnes, hvis noen nettopp ba om det */
export function taNesteProsjekt(): string | null {
  return gyldig()?.prosjekt ?? null;
}
/** Delen av prosjektet som skal vises, hvis noen nettopp ba om det */
export function taNesteDel(prosjekt: string): string | null {
  const n = gyldig();
  return n?.prosjekt === prosjekt ? n.del : null;
}
