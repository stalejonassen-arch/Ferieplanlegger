// Hopp rett til en del av et prosjekt fra et annet sted i appen (f.eks. egenkontroll-oversikten).
// Settes før man går til #prosjekter; Prosjekter og ProsjektSide leser det. Ønsket gjelder i noen sekunder,
// slik at det tåler at React leser det to ganger (StrictMode) uten å henge igjen til neste gang.
let neste: { prosjekt: string; del: string; tid: number; ms: number } | null = null;
const gyldig = () => (neste && Date.now() - neste.tid < neste.ms ? neste : null);

export function apneProsjektDel(prosjekt: string, del: string, ms = 3000) {
  neste = { prosjekt, del, tid: Date.now(), ms };
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

// Lenker fra push-varsler: #p/<prosjekt>/<del>, f.eks. #p/…/dagbok. Gjelder lenger, siden appen kan bruke
// litt tid på å hente data før prosjektlisten vises etter at varselet er trykket på.
const LENKE = /^#p\/([0-9a-f-]{36})\/([a-z]+)$/i;
function fraLenke() {
  const m = LENKE.exec(location.hash);
  if (m) apneProsjektDel(m[1]!, m[2]!, 30000);
}
if (typeof window !== "undefined") { window.addEventListener("hashchange", fraLenke); fraLenke(); }
