// Værmelding fra Meteorologisk institutt (api.met.no, samme data som Yr). Gratis, krever navngivning: «Data fra MET Norway».
// Hentes rett fra nettleseren og huskes i 30 minutter, så vi ikke spør oftere enn nødvendig.
import { PROFIL } from "./profil";

export const STED = PROFIL.sted;

export interface VaerTime {
  tid: string;            // ISO
  temp: number;           // °C
  vind: number;           // m/s
  kast?: number;          // m/s
  retning: number;        // grader (der vinden kommer fra)
  nedbor: number;         // mm neste time (eller neste 6 t / 6)
  symbol: string;         // f.eks. "partlycloudy_day"
}

const NOKKEL = `vaer-${STED.navn.toLowerCase()}`;
const MAKS_ALDER = 30 * 60 * 1000;

export async function hentVaer(): Promise<{ timer: VaerTime[]; hentet: number }> {
  try {
    const lagret = JSON.parse(localStorage.getItem(NOKKEL) || "null") as { timer: VaerTime[]; hentet: number } | null;
    if (lagret && Date.now() - lagret.hentet < MAKS_ALDER && lagret.timer.length) return lagret;
  } catch { /* privat modus */ }
  const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${STED.lat}&lon=${STED.lon}`);
  if (!r.ok) throw new Error(`Værmeldingen svarte ${r.status}`);
  const j = await r.json() as { properties: { timeseries: { time: string; data: { instant: { details: Record<string, number> }; next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } }; next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } } } }[] } };
  const timer: VaerTime[] = j.properties.timeseries.slice(0, 60).map((t) => {
    const d = t.data.instant.details;
    const neste = t.data.next_1_hours ?? t.data.next_6_hours;
    return {
      tid: t.time, temp: d.air_temperature ?? 0, vind: d.wind_speed ?? 0, kast: d.wind_speed_of_gust, retning: d.wind_from_direction ?? 0,
      nedbor: t.data.next_1_hours ? t.data.next_1_hours.details.precipitation_amount : (t.data.next_6_hours?.details.precipitation_amount ?? 0) / 6,
      symbol: neste?.summary.symbol_code ?? "cloudy",
    };
  });
  const ut = { timer, hentet: Date.now() };
  try { localStorage.setItem(NOKKEL, JSON.stringify(ut)); } catch { /* privat modus */ }
  return ut;
}

/** Enkle tegn for MET sine symbolkoder */
export function vaerIkon(symbol: string): string {
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  const natt = symbol.endsWith("_night");
  if (s.includes("thunder")) return "⛈️";
  if (s.includes("snow")) return "🌨️";
  if (s.includes("sleet")) return "🌨️";
  if (s.includes("heavyrain")) return "🌧️";
  if (s.includes("rainshowers") || s.includes("lightrainshowers")) return natt ? "🌧️" : "🌦️";
  if (s.includes("rain")) return "🌧️";
  if (s === "fog") return "🌫️";
  if (s === "clearsky") return natt ? "🌙" : "☀️";
  if (s === "fair") return natt ? "🌙" : "🌤️";
  if (s === "partlycloudy") return natt ? "☁️" : "⛅";
  return "☁️";
}

const BESKRIVELSE: Record<string, string> = {
  clearsky: "Klarvær", fair: "Lettskyet", partlycloudy: "Delvis skyet", cloudy: "Skyet", fog: "Tåke",
  lightrain: "Lett regn", rain: "Regn", heavyrain: "Kraftig regn",
  lightrainshowers: "Lette regnbyger", rainshowers: "Regnbyger", heavyrainshowers: "Kraftige regnbyger",
  lightsleet: "Lett sludd", sleet: "Sludd", heavysleet: "Kraftig sludd", sleetshowers: "Sluddbyger", lightsleetshowers: "Lette sluddbyger",
  lightsnow: "Lett snø", snow: "Snø", heavysnow: "Kraftig snø", snowshowers: "Snøbyger", lightsnowshowers: "Lette snøbyger",
};
export function vaerTekst(symbol: string): string {
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  return BESKRIVELSE[s] ?? (s.includes("thunder") ? "Torden" : s.includes("snow") ? "Snø" : s.includes("sleet") ? "Sludd" : s.includes("rain") ? "Regn" : "Skyet");
}

/** «sørvest» fra grader (der vinden kommer fra) */
export function vindRetning(grader: number): string {
  return ["nord", "nordøst", "øst", "sørøst", "sør", "sørvest", "vest", "nordvest"][Math.round(((grader % 360) + 360) % 360 / 45) % 8]!;
}

/** Beaufort-navn på norsk, som på Yr */
export function vindNavn(ms: number): string {
  if (ms < 0.3) return "Stille"; if (ms < 1.6) return "Flau vind"; if (ms < 3.4) return "Svak vind"; if (ms < 5.5) return "Lett bris";
  if (ms < 8) return "Laber bris"; if (ms < 10.8) return "Frisk bris"; if (ms < 13.9) return "Liten kuling"; if (ms < 17.2) return "Stiv kuling";
  if (ms < 20.8) return "Sterk kuling"; if (ms < 24.5) return "Liten storm"; if (ms < 28.5) return "Full storm"; if (ms < 32.7) return "Sterk storm"; return "Orkan";
}
