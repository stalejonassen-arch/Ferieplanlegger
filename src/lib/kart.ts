// Finner koordinater for en adresse med Kartverkets åpne adressesøk (ingen nøkkel), og lager kartlenker.
export interface Punkt { lat: number; lon: number }

const NOKKEL = "kart-punkt:";

async function sok(url: string): Promise<Punkt | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json() as { adresser?: { representasjonspunkt?: { lat: number; lon: number } }[] };
  const p = j.adresser?.[0]?.representasjonspunkt;
  return p ? { lat: p.lat, lon: p.lon } : null;
}

/** Adresse → punkt. Prøver hele adressen, så uten postnummer/sted, så med gårds- og bruksnummer. Husker svaret i nettleseren. */
export async function finnPunkt(adresse: string, matrikkel?: { kommunenr?: string; gnr?: number | null; bnr?: number | null }): Promise<Punkt | null> {
  const a = adresse.trim();
  if (!a && !matrikkel?.gnr) return null;
  const nokkel = NOKKEL + a + "|" + (matrikkel?.kommunenr ?? "") + "/" + (matrikkel?.gnr ?? "") + "/" + (matrikkel?.bnr ?? "");
  try { const c = localStorage.getItem(nokkel); if (c) return c === "-" ? null : JSON.parse(c); } catch { /* privat modus */ }
  const base = "https://ws.geonorge.no/adresser/v1/sok?utkoordsys=4258&treffPerSide=1&";
  let p: Punkt | null = null;
  try {
    if (a) p = await sok(base + "sok=" + encodeURIComponent(a));
    if (!p && a.includes(",")) p = await sok(base + "sok=" + encodeURIComponent(a.split(",")[0]!.trim()) + "&postnummer=" + encodeURIComponent((a.match(/\b\d{4}\b/) ?? [""])[0]));
    if (!p && matrikkel?.kommunenr && matrikkel.gnr && matrikkel.bnr)
      p = await sok(`${base}kommunenummer=${matrikkel.kommunenr}&gardsnummer=${matrikkel.gnr}&bruksnummer=${matrikkel.bnr}`);
  } catch { return null; }
  try { localStorage.setItem(nokkel, p ? JSON.stringify(p) : "-"); } catch { /* privat modus */ }
  return p;
}

/** Kart til innebygging (OpenStreetMap), med nål på stedet */
export function kartInnebygd(p: Punkt, zoom: "naer" | "omrade" = "naer"): string {
  const dx = zoom === "naer" ? 0.006 : 0.03, dy = zoom === "naer" ? 0.0025 : 0.012;
  const bbox = [p.lon - dx, p.lat - dy, p.lon + dx, p.lat + dy].map((x) => x.toFixed(5)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
}

/** Telefonnummer til tel:-lenke (fjerner mellomrom, beholder +) */
export const telLenke = (nr: string) => "tel:" + nr.replace(/[^\d+]/g, "");
