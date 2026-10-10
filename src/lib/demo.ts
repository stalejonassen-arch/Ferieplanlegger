// Demomodus: samme oppførsel som databasen, men i minnet i nettleseren.
// Brukes når appen kjøres uten Supabase-nøkler.
import type { Api, FdvDok, FdvVare } from "./api";
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
  const avvik: Data["avvik"] = [
    { id: "av1", prosjekt_id: "p2", meldt_av: "snekker3", type: "ruh", tittel: "Løst rekkverk i trapp", beskrivelse: "Rekkverket i trappa til 2. etasje sitter løst.", ansvarlig_id: null, frist: null, status: "apen", tiltak: "", lukket_av: null, lukket_tid: null, opprettet: new Date().toISOString() },
  ];
  return { avdelinger, ansatte, ferieaar: [{ ansatt_id: "jim", aar: y, overfort: 4 }], soknader, kunder, prosjekter, timer, avvik, bilder: [], dagbok: [
    { id: "db1", prosjekt_id: "p2", ansatt_id: "mads", dato: addDays(m0, 2), vaer: "Regn", tekst: "Revet gammelt flislagt gulv og vegger. Avfall kjørt til gjenvinning.", hindringer: "", opprettet: new Date().toISOString() },
  ], tillegg: [], maal: 7000, rapporter: [], lest: [], stempling: [], fravaer: [], egenmelding: { maksDager: 3, maksGanger: 4 } };
}

