// Uten nett på byggeplassen: appen viser sist hentede data, og stempling og timeføring legges i kø
// og sendes når det er dekning igjen (med tidspunktet da den ansatte faktisk trykket).
import type { Data } from "./ferie";
import { varighet, type NyTime, type Time } from "./timer";

export type KoOp =
  | { id: string; type: "stemple"; tid: string; handling: "inn" | "bytt" | "ut"; prosjekt: string | null; beskrivelse: string; lunsj: number; til?: string }
  | { id: string; type: "time"; tid: string; time: NyTime };

// ---------- Lagring (IndexedDB, med localStorage som reserve) ----------
const DB = "bygglogg", STORE = "kv";
let dbP: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  if (!dbP) dbP = new Promise((ok, feil) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => feil(r.error);
  });
  return dbP;
}
async function les<T>(k: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise<T | undefined>((ok, feil) => { const r = db.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => ok(r.result as T | undefined); r.onerror = () => feil(r.error); });
  } catch {
    try { const v = localStorage.getItem(`bygglogg:${k}`); return v ? JSON.parse(v) as T : undefined; } catch { return undefined; }
  }
}
async function skriv(k: string, v: unknown) {
  try {
    const db = await idb();
    await new Promise<void>((ok, feil) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = () => ok(); t.onerror = () => feil(t.error); });
  } catch {
    try { localStorage.setItem(`bygglogg:${k}`, JSON.stringify(v)); } catch { /* fullt eller privat modus */ }
  }
}

/** Ved utlogging: fjern lagret kopi (kø som ikke er sendt beholdes til samme person logger inn igjen) */
export async function slettKopi(epost: string) {
  try { const db = await idb(); await new Promise<void>((ok) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(`data:${epost.toLowerCase()}`); t.oncomplete = () => ok(); t.onerror = () => ok(); }); } catch { /* */ }
  try { localStorage.removeItem(`bygglogg:data:${epost.toLowerCase()}`); } catch { /* */ }
}

/** Siste data fra serveren, per innlogget e-post */
export const lagreKopi = (epost: string, d: Data) => skriv(`data:${epost.toLowerCase()}`, { d, tid: new Date().toISOString() });
export const hentKopi = (epost: string) => les<{ d: Data; tid: string }>(`data:${epost.toLowerCase()}`);

export const hentKo = async (epost: string) => (await les<KoOp[]>(`ko:${epost.toLowerCase()}`)) ?? [];
export const lagreKo = (epost: string, ko: KoOp[]) => skriv(`ko:${epost.toLowerCase()}`, ko);

/** Feil som skyldes manglende nett (ikke at serveren sa nei) */
export function erNettfeil(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = (e as { message?: string })?.message ?? String(e);
  return /Failed to fetch|NetworkError|Load failed|network request failed|fetch failed|ERR_INTERNET|ERR_NETWORK|timed? ?out/i.test(m);
}

// ---------- Vise køen i appen før den er sendt ----------
const kvarter = (iso: string) => {
  const d = new Date(iso), min = Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};
const lokalDato = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Legger køen oppå data fra serveren, slik at stempling og timer vises med en gang */
export function anvendKo(d: Data, ko: KoOp[], megId: string | undefined): Data {
  if (!ko.length || !megId) return d;
  let stempling = [...d.stempling], timer = [...d.timer];
  for (const op of ko) {
    if (op.type === "time") {
      const t = op.time;
      const ny: Time = { ...(t as unknown as Time), id: t.id ?? `ko-${op.id}`, timer: varighet(t.fra, t.til, t.lunsj_min), lunsj_unntak: false, status: "levert", kilde: "manuell" };
      timer = t.id ? timer.map((x) => (x.id === t.id ? { ...x, ...ny } : x)) : [...timer, ny];
      continue;
    }
    const s = stempling.find((x) => x.ansatt_id === megId);
    const dato = lokalDato(op.tid), kl = kvarter(op.tid);
    if ((op.handling === "ut" || op.handling === "bytt") && s) {
      const slutt = s.dato === dato ? kl : op.til ?? null;
      if (slutt && slutt > s.fra) timer.push({ id: `ko-${op.id}`, ansatt_id: megId, prosjekt_id: s.prosjekt_id, dato: s.dato, fra: s.fra, til: slutt, lunsj_min: op.lunsj, timer: varighet(s.fra, slutt, op.lunsj), lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: op.beskrivelse, status: "levert", fakturerbar: !!s.prosjekt_id, kilde: "stempel" });
      stempling = stempling.filter((x) => x.ansatt_id !== megId);
    }
    if (op.handling === "inn" || op.handling === "bytt") {
      stempling = [...stempling.filter((x) => x.ansatt_id !== megId), { ansatt_id: megId, prosjekt_id: op.prosjekt, dato, fra: kl, startet: op.tid }];
    }
  }
  return { ...d, stempling, timer };
}

export const koTekst = (ko: KoOp[]) => {
  const s = ko.filter((x) => x.type === "stemple").length, t = ko.length - s;
  return [s ? `${s} ${s === 1 ? "stempling" : "stemplinger"}` : "", t ? `${t} ${t === 1 ? "timeføring" : "timeføringer"}` : ""].filter(Boolean).join(" og ");
};
