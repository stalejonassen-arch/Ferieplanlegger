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

/** Telefonnummer til tel:-lenke (fjerner mellomrom, beholder +) */
export const telLenke = (nr: string) => "tel:" + nr.replace(/[^\d+]/g, "");

/** Avstand fra bedriften til et prosjekt. luftlinje = kjørerute ikke funnet, viser rett linje */
export interface Avstand { km: number; min: number | null; luftlinje: boolean }

/** Rett linje mellom to punkt i km */
export function luftlinjeKm(a: Punkt, b: Punkt): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const AV = "kart-avstand:";
const nokkelAv = (fra: Punkt, til: Punkt) => `${AV}${fra.lat.toFixed(4)},${fra.lon.toFixed(4)}>${til.lat.toFixed(4)},${til.lon.toFixed(4)}`;
const lesAv = (k: string): Avstand | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };

/** Kjøreavstand fra ett punkt til mange (OpenStreetMap-ruting, én forespørsel per 80 mål). Husker svaret i nettleseren. */
export async function kjoreavstander(fra: Punkt, til: Punkt[]): Promise<Avstand[]> {
  const ut: (Avstand | null)[] = til.map((t) => lesAv(nokkelAv(fra, t)));
  const mangler = til.map((t, i) => ({ t, i })).filter((x) => !ut[x.i]);
  for (let s = 0; s < mangler.length; s += 80) {
    const del = mangler.slice(s, s + 80);
    let km: (number | null)[] = [], min: (number | null)[] = [];
    try {
      const koord = [fra, ...del.map((x) => x.t)].map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
      const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${koord}?sources=0&annotations=distance,duration`);
      if (r.ok) {
        const j = await r.json() as { code: string; distances?: (number | null)[][]; durations?: (number | null)[][] };
        if (j.code === "Ok") { km = (j.distances?.[0] ?? []).slice(1).map((m) => (m == null ? null : m / 1000)); min = (j.durations?.[0] ?? []).slice(1).map((s2) => (s2 == null ? null : s2 / 60)); }
      }
    } catch { /* uten nett eller rutetjenesten nede: bruk luftlinje */ }
    del.forEach((x, n) => {
      const a: Avstand = km[n] != null ? { km: km[n]!, min: min[n] ?? null, luftlinje: false } : { km: luftlinjeKm(fra, x.t), min: null, luftlinje: true };
      ut[x.i] = a;
      if (!a.luftlinje) try { localStorage.setItem(nokkelAv(fra, x.t), JSON.stringify(a)); } catch { /* privat modus */ }
    });
  }
  return ut as Avstand[];
}

/** «23 km» / «23 km · 28 min» / «ca. 18 km luftlinje» */
export const avstandTekst = (a: Avstand, medTid = false) =>
  a.luftlinje ? `ca. ${Math.round(a.km)} km luftlinje` : `${a.km < 10 ? a.km.toFixed(1).replace(".", ",") : Math.round(a.km)} km${medTid && a.min != null ? ` · ${Math.round(a.min)} min` : ""}`;
