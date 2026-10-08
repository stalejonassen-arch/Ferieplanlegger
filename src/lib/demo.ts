// Demomodus: samme oppførsel som databasen, men i minnet i nettleseren.
// Brukes når appen kjøres uten Supabase-nøkler.
import type { Api } from "./api";
import type { Ansatt, Data, Soknad } from "./ferie";
import { addDays, isoOf } from "./ferie";
import { mandag, varighet, type Time } from "./timer";

const y0 = new Date().getFullYear();
const y = y0 + 1;

function startdata(): Data {
  const avdelinger = [
    { id: 1, navn: "Butikk", maks_borte: 1, rekkefolge: 1 },
    { id: 2, navn: "Snekker", maks_borte: 2, rekkefolge: 2 },
    { id: 3, navn: "Kjøkken og Interiør", maks_borte: 1, rekkefolge: 3 },
    { id: 4, navn: "Allround / lager", maks_borte: 1, rekkefolge: 4 },
  ];
  const a = (id: string, navn: string, avdeling_id: number, rekkefolge: number, x: Partial<Ansatt> = {}): Ansatt =>
    ({ id, navn, epost: `${id}@demo.no`, avdeling_id, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge, ...x });
  const ansatte = [
    a("stale", "Ståle", 1, 1, { rolle: "leder" }), a("butikk2", "Butikk 2", 1, 2), a("karianne", "Karianne", 3, 1),
    a("mads", "Mads Kjerstad", 2, 1), a("snekker2", "Snekker 2", 2, 2), a("snekker3", "Snekker 3", 2, 3),
    a("snekker4", "Snekker 4", 2, 4), a("snekker5", "Snekker 5", 2, 5), a("jim", "Jim Kato", 4, 1),
  ];
  const s = (id: string, ansatt_id: string, fra: string, til: string, status: Soknad["status"]): Soknad =>
    ({ id, ansatt_id, fra: `${y}-${fra}`, til: `${y}-${til}`, status, merknad: "", kommentar: "", behandlet_av: null, behandlet_tid: null, opprettet: isoOf(new Date()) });
  const soknader = [
    s("d1", "stale", "07-05", "07-24", "godkjent"), s("d2", "karianne", "07-12", "07-31", "godkjent"),
    s("d3", "mads", "06-28", "07-17", "venter"), s("d4", "snekker2", "07-19", "08-07", "godkjent"),
    s("d5", "snekker3", "07-26", "08-14", "venter"), s("d6", "jim", "07-05", "07-17", "godkjent"),
    s("d7", "snekker4", "07-12", "07-24", "venter"), s("d8", "butikk2", "07-26", "08-14", "venter"),
  ];
  // Litt i inneværende år også, så kalenderen ikke står tom
  const naa = (id: string, ansatt_id: string, fra: string, til: string, status: Soknad["status"]): Soknad =>
    ({ ...s(id, ansatt_id, "01-01", "01-01", status), fra: `${y0}-${fra}`, til: `${y0}-${til}` });
  soknader.push(
    naa("n1", "jim", "10-19", "10-24", "godkjent"), naa("n2", "snekker5", "11-02", "11-07", "godkjent"),
    naa("n3", "karianne", "12-21", "12-31", "venter"), naa("n4", "stale", "12-27", "12-31", "godkjent"),
  );
  for (const x of ansatte) if (["karianne", "jim", "snekker3", "snekker4", "snekker5"].includes(x.id)) Object.assign(x, { lunsjtrekk: true, lunsj_min: 30 });
  for (const x of ansatte) if (["snekker3", "snekker4", "snekker5"].includes(x.id)) x.normaltid_uke = 40;
  const kunder = [
    { id: "k1", visma_nr: 10021, navn: "Merete Austnes", adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true },
    { id: "k2", visma_nr: 10022, navn: "Jonas Haram", adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true },
  ];
  const prosjekter = [
    { id: "p1", visma_nr: 10879, navn: "Skifte vindu", kunde_id: "k1", adresse: "", estimert_timer: 38, start: null, slutt: null, aktiv: true },
    { id: "p2", visma_nr: 10874, navn: "Renovere bad", kunde_id: "k2", adresse: "", estimert_timer: 120, start: null, slutt: null, aktiv: true },
  ];
  // Forrige uke: Mads har litt overtid, Snekker 3 har glemt lunsj én dag
  const m0 = addDays(mandag(isoOf(new Date())), -7);
  const t = (id: string, ansatt_id: string, dag: number, fra: string, til: string, lunsj: number, prosjekt_id: string | null = "p1"): Time =>
    ({ id, ansatt_id, prosjekt_id, dato: addDays(m0, dag), fra, til, lunsj_min: lunsj, timer: varighet(fra, til, lunsj), lunsj_unntak: false, km: 12, reisetid: 0, beskrivelse: "", status: "levert" });
  const timer: Time[] = [];
  for (let i = 0; i < 5; i++) timer.push(t(`tm${i}`, "mads", i, "07:00", i === 4 ? "17:00" : "15:30", 30, i < 3 ? "p1" : "p2"));
  for (let i = 0; i < 5; i++) timer.push(t(`ts${i}`, "snekker3", i, "07:00", "15:30", i === 2 ? 0 : 30, "p2"));
  return { avdelinger, ansatte, ferieaar: [{ ansatt_id: "jim", aar: y, overfort: 4 }], soknader, kunder, prosjekter, timer };
}

