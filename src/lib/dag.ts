// Dagslogg: alt som skjedde på én dag, på tvers av prosjekter, i rekkefølge.
import { isoOf, type Data } from "./ferie";
import { hhmm, type Time } from "./timer";
import type { Avvik, Bilde, Dagbok, Tillegg } from "./hms";

const pad = (n: number) => String(n).padStart(2, "0");
/** Lokal dato (YYYY-MM-DD) for et tidsstempel */
export const lokalDato = (ts: string) => isoOf(new Date(ts));
/** Lokal klokke (HH:MM) for et tidsstempel */
export const klokke = (ts: string) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export type Hendelse =
  | { type: "timer"; tid: string; til: string; ansatt_id: string; prosjekt_id: string | null; t: Time }
  | { type: "dagbok"; tid: string; ansatt_id: string; prosjekt_id: string; x: Dagbok; senere: boolean }
  | { type: "bilder"; tid: string; ansatt_id: string; prosjekt_id: string | null; bilder: Bilde[] }
  | { type: "avvik"; tid: string; ansatt_id: string; prosjekt_id: string | null; x: Avvik }
  | { type: "tillegg"; tid: string; ansatt_id: string; prosjekt_id: string; x: Tillegg };

/**
 * Hendelser for én dag for de valgte ansatte, sortert på klokkeslett.
 * Bilder tatt på samme prosjekt innen samme time slås sammen til én rad.
 */
export function dagHendelser(d: Pick<Data, "timer" | "dagbok" | "bilder" | "avvik" | "tillegg">, dato: string, ansatte: Set<string>): Hendelse[] {
  const ut: Hendelse[] = [];
  for (const t of d.timer) if (t.dato === dato && ansatte.has(t.ansatt_id))
    ut.push({ type: "timer", tid: hhmm(t.fra), til: hhmm(t.til), ansatt_id: t.ansatt_id, prosjekt_id: t.prosjekt_id, t });
  for (const x of d.dagbok) if (x.dato === dato && ansatte.has(x.ansatt_id)) {
    const samme = lokalDato(x.opprettet) === dato;
    ut.push({ type: "dagbok", tid: samme ? klokke(x.opprettet) : "23:59", ansatt_id: x.ansatt_id, prosjekt_id: x.prosjekt_id, x, senere: !samme });
  }
  const grupper = new Map<string, Bilde[]>();
  for (const b of d.bilder) if (lokalDato(b.opprettet) === dato && ansatte.has(b.ansatt_id) && !b.avvik_id) {
    const k = `${b.ansatt_id}|${b.prosjekt_id ?? ""}|${klokke(b.opprettet).slice(0, 2)}`;
    grupper.set(k, [...(grupper.get(k) ?? []), b]);
  }
  for (const bs of grupper.values()) {
    bs.sort((a, b) => a.opprettet.localeCompare(b.opprettet));
    ut.push({ type: "bilder", tid: klokke(bs[0].opprettet), ansatt_id: bs[0].ansatt_id, prosjekt_id: bs[0].prosjekt_id, bilder: bs });
  }
  for (const x of d.avvik) if (lokalDato(x.opprettet) === dato && ansatte.has(x.meldt_av))
    ut.push({ type: "avvik", tid: klokke(x.opprettet), ansatt_id: x.meldt_av, prosjekt_id: x.prosjekt_id, x });
  for (const x of d.tillegg) if (lokalDato(x.opprettet) === dato && ansatte.has(x.opprettet_av))
    ut.push({ type: "tillegg", tid: klokke(x.opprettet), ansatt_id: x.opprettet_av, prosjekt_id: x.prosjekt_id, x });
  const rang = { timer: 0, dagbok: 1, tillegg: 2, avvik: 3, bilder: 4 } as const;
  return ut.sort((a, b) => a.tid.localeCompare(b.tid) || rang[a.type] - rang[b.type]);
}

/** Timer per prosjekt den dagen, i den rekkefølgen prosjektene ble besøkt. */
export function prosjekterIDag(h: Hendelse[]) {
  const per = new Map<string, { prosjekt_id: string | null; timer: number; fra: string; til: string; hendelser: number }>();
  for (const x of h) {
    if (x.type === "dagbok" && x.senere) continue; // skrevet en annen dag: sier ikke noe om når de var der
    const k = x.prosjekt_id ?? "";
    const slutt = x.type === "timer" ? x.til : x.tid;
    const r = per.get(k) ?? { prosjekt_id: x.prosjekt_id, timer: 0, fra: x.tid, til: slutt, hendelser: 0 };
    if (x.type === "timer") r.timer += Number(x.t.timer); else r.hendelser++;
    if (x.tid < r.fra) r.fra = x.tid;
    if (slutt > r.til) r.til = slutt;
    per.set(k, r);
  }
  return [...per.values()].sort((a, b) => a.fra.localeCompare(b.fra));
}
