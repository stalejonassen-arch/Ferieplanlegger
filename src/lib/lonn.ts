// Ferie i lønnskjøringen: godkjente feriedager per ansatt per måned, og CSV-fil for Excel.
import { MND, sorterAnsatte, virkedager, type Ansatt, type Data } from "./ferie";
import { lonnTimer, type LonnTimer } from "./timer";

const pad = (n: number) => String(n).padStart(2, "0");
const sisteDag = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** «6.7.» eller «6.7.–10.7.» */
const kort = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d}.${m}.`; };
const fraTil = (fra: string, til: string) => fra === til ? kort(fra) : `${kort(fra)}–${kort(til)}`;

export interface LonnRad {
  ansatt: Ansatt;
  avdeling: string;
  /** Godkjente feriedager (man–fre, uten helligdager) i måneden */
  dager: number;
  /** Godkjente perioder, klippet til måneden */
  perioder: string[];
  /** Feriedager som venter på godkjenning i måneden (ikke med i «dager») */
  venter: number;
  /** Godkjente feriedager fra 1. januar til og med denne måneden */
  hittil: number;
}

/** mnd er 1–12 */
export function lonnMaaned(d: Data, aar: number, mnd: number): LonnRad[] {
  const start = `${aar}-${pad(mnd)}-01`, slutt = `${aar}-${pad(mnd)}-${pad(sisteDag(aar, mnd))}`;
  return sorterAnsatte(d).filter((a) => a.aktiv).map((a) => {
    let dager = 0, venter = 0, hittil = 0;
    const perioder: string[] = [];
    const egne = d.soknader.filter((s) => s.ansatt_id === a.id && s.status !== "avslatt").sort((x, y) => x.fra.localeCompare(y.fra));
    for (const s of egne) {
      if (s.status === "godkjent" && s.fra <= slutt && s.til >= `${aar}-01-01`) {
        const f = s.fra < `${aar}-01-01` ? `${aar}-01-01` : s.fra, t = s.til > slutt ? slutt : s.til;
        hittil += virkedager(f, t);
      }
      if (s.fra > slutt || s.til < start) continue;
      const f = s.fra < start ? start : s.fra, t = s.til > slutt ? slutt : s.til;
      const n = virkedager(f, t);
      if (!n) continue;
      if (s.status === "godkjent") { dager += n; perioder.push(fraTil(f, t)); } else venter += n;
    }
    return { ansatt: a, avdeling: d.avdelinger.find((g) => g.id === a.avdeling_id)?.navn ?? "", dager, perioder, venter, hittil };
  });
}

const celle = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Semikolon og BOM, så norsk Excel åpner filen riktig med æøå. */
const csv = (rader: (string | number)[][]) => "﻿" + rader.map((r) => r.map(celle).join(";")).join("\r\n") + "\r\n";

export function lonnCsv(rader: LonnRad[], aar: number, mnd: number) {
  return csv([
    [`Ferie ${MND[mnd - 1]} ${aar} – N L Austnes AS`],
    ["Ansatt", "Avdeling", "Feriedager", "Perioder", "Venter godkjenning", "Feriedager hittil i år", "Over 60 (ekstra feriepenger)"],
    ...rader.map((r) => [r.ansatt.navn, r.avdeling, r.dager, r.perioder.join(", "), r.venter || "", r.hittil, r.ansatt.over60 ? "Ja" : ""]),
    ["Sum", "", rader.reduce((n, r) => n + r.dager, 0), "", rader.reduce((n, r) => n + r.venter, 0) || "", rader.reduce((n, r) => n + r.hittil, 0), ""],
  ]);
}

/** Hele året: én rad per ansatt, én kolonne per måned (godkjente feriedager). */
export function lonnAarCsv(d: Data, aar: number) {
  const mnder = Array.from({ length: 12 }, (_, i) => lonnMaaned(d, aar, i + 1));
  const ansatte = mnder[0];
  return csv([
    [`Godkjent ferie ${aar} per måned – N L Austnes AS`],
    ["Ansatt", "Avdeling", ...MND.map((m) => m[0].toUpperCase() + m.slice(1, 3)), "Sum"],
    ...ansatte.map((r, i) => {
      const per = mnder.map((m) => m[i].dager);
      return [r.ansatt.navn, r.avdeling, ...per.map((n) => n || ""), per.reduce((a, b) => a + b, 0)];
    }),
  ]);
}

export function lastNedCsv(innhold: string, filnavn: string) {
  const url = URL.createObjectURL(new Blob([innhold], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filnavn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Lønnsgrunnlag fra timeføringen for en måned, alle aktive ansatte. */
export function lonnTimerMaaned(d: Data, aar: number, mnd: number): LonnTimer[] {
  const start = `${aar}-${pad(mnd)}-01`, slutt = `${aar}-${pad(mnd)}-${pad(sisteDag(aar, mnd))}`;
  return sorterAnsatte(d).filter((a) => a.aktiv).map((a) => lonnTimer(d, a, start, slutt));
}

const tall = (n: number) => (n ? String(Math.round(n * 100) / 100).replace(".", ",") : "");

export function lonnTimerCsv(rader: LonnTimer[], aar: number, mnd: number) {
  return csv([
    [`Lønnsgrunnlag timer ${MND[mnd - 1]} ${aar} – N L Austnes AS`],
    ["Ansatt", "Normaltid (1020 Timelønn)", "Overtid 50 %", "Overtid 100 %", "Kjøring km", "Reisetid", "Lunsjtrekk (timer)", "Dager med lunsjtrekk", "Ikke godkjente føringer"],
    ...rader.map((r) => [r.ansatt.navn, tall(r.normal), tall(r.ot50), tall(r.ot100), tall(r.km), tall(r.reisetid), tall(r.lunsjtrekk), r.avvik.map((x) => x.slice(8, 10) + "." + x.slice(5, 7) + ".").join(" "), r.ikkeGodkjent || ""]),
  ]);
}