export function demoApi(): Api {
  const d = startdata();
  let epost: string | null = null;
  const lyttere = new Set<() => void>();
  const authLyttere = new Set<(e: string | null) => void>();
  const endret = () => lyttere.forEach((f) => f());
  const meg = () => d.ansatte.find((a) => a.epost === epost);
  const leder = () => meg()?.rolle === "leder";
  const nyId = () => Math.random().toString(36).slice(2, 10);
  const vent = () => new Promise((r) => setTimeout(r, 80));

  return {
    modus: "demo",
    async epost() { return epost; },
    onEpost(cb) { authLyttere.add(cb); return () => authLyttere.delete(cb); },
    async sendKode() { await vent(); },
    async bekreftKode(e) { epost = e; authLyttere.forEach((f) => f(epost)); },
    async loggUt() { epost = null; authLyttere.forEach((f) => f(null)); },
    async hent() { await vent(); return structuredClone(d); },
    abonner(cb) { lyttere.add(cb); return () => lyttere.delete(cb); },
    async lagreSoknad(n) {
      const m = meg();
      if (!m || (!leder() && n.ansatt_id !== m.id)) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const kollisjon = d.soknader.find((s) => s.ansatt_id === n.ansatt_id && s.id !== n.id && s.status !== "avslatt" && s.fra <= n.til && s.til >= n.fra);
      if (kollisjon) throw new Error("Perioden overlapper med en annen søknad for samme ansatt.");
      const gammel = n.id ? d.soknader.find((s) => s.id === n.id) : undefined;
      if (gammel) Object.assign(gammel, n, leder() ? {} : { status: "venter" });
      else d.soknader.push({ id: nyId(), status: "venter", kommentar: "", behandlet_av: null, behandlet_tid: null, opprettet: new Date().toISOString(), ...n });
      endret();
    },
    async slettSoknad(id) {
      const i = d.soknader.findIndex((s) => s.id === id);
      if (i >= 0 && (leder() || (d.soknader[i].ansatt_id === meg()?.id && d.soknader[i].status === "venter"))) d.soknader.splice(i, 1);
      endret();
    },
    async behandle(id, status, kommentar) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const s = d.soknader.find((x) => x.id === id);
      if (s) Object.assign(s, { status, kommentar, behandlet_av: meg()!.id, behandlet_tid: new Date().toISOString() });
      endret();
    },
    async lagreAnsatt(a) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const gammel = a.id ? d.ansatte.find((x) => x.id === a.id) : undefined;
      const ny = { ...(gammel ?? { id: nyId(), epost: null, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge: 99 }), ...a } as Ansatt;
      const andre = d.ansatte.filter((x) => x.id !== ny.id);
      if (!andre.concat(ny).some((x) => x.aktiv && x.rolle === "leder" && x.epost)) throw new Error("Det må være minst én aktiv leder med e-post.");
      if (ny.epost && andre.some((x) => x.epost?.toLowerCase() === ny.epost!.toLowerCase())) throw new Error("Den e-postadressen er allerede brukt av en annen ansatt.");
      if (gammel) Object.assign(gammel, ny); else d.ansatte.push(ny);
      endret();
    },
    async lagreAvdeling(a) {
      const x = d.avdelinger.find((v) => v.id === a.id);
      if (x) x.maks_borte = a.maks_borte;
      endret();
    },
    async kalenderToken(ny) { return ny ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000000"; },
    kalenderUrl(token, alle) { return `https://demo.invalid/kalender?t=${token}${alle ? "&alle=1" : ""}`; },
    async lagreTime(n) {
      const m = meg();
      if (!m || (!leder() && n.ansatt_id !== m.id)) throw new Error("Du har ikke tilgang til å gjøre dette.");
      if (n.til <= n.fra) throw new Error("Sluttid må være etter starttid, og lunsjen kan ikke være lengre enn arbeidsøkta.");
      if (d.timer.some((t) => t.ansatt_id === n.ansatt_id && t.dato === n.dato && t.id !== n.id && t.fra < n.til && t.til > n.fra)) throw new Error("Tiden overlapper med en annen registrering samme dag.");
      const gammel = n.id ? d.timer.find((t) => t.id === n.id) : undefined;
      if (gammel?.status === "godkjent" && !leder()) throw new Error("Timene er godkjent og kan bare endres av leder.");
      const ny = { ...(gammel ?? { id: nyId(), lunsj_unntak: false, status: "levert" as const }), ...n, timer: varighet(n.fra, n.til, n.lunsj_min) } as Time;
      if (gammel) Object.assign(gammel, ny); else d.timer.push(ny);
      endret();
    },
    async slettTime(id) {
      const i = d.timer.findIndex((t) => t.id === id);
      if (i >= 0 && (leder() || (d.timer[i].ansatt_id === meg()?.id && d.timer[i].status === "levert"))) d.timer.splice(i, 1);
      endret();
    },
    async settTimestatus(ids, status) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      for (const t of d.timer) if (ids.includes(t.id)) t.status = status;
      endret();
    },
    async lunsjUnntak(id, unntak) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const t = d.timer.find((x) => x.id === id);
      if (t) t.lunsj_unntak = unntak;
      endret();
    },
    async lagreProsjekt(p, nyKunde) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      let kunde_id = p.kunde_id ?? null;
      if (nyKunde?.trim()) { kunde_id = nyId(); d.kunder.push({ id: kunde_id, visma_nr: null, navn: nyKunde.trim(), adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true }); }
      const gammel = p.id ? d.prosjekter.find((x) => x.id === p.id) : undefined;
      const ny = { ...(gammel ?? { id: nyId(), visma_nr: null, adresse: "", estimert_timer: null, start: null, slutt: null, aktiv: true }), ...p, kunde_id };
      if (gammel) Object.assign(gammel, ny); else d.prosjekter.unshift(ny as any);
      endret();
    },
    async lagreOverfort(ansatt_id, aar, overfort) {
      const x = d.ferieaar.find((f) => f.ansatt_id === ansatt_id && f.aar === aar);
      if (x) x.overfort = overfort; else d.ferieaar.push({ ansatt_id, aar, overfort });
      endret();
    },
  };
}