const demoVarer: FdvVare[] = [
  { varenr: "42157742", beskrivelse: "GIPSPL WAB 12,5X900X2400MM", antall: 48, enhet: "STK", nobb_nr: "42157742", fdv_url: "", skjul: false },
  { varenr: "11293347", beskrivelse: "BYGGFOLIE 0,15MM 2,6X15M ISOLA", antall: 2, enhet: "RL", nobb_nr: "11293347", fdv_url: "", skjul: false },
  { varenr: "47410886", beskrivelse: "DØR MD MK EI60/25DB 9X21H HV", antall: 2, enhet: "SET", nobb_nr: "47410886", fdv_url: "", skjul: false },
  { varenr: "60118313", beskrivelse: "AVFALLSEKK KLAR 240L 10STK", antall: 3, enhet: "PAK", nobb_nr: "60118313", fdv_url: "", skjul: true },
];
const vareEndring: Record<string, Partial<FdvVare>> = {};
const demoDok: (FdvDok & { pid: string })[] = [];

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
    async vismaStatus() { return null; },
    async lagreAvvik(a) {
      const m = meg();
      if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const gammel = a.id ? d.avvik.find((x) => x.id === a.id) : undefined;
      if (gammel) {
        if (!leder() && gammel.ansvarlig_id !== m.id && gammel.status !== "apen") throw new Error("Avviket er under behandling og kan ikke endres.");
        Object.assign(gammel, a, a.status === "lukket" && gammel.status !== "lukket" ? { lukket_av: m.id, lukket_tid: new Date().toISOString() } : {});
        endret(); return gammel.id;
      }
      const ny = { id: nyId(), prosjekt_id: null, type: "avvik", beskrivelse: "", ansvarlig_id: null, frist: null, status: "apen", tiltak: "", lukket_av: null, lukket_tid: null, opprettet: new Date().toISOString(), ...a, meldt_av: m.id } as Data["avvik"][number];
      d.avvik.unshift(ny); endret(); return ny.id;
    },
    async slettAvvik(id) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      d.avvik = d.avvik.filter((x) => x.id !== id); d.bilder = d.bilder.filter((b) => b.avvik_id !== id); endret();
    },
    async lastOppBilde(fil, til) {
      const sti = URL.createObjectURL(fil);
      d.bilder.unshift({ id: nyId(), prosjekt_id: til.prosjekt_id ?? null, avvik_id: til.avvik_id ?? null, dagbok_id: til.dagbok_id ?? null, tillegg_id: til.tillegg_id ?? null, ansatt_id: meg()!.id, sti, tekst: til.tekst ?? "", opprettet: new Date().toISOString() });
      endret();
    },
    async lagreDagbok(x) {
      const m = meg(); if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const g = x.id ? d.dagbok.find((y) => y.id === x.id) : undefined;
      if (g) { Object.assign(g, x); endret(); return g.id; }
      const ny = { id: nyId(), vaer: "", hindringer: "", dato: isoOf(new Date()), opprettet: new Date().toISOString(), ...x, ansatt_id: m.id } as Data["dagbok"][number];
      d.dagbok.unshift(ny); endret(); return ny.id;
    },
    async slettDagbok(id) { d.dagbok = d.dagbok.filter((y) => y.id !== id); endret(); },
    async lagreTillegg(x) {
      const m = meg(); if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      if (x.status === "signert" && (!x.signert_navn?.trim() || (x.signatur ?? "").length < 100)) throw new Error("Kunden må skrive navnet sitt og signere.");
      const g = x.id ? d.tillegg.find((y) => y.id === x.id) : undefined;
      if (g) {
        if (!leder() && g.status !== "utkast") throw new Error("Tilleggsarbeidet er signert og kan bare endres av leder.");
        Object.assign(g, x, x.status === "signert" && g.status !== "signert" ? { signert_tid: new Date().toISOString() } : {}); endret(); return g.id;
      }
      const ny = { id: nyId(), beskrivelse: "", timer: null, materiell: "", pris: null, status: "utkast", signert_navn: "", signatur: "", signert_tid: null, opprettet: new Date().toISOString(), ...x, opprettet_av: m.id } as Data["tillegg"][number];
      d.tillegg.unshift(ny); endret(); return ny.id;
    },
    async prosjektOrdre(pid) {
      return pid === "p2" ? [
        { visma_ordrenr: 52011, ordredato: isoOf(new Date()), ordretype: 1, transaksjonstype: 1, navn: "Jonas Haram", sum_netto: 84500, kostnad: 61200, dekningsbidrag: 23300, fakturert: 0, ferdig: null },
        { visma_ordrenr: 51876, ordredato: isoOf(new Date()), ordretype: 1, transaksjonstype: 1, navn: "Jonas Haram", sum_netto: 12900, kostnad: 8600, dekningsbidrag: 4300, fakturert: 12900, ferdig: isoOf(new Date()) },
      ] : [];
    },
    async slettTillegg(id) { d.tillegg = d.tillegg.filter((y) => y.id !== id); endret(); },
    async lagreRapport(r) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const sti = r.fil ? URL.createObjectURL(r.fil) : undefined;
      const gammel = r.id ? d.rapporter.find((x) => x.id === r.id) : undefined;
      const ny = { id: gammel?.id ?? nyId(), tittel: r.tittel, periode: r.periode, ingress: r.ingress, lenke: r.lenke, sti: sti ?? gammel?.sti ?? "",
        publisert: gammel?.publisert ?? (r.publiser ? new Date().toISOString() : null), opprettet: gammel?.opprettet ?? new Date().toISOString() };
      d.rapporter = [ny, ...d.rapporter.filter((x) => x.id !== ny.id)].sort((a, b) => b.periode.localeCompare(a.periode));
      endret();
    },
    async slettRapport(id) { d.rapporter = d.rapporter.filter((x) => x.id !== id); endret(); },
    async stemple(handling, o = {}) {
      const m = meg(); if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const n = new Date(), q = Math.round((n.getHours() * 60 + n.getMinutes()) / 15) * 15;
      const naa = `${String(Math.floor(q / 60) % 24).padStart(2, "0")}:${String(q % 60).padStart(2, "0")}`, idag = isoOf(n);
      const s = d.stempling.find((x) => x.ansatt_id === m.id);
      if (handling === "inn" && s) throw new Error("Du er allerede logget inn. Bytt prosjekt eller logg ut først.");
      let slutt = naa;
      if (handling !== "inn") {
        if (!s) throw new Error("Du er ikke logget inn.");
        if (s.dato !== idag) { if (!o.til) throw new Error("Du ble ikke logget ut. Skriv inn når du sluttet."); slutt = o.til; }
        if (slutt > s.fra) d.timer.push({ id: nyId(), ansatt_id: m.id, prosjekt_id: s.prosjekt_id, dato: s.dato, fra: s.fra, til: slutt, lunsj_min: o.lunsj ?? 0,
          timer: varighet(s.fra, slutt, o.lunsj ?? 0), lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: o.beskrivelse ?? "", status: "levert", fakturerbar: !!s.prosjekt_id, kilde: "stempel" });
        d.stempling = d.stempling.filter((x) => x.ansatt_id !== m.id);
      }
      if (handling !== "ut") d.stempling.push({ ansatt_id: m.id, prosjekt_id: o.prosjekt ?? null, dato: idag, fra: handling === "bytt" && s?.dato === idag ? slutt : naa, startet: n.toISOString() });
      endret();
    },
    async lagreFravaer(f) {
      const m = meg(); if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      if (!leder() && f.ansatt_id !== m.id) throw new Error("Du kan bare registrere fravær for deg selv.");
      if (!leder() && f.type === "egenmelding" && (Date.parse(f.til) - Date.parse(f.fra)) / 864e5 + 1 > 3) throw new Error("Egenmelding kan gjelde høyst 3 kalenderdager om gangen. Lengre fravær krever sykmelding fra lege.");
      if (d.fravaer.some((x) => x.id !== f.id && x.ansatt_id === f.ansatt_id && x.fra <= f.til && x.til >= f.fra)) throw new Error("Fraværet overlapper med en annen registrering.");
      const ny = { id: f.id ?? nyId(), ansatt_id: f.ansatt_id, type: f.type, fra: f.fra, til: f.til, grad: f.grad ?? 100, merknad: f.merknad ?? "", opprettet: new Date().toISOString() };
      d.fravaer = [ny, ...d.fravaer.filter((x) => x.id !== ny.id)]; endret();
    },
    async slettFravaer(id) { d.fravaer = d.fravaer.filter((x) => x.id !== id); endret(); },
    async markerLest(id) {
      const m = meg(); if (!m) return;
      if (!d.lest.some((l) => l.rapport_id === id && l.ansatt_id === m.id)) d.lest.push({ rapport_id: id, ansatt_id: m.id, lest: new Date().toISOString() });
      endret();
    },
    async settMaal(aar) {
      if (!leder()) throw new Error("Bare leder kan endre målet.");
      d.maal = aar; endret();
    },
    async fdv(pid) {
      const varer = pid === "p2" ? demoVarer : [];
      return { varer: varer.map((v) => ({ ...v, ...(vareEndring[v.varenr] ?? {}) })), dok: demoDok.filter((x) => x.pid === pid) };
    },
    async lagreVare(varenr, endring) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      vareEndring[varenr] = { ...(vareEndring[varenr] ?? {}), ...endring }; endret();
    },
    async lastOppFdv(pid, fil) { demoDok.push({ pid, id: nyId(), navn: fil.name, sti: URL.createObjectURL(fil), storrelse: fil.size, opprettet: new Date().toISOString() }); endret(); },
    async slettFdv(id) { const i = demoDok.findIndex((x) => x.id === id); if (i >= 0) demoDok.splice(i, 1); endret(); },
    async dokUrl(sti) { return sti; },
    async slettBilde(id) { d.bilder = d.bilder.filter((b) => b.id !== id); endret(); },
    async bildeUrler(stier) { return Object.fromEntries(stier.map((s) => [s, s])); },
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
