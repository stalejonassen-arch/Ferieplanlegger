// Demomodus: samme oppførsel som databasen, men i minnet i nettleseren.
// Brukes når appen kjøres uten Supabase-nøkler.
import type { Leveranse, Materiale, Oppgave } from "./plan";
import type { Bestilling, Sja, Sjekkliste } from "./kvalitet";
import type { Api, FdvDok, FdvVare } from "./api";
import type { Lest, Melding } from "./chat";
import type { Ansatt, Data, Soknad } from "./ferie";
import { addDays, isoOf } from "./ferie";
import { PROFIL } from "./profil";
import { mandag, varighet, type Time } from "./timer";
import { STANDARD_KVOTER, type Utstyr } from "./utstyr";

const y0 = new Date().getFullYear();
const y = y0 + 1;

/** Oppdiktet e-post ut fra fornavnet, f.eks. «ola@demo.no» */
const demoEpost = (navn: string) => `${navn.split(" ")[0]!.toLowerCase()}@demo.no`;
const demoInvitert = new Map<string, string>();
const vismaDemo = { koblet: false, firma: "", status: "", sist: null as string | null, orgnr: "999888777", kunder: 0, prosjekter: 0 };
const forslagDemo: import("./api").AnsattForslag[] = [
  { kilde: "visma", ekstern_id: "7", navn: "Henrik Vestre", epost: "henrik@demo.no", ansattnr: "7" },
  { kilde: "visma", ekstern_id: "8", navn: "Sara Lid", epost: "sara@demo.no", ansattnr: "8" },
  { kilde: "visma", ekstern_id: "9", navn: "Tomas Berg", epost: null, ansattnr: "9" },
];

function startdata(): Data {
  const avdelinger = [
    { id: 1, navn: "Butikk", maks_borte: 1, rekkefolge: 1 },
    { id: 2, navn: "Snekker", maks_borte: 2, rekkefolge: 2 },
    { id: 3, navn: "Kjøkken og Interiør", maks_borte: 1, rekkefolge: 3 },
    { id: 4, navn: "Allround / lager", maks_borte: 1, rekkefolge: 4 },
  ];
  const a = (id: string, navn: string, avdeling_id: number, rekkefolge: number, x: Partial<Ansatt> = {}): Ansatt =>
    ({ id, navn, epost: demoEpost(navn), avdeling_id, rolle: "ansatt", dager: 25, over60: false, aktiv: true, rekkefolge, ...x });
  const ansatte = [
    a("stale", "Lars Berg", 1, 1, { rolle: "leder" }), a("butikk2", "Nina Solheim", 1, 2, { prosjektleder: true }), a("karianne", "Kari Holm", 3, 1),
    a("mads", "Ola Nordmann", 2, 1), a("snekker2", "Henrik Vik", 2, 2), a("snekker3", "Piotr Kowalski", 2, 3),
    a("snekker4", "Marek Zielinski", 2, 4), a("snekker5", "Even Strand", 2, 5), a("jim", "Tomasz Nowak", 4, 1),
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
    { id: "k1", visma_nr: 10021, navn: "Merete Hansen", adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true },
    { id: "k2", visma_nr: 10022, navn: "Jonas Lunde", adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true },
  ];
  const prosjekter = [
    { id: "p1", visma_nr: 10879, navn: "Skifte vindu", kunde_id: "k1", adresse: "Keiser Wilhelms gate 22, 6003 Ålesund", kontakt_navn: "Merete", kontakt_telefon: "900 00 000", selger_id: "stale", snekker_id: "mads", estimert_timer: 38, start: null, slutt: null, aktiv: true },
    { id: "p2", visma_nr: 10874, navn: "Renovere bad", kunde_id: "k2", adresse: "", estimert_timer: 120, start: null, slutt: null, aktiv: true },
    { id: "p3", visma_nr: 10712, navn: "Nytt kjøkken og gulv", kunde_id: "k1", adresse: "Storgata 14, 6260 Skodje", estimert_timer: 90, start: null, slutt: `${y0 - 1}-11-20`, aktiv: false },
    { id: "prek", visma_nr: 900, navn: "Reklamasjon", kunde_id: null, adresse: "", estimert_timer: null, start: null, slutt: null, aktiv: true },
  ];
  // Forrige uke: Ola har litt overtid, Snekker 3 har glemt lunsj én dag
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
  ], tillegg: [], maal: 7000, maalOmsetning: 28000000,
    kampanjer: demoKampanjer(),
    bedrift: {
      id: 1, navn: PROFIL.firma, undertittel: PROFIL.undertittel, orgnr: PROFIL.orgnr, adresse: PROFIL.adresse, postnr: PROFIL.postnr, poststed: PROFIL.poststed, telefon: PROFIL.telefon, epost: "",
      sted_navn: PROFIL.sted.navn, sted_lat: PROFIL.sted.lat, sted_lon: PROFIL.sted.lon, tema: PROFIL.tema, kjede: "Byggfag", kampanje_tittel: PROFIL.kampanje,
    },
    omsetning: (() => { const y = new Date().getFullYear(), m = new Date().getMonth() + 1; const f = [0.88, 1.38, 2.06, 1.89, 2.70, 2.24, 1.61, 2.22, 2.73, 1.93, 1.45, 1.78], n = [0.99, 1.45, 2.83, 2.30, 2.71, 2.92, 1.69, 2.25, 2.77, 1.9, 1.5, 1.8]; const ut = []; for (let i = 0; i < 12; i++) { ut.push({ aar: y - 1, mnd: i + 1, belop: Math.round(f[i] * 1e6), oppdatert: new Date().toISOString() }); if (i + 1 <= m) ut.push({ aar: y, mnd: i + 1, belop: Math.round(n[i] * 1e6 * (i + 1 === m ? new Date().getDate() / 30 : 1)), oppdatert: new Date().toISOString() }); } return ut; })(), rapporter: [], lest: [], personrapporter: [], salgKategorier: demoSalg(), dgKategorier: structuredClone(STANDARD_DG), stempling: [], fravaer: [], egenmelding: { maksDager: 3, maksGanger: 4 },
    utstyr: demoUtstyr(), utstyrGrenser: { arbeidstoy: null, verktoy: null, sammeMnd: 6, kvoter: structuredClone(STANDARD_KVOTER) },
    ...demoPlan(addDays(m0, 7)) };
}

/** Arbeidsplan og materialliste for demoen, rundt uka som går (m = mandag denne uka) */
function demoPlan(m: string): Pick<Data, "oppgaver" | "leveranser" | "materialer"> {
  const o = (id: string, prosjekt_id: string, tittel: string, fra: number, til: number, ansatte: string[], rekkefolge: number, status: Oppgave["status"] = "planlagt", beskrivelse = ""): Oppgave =>
    ({ id, prosjekt_id, tittel, beskrivelse, fra: addDays(m, fra), til: addDays(m, til), ansatte, rekkefolge, status, opprettet_av: "stale", ferdig_tid: null });
  const oppgaver = [
    o("o1", "p2", "Riving av gammelt bad", -3, -2, ["mads", "snekker3"], 1, "ferdig"),
    o("o2", "p2", "Nytt bjelkelag og sluk", 0, 1, ["mads", "snekker3"], 2, "pagaar", "Rørlegger kommer tirsdag kl. 10 for sluk."),
    o("o3", "p2", "Våtromsplater og membran", 2, 4, ["snekker3"], 3),
    o("o4", "p2", "Flislegging", 7, 9, ["snekker4"], 4),
    o("o5", "p1", "Demontere gamle vinduer", 1, 1, ["snekker2"], 1),
    o("o6", "p1", "Montere nye vinduer og listing", 2, 3, ["snekker2", "snekker5"], 2),
  ];
  const l = (id: string, prosjekt_id: string, navn: string, rekkefolge: number, dag: number, status: Leveranse["status"], leverandor = ""): Leveranse =>
    ({ id, prosjekt_id, navn, rekkefolge, dato: addDays(m, dag), status, leverandor, notat: "" });
  const leveranser = [
    l("l1", "p2", "Bjelkelag og sluk", 1, -1, "levert", "Eget lager"),
    l("l2", "p2", "Våtrom: plater og membran", 2, 1, "bestilt", "Byggevarehuset"),
    l("l3", "p2", "Fliser og lim", 3, 6, "planlagt"),
  ];
  const v = (id: string, leveranse_id: string, beskrivelse: string, antall: number, enhet: string, levert: boolean, nobb_nr = ""): Materiale =>
    ({ id, prosjekt_id: "p2", leveranse_id, rekkefolge: 0, varenr: nobb_nr, nobb_nr, beskrivelse, antall, enhet, notat: "", levert });
  const materialer = [
    v("v1", "l1", "Konstruksjonsvirke 48x198 C24", 12, "stk", true), v("v2", "l1", "Gulvsluk 110 mm", 1, "stk", true),
    v("v3", "l2", "Våtromsplate 12 mm 620x2400", 14, "stk", false), v("v4", "l2", "Smøremembran 7 kg", 2, "spann", false),
    v("v5", "l3", "Flis 30x60 grå", 9, "m2", false), v("v6", "l3", "Flislim hvit 20 kg", 4, "sekk", false),
  ];
  return { oppgaver, leveranser, materialer, ...demoKvalitet(m) };
}

/** Sjekkliste, SJA og en bestilling i demoen */
function demoKvalitet(m: string): Pick<Data, "sjekklister" | "sja" | "bestillinger" | "reklamasjoner" | "reklamasjonProsjekt" | "reklOppsett"> {
  const naa = new Date().toISOString();
  const sjekklister: Sjekkliste[] = [{
    id: "sk1", prosjekt_id: "p2", navn: "Våtrom – membran og sluk", mal: "vatrom", status: "pagaar", opprettet_av: "snekker3", opprettet: naa, endret: naa, signert_av: null, signert_tid: null,
    punkter: [
      { tekst: "Underlaget er rent, tørt og plant før membran", svar: "ok" },
      { tekst: "Fall mot sluk er kontrollert i dusjsonen", svar: "ok" },
      { tekst: "Sluk er montert etter produsentens anvisning, og klemring eller mansjett er tett", svar: "ok" },
      { tekst: "Alle rørgjennomføringer har mansjett", svar: "avvik", kommentar: "Mangler mansjett på varmtvann – bestilt" },
      { tekst: "Membranen er påført i riktig tykkelse (målt)", svar: null },
      { tekst: "Tørketiden er overholdt før flislegging", svar: null },
    ],
  }];
  const sja: Sja[] = [{
    id: "sja1", prosjekt_id: "p1", dato: addDays(m, 1), arbeid: "Demontere og montere vinduer i 2. etasje", verneutstyr: "Hjelm, vernebriller, hansker",
    risikoer: [{ fare: "Fall fra høyde (tak, stillas, stige)", tiltak: "Stillas med rekkverk, ikke stige" }, { fare: "Kutt og stikk fra verktøy", tiltak: "Kuttsikre hansker ved glass" }],
    deltakere: ["snekker2", "snekker5"], kvittert: { snekker2: naa }, opprettet_av: "stale", opprettet: naa,
  }];
  const bestillinger: Bestilling[] = [{
    id: "b1", prosjekt_id: "p2", bestilt_av: "mads", onsket_dato: addDays(m, 2), merknad: "Leveres på byggeplassen før kl. 10",
    linjer: [{ beskrivelse: "Rørmansjett 15 mm", antall: 2, enhet: "stk" }, { beskrivelse: "Skruer 5x50 rustfri", antall: 1, enhet: "pk" }],
    status: "ny", svar: "", behandlet_av: null, leveranse_id: null, opprettet: naa, endret: naa,
  }];
  return { sjekklister, sja, bestillinger, ...demoReklamasjon(m) };
}

/** En reklamasjon på en ferdig jobb i demoen */
function demoReklamasjon(m: string): Pick<Data, "reklamasjoner" | "reklamasjonProsjekt" | "reklOppsett"> {
  const naa = new Date().toISOString();
  return {
    reklamasjonProsjekt: "prek",
    reklOppsett: { timer: "prosjekt", ansvar: "snekker", fristDager: 14, prosjekt: "prek" },
    reklamasjoner: [{
      id: "rk1", prosjekt_id: "p3", meldt_av: "stale", meldt_dato: addDays(m, -9), kontakt: "Merete ringte butikken",
      tittel: "Gulvlist har løsnet ved kjøkkenøya", beskrivelse: "Lista har sluppet på ca. 1 meter, og det er en glipe mellom gulv og list.",
      status: "godkjent", vurdering: "Godkjent. Vi limer og spikrer lista på nytt.", ansvarlig_id: "mads", frist: addDays(m, 3), materiell_kost: null,
      behandlet_av: "stale", utbedret_av: null, utbedret_tid: null, signert_navn: "", signatur: "", signert_tid: null, opprettet: naa, endret: naa,
    }],
  };
}

function demoUtstyr(): Utstyr[] {
  const u = (id: string, ansatt_id: string, dato: string, varenr: string, beskrivelse: string, pris: number, kategori: Utstyr["kategori"], antall = 1): Utstyr =>
    ({ id, ansatt_id, kilde: "visma", visma_ordrenr: 6000 + Number(id.slice(1)), dato: `${y0}-${dato}`, varenr, nobb_nr: /^\d{8}$/.test(varenr) ? varenr : "", beskrivelse, antall, enhet: "STK", pris, kategori, kategori_manuell: false, serienr: "", bilde_sti: null, status: "i_bruk", merknad: "" });
  return [
    u("u1", "jim", "02-05", "60644557", "KRAFTBITS TX20", 19, "forbruk"),
    u("u2", "jim", "02-05", "57935432", "SLAGSKRUTREKKER WHP18DA KM", 2490, "verktoy"),
    u("u3", "jim", "02-05", "43204821", "SNEKKERHAMMER M 16 OZ", 389, "verktoy"),
    u("u4", "jim", "03-12", "1000", "Diverse – regnkle", 520, "arbeidstoy"),
    u("u5", "jim", "05-20", "60311111", "BUKSE 6241 HL SORT 56", 1290, "arbeidstoy"),
    u("u6", "jim", "08-28", "60311111", "BUKSE 6241 HL SORT 56", 1290, "arbeidstoy"),
    u("u9", "jim", "09-16", "60311112", "BUKSE 6230 STRETCH SORT 56", 1390, "arbeidstoy"),
    u("u10", "jim", "04-02", "60400001", "VERNESKO S3 JALAS 43", 1690, "verneutstyr"),
    u("u11", "jim", "09-01", "43204999", "HAMMER ERGO 20OZ XLARE RETTKLO", 459, "verktoy"),
    u("u7", "mads", "09-02", "57935499", "SIRKELSAG C1805DA KM HSC", 3990, "verktoy"),
    u("u8", "mads", "09-02", "60100001", "HANSKE MONTERING 11 VINTER BLÅ", 89, "verneutstyr", 3),
  ];
}

const demoVarer: FdvVare[] = [
  { varenr: "42157742", beskrivelse: "GIPSPL WAB 12,5X900X2400MM", antall: 48, enhet: "STK", nobb_nr: "42157742", fdv_url: "", skjul: false },
  { varenr: "11293347", beskrivelse: "BYGGFOLIE 0,15MM 2,6X15M ISOLA", antall: 2, enhet: "RL", nobb_nr: "11293347", fdv_url: "", skjul: false },
  { varenr: "47410886", beskrivelse: "DØR MD MK EI60/25DB 9X21H HV", antall: 2, enhet: "SET", nobb_nr: "47410886", fdv_url: "", skjul: false },
  { varenr: "60118313", beskrivelse: "AVFALLSEKK KLAR 240L 10STK", antall: 3, enhet: "PAK", nobb_nr: "60118313", fdv_url: "", skjul: true },
];
const vareEndring: Record<string, Partial<FdvVare>> = {};
const demoDok: (FdvDok & { pid: string })[] = [];
const lonnDemo: { system: "excel" | "visma_lonn" | "tripletex"; arter: Record<string, string> } = { system: "excel", arter: {} };
const txDemo = { aktiv: false, sist: null as string | null, status: "", send_timer: true, aktivitet_id: null as number | null, har_nokkel: false, sendt_timer: 0 };

export function demoApi(): Api {
  const d = PROFIL.id === "thaugland" ? thauglandDrakt(startdata()) : startdata();
  const svennFiler = new Set<number>();
  const svennKob = new Map<string, { nokkel: string; prosjekt_id: string | null; fakturerbar: boolean }>();
  let epost: string | null = null;
  const lyttere = new Set<() => void>();
  const authLyttere = new Set<(e: string | null) => void>();
  const endret = () => lyttere.forEach((f) => f());
  const meg = () => d.ansatte.find((a) => a.epost === epost);
  const leder = () => meg()?.rolle === "leder";
  const planlegger = () => leder() || !!meg()?.prosjektleder;
  const nyId = () => Math.random().toString(36).slice(2, 10);
  const vent = () => new Promise((r) => setTimeout(r, 80));
  const mld: Melding[] = [];
  const lestPer = new Map<string, Lest>();
  const chatLyttere = new Set<() => void>();
  const chatEndret = () => chatLyttere.forEach((f) => f());
  {
    const [a, b] = [d.ansatte[0], d.ansatte[1]];
    const t = (min: number) => new Date(Date.now() - min * 6e4).toISOString();
    if (a && b) mld.push(
      { id: "m1", ansatt_id: a.id, kanal: "felles", tekst: "God morgen! Husk allmøte fredag kl 07.30.", bilde_sti: null, opprettet: t(180), endret: null },
      { id: "m2", ansatt_id: b.id, kanal: "felles", tekst: "Notert 👍", bilde_sti: null, opprettet: t(170), endret: null },
    );
  }

  return {
    modus: "demo",
    async epost() { return epost; },
    onEpost(cb) { authLyttere.add(cb); return () => authLyttere.delete(cb); },
    async sendKode() { await vent(); },
    async bekreftKode(e) { epost = e; authLyttere.forEach((f) => f(epost)); },
    async loggUt() { epost = null; authLyttere.forEach((f) => f(null)); },
    async hent() {
      utenNett();
      await vent();
      const kopi = structuredClone(d);
      if (!leder()) kopi.utstyr = (kopi.utstyr ?? []).filter((x) => x.ansatt_id === meg()?.id);
      return kopi;
    },
    abonner(cb) { lyttere.add(cb); return () => lyttere.delete(cb); },
    async meldinger() {
      const m = meg(); if (!m) return [];
      return structuredClone(mld.filter((x) => !x.kanal.startsWith("dm:") || x.kanal.includes(m.id)));
    },
    async kanalLest() { return { ...(lestPer.get(meg()?.id ?? "") ?? {}) }; },
    async sendMelding(kanal, tekst, bilde) {
      const m = meg(); if (!m) throw new Error("Ikke innlogget.");
      if (!tekst.trim() && !bilde) return;
      mld.push({ id: nyId(), ansatt_id: m.id, kanal, tekst: tekst.trim(), bilde_sti: null, opprettet: new Date().toISOString(), endret: null });
      chatEndret();
    },
    async rettMelding(id, tekst) { const x = mld.find((y) => y.id === id && y.ansatt_id === meg()?.id); if (x) { x.tekst = tekst.trim(); x.endret = new Date().toISOString(); chatEndret(); } },
    async slettMelding(id) { const i = mld.findIndex((y) => y.id === id); if (i >= 0) { mld.splice(i, 1); chatEndret(); } },
    async markerKanalLest(kanal) { const id = meg()?.id; if (!id) return; const l = lestPer.get(id) ?? {}; l[kanal] = new Date().toISOString(); lestPer.set(id, l); },
    abonnerMeldinger(cb) { chatLyttere.add(cb); return () => chatLyttere.delete(cb); },
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
      utenNett();
      const m = meg();
      if (!m || (!leder() && n.ansatt_id !== m.id)) throw new Error("Du har ikke tilgang til å gjøre dette.");
      if (n.til <= n.fra) throw new Error("Sluttid må være etter starttid, og lunsjen kan ikke være lengre enn arbeidsøkta.");
      if (d.timer.some((t) => t.ansatt_id === n.ansatt_id && t.dato === n.dato && t.id !== n.id && t.fra < n.til && t.til > n.fra)) throw new Error("Tiden overlapper med en annen registrering samme dag.");
      const gammel = n.id ? d.timer.find((t) => t.id === n.id) : undefined;
      if (gammel?.status === "godkjent" && !leder()) throw new Error("Timene er godkjent og kan bare endres av leder.");
      const ny = { ...(gammel ?? { id: nyId(), lunsj_unntak: false, status: "levert" as const }), ...n, timer: varighet(n.fra, n.til, n.lunsj_min) } as Time;
      if (ny.reklamasjon_id && d.reklamasjonProsjekt) ny.prosjekt_id = d.reklamasjonProsjekt;
      if (ny.reklamasjon_id || (d.reklamasjonProsjekt && ny.prosjekt_id === d.reklamasjonProsjekt)) ny.fakturerbar = false;
      if (ny.tillegg_id) {
        const tl = d.tillegg.find((x) => x.id === ny.tillegg_id);
        if (ny.reklamasjon_id) throw new Error("Timer kan ikke gjelde både reklamasjon og tilleggsarbeid.");
        if (!tl || tl.prosjekt_id !== ny.prosjekt_id) throw new Error("Tilleggsarbeidet hører ikke til dette prosjektet.");
        if (tl.status === "avvist" && gammel?.tillegg_id !== ny.tillegg_id) throw new Error("Tilleggsarbeidet er avvist. Før timene på hovedjobben.");
      }
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
      d.bilder.unshift({ id: nyId(), prosjekt_id: til.prosjekt_id ?? null, avvik_id: til.avvik_id ?? null, dagbok_id: til.dagbok_id ?? null, tillegg_id: til.tillegg_id ?? null, sjekkliste_id: til.sjekkliste_id ?? null, sjekkliste_punkt: til.sjekkliste_punkt ?? null, reklamasjon_id: til.reklamasjon_id ?? null, ansatt_id: meg()!.id, sti, tekst: til.tekst ?? "", opprettet: til.opprettet ?? new Date().toISOString() });
      if (til.svenn_id) svennFiler.add(til.svenn_id);
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
        { visma_ordrenr: 52011, ordredato: isoOf(new Date()), ordretype: 1, transaksjonstype: 1, navn: "Jonas Lunde", sum_netto: 84500, kostnad: 61200, dekningsbidrag: 23300, fakturert: 0, ferdig: null },
        { visma_ordrenr: 51876, ordredato: isoOf(new Date()), ordretype: 1, transaksjonstype: 1, navn: "Jonas Lunde", sum_netto: 12900, kostnad: 8600, dekningsbidrag: 4300, fakturert: 12900, ferdig: isoOf(new Date()) },
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
      utenNett();
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
          timer: varighet(s.fra, slutt, o.lunsj ?? 0), lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: o.beskrivelse ?? "", status: "levert", fakturerbar: !!s.prosjekt_id && !s.reklamasjon_id && s.prosjekt_id !== d.reklamasjonProsjekt, kilde: "stempel", reklamasjon_id: s.reklamasjon_id ?? null, tillegg_id: s.tillegg_id ?? null });
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
    async lagreUtstyr(x) {
      const m = meg(); if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const liste = d.utstyr ?? (d.utstyr = []);
      const gammel = x.id ? liste.find((u) => u.id === x.id) : undefined;
      if (gammel) {
        if (!leder() && gammel.ansatt_id !== m.id) throw new Error("Du har ikke tilgang til å gjøre dette.");
        const tillatt = leder() ? x : { serienr: x.serienr, status: x.status, merknad: x.merknad, bytte_avklart: x.bytte_avklart, ...(gammel.kilde === "manuell" ? { beskrivelse: x.beskrivelse, nobb_nr: x.nobb_nr } : {}) };
        for (const [k, v] of Object.entries(tillatt)) if (v !== undefined && k !== "id") (gammel as any)[k] = v;
        if (leder() && x.kategori && x.kategori !== gammel.kategori) gammel.kategori_manuell = true;
        endret(); return gammel.id;
      }
      const ny: Utstyr = { id: nyId(), ansatt_id: leder() && x.ansatt_id ? x.ansatt_id : m.id, kilde: "manuell", visma_ordrenr: null, dato: x.dato ?? new Date().toISOString().slice(0, 10),
        varenr: "", nobb_nr: x.nobb_nr ?? "", beskrivelse: x.beskrivelse ?? "", antall: x.antall ?? 1, enhet: "STK", pris: x.pris ?? 0, kategori: x.kategori ?? "verktoy",
        kategori_manuell: !!x.kategori, serienr: x.serienr ?? "", bilde_sti: null, status: "i_bruk", merknad: x.merknad ?? "" };
      liste.unshift(ny); endret(); return ny.id;
    },
    async slettUtstyr(id) { d.utstyr = (d.utstyr ?? []).filter((u) => u.id !== id || u.kilde === "visma"); endret(); },
    async lagreKompetanse(k, fil) {
      const liste = d.kompetanse ?? (d.kompetanse = []);
      const x = k.id ? liste.find((y) => y.id === k.id) : undefined;
      const fil2 = fil ? { sti: URL.createObjectURL(fil), filnavn: fil.name } : {};
      if (x) Object.assign(x, k, fil2);
      else liste.push({ id: nyId(), navn: "", utsteder: "", utstedt: null, gyldig_til: null, sti: null, filnavn: "", merknad: "", opprettet: new Date().toISOString(), ...k, ...fil2 });
      endret();
    },
    async slettKompetanse(id) { d.kompetanse = (d.kompetanse ?? []).filter((x) => x.id !== id); endret(); },
    async utstyrBilde(id, fil) { const u = d.utstyr?.find((x) => x.id === id); if (u) u.bilde_sti = URL.createObjectURL(fil); endret(); },
    async svennKoblinger() { return [...svennKob.values()]; },
    async svennProsjekter(koblinger) {
      if (!leder()) throw new Error("Bare leder kan importere fra Svenn.");
      const ut: Record<string, string> = {};
      for (const k of koblinger) {
        let pid = k.prosjekt_id;
        if (!pid && k.ny_navn) {
          pid = d.prosjekter.find((p) => p.navn === k.ny_navn)?.id ?? null;
          if (!pid) { pid = nyId(); d.prosjekter.push({ id: pid, visma_nr: null, navn: k.ny_navn, kunde_id: null, adresse: "", estimert_timer: null, start: null, slutt: null, aktiv: false }); }
        }
        if (pid) { ut[k.nokkel] = pid; svennKob.set(k.nokkel, { nokkel: k.nokkel, prosjekt_id: pid, fakturerbar: true }); }
      }
      endret();
      return ut;
    },
    async svennImporterteFiler() { return new Set(svennFiler); },
    async importerSvenn(koblinger, rader) {
      if (!leder()) throw new Error("Bare leder kan importere fra Svenn.");
      let nye = 0;
      for (const k of koblinger) {
        let pid = k.prosjekt_id;
        if (!pid && k.ny_navn) {
          pid = d.prosjekter.find((p) => p.navn === k.ny_navn)?.id ?? null;
          if (!pid) { pid = nyId(); nye++; d.prosjekter.push({ id: pid, visma_nr: null, navn: k.ny_navn, kunde_id: null, adresse: "", estimert_timer: null, start: null, slutt: null, aktiv: false }); }
        }
        svennKob.set(k.nokkel, { nokkel: k.nokkel, prosjekt_id: pid, fakturerbar: k.fakturerbar && !!pid });
      }
      const fra = rader.reduce((m, r) => (r.d < m ? r.d : m), rader[0].d), til = rader.reduce((m, r) => (r.d > m ? r.d : m), rader[0].d);
      d.timer = d.timer.filter((t) => t.kilde !== "svenn" || t.dato < fra || t.dato > til);
      const ukjente = new Set<string>();
      for (const r of rader) {
        const a = d.ansatte.find((x) => x.ansattnr === r.a);
        if (!a) { ukjente.add(r.a); continue; }
        const k = svennKob.get(r.k);
        d.timer.push({ id: nyId(), ansatt_id: a.id, prosjekt_id: k?.prosjekt_id ?? null, dato: r.d, fra: r.f, til: r.t, lunsj_min: r.l, timer: varighet(r.f, r.t, r.l),
          lunsj_unntak: false, km: 0, reisetid: 0, beskrivelse: r.c, status: "godkjent", fakturerbar: !!k?.fakturerbar, kilde: "svenn" });
      }
      const s = d.timer.filter((t) => t.kilde === "svenn" && t.dato >= fra && t.dato <= til);
      const sum = (x: Time[]) => Math.round(x.reduce((n, t) => n + t.timer, 0) * 100) / 100;
      endret();
      return { importert: s.length, timer: sum(s), fakturerbart: sum(s.filter((t) => t.fakturerbar)), internt: sum(s.filter((t) => !t.prosjekt_id)), fra, til, nye_prosjekter: nye, ukjente_ansattnr: [...ukjente] };
    },
    async settUtstyrKvoter(kvoter) {
      if (!leder()) throw new Error("Bare leder kan endre kvotene.");
      d.utstyrGrenser = { ...(d.utstyrGrenser ?? { arbeidstoy: null, verktoy: null, sammeMnd: 6 }), kvoter }; endret();
    },
    async settUtstyrGrenser(arbeidstoy, verktoy, sammeMnd) {
      if (!leder()) throw new Error("Bare leder kan endre grensene.");
      d.utstyrGrenser = { arbeidstoy: arbeidstoy || null, verktoy: verktoy || null, sammeMnd }; endret();
    },
    async lagrePersonrapporter(r) {
      if (!leder()) throw new Error("Bare leder kan lage rapporter.");
      const liste = (d.personrapporter ??= []), naa = new Date().toISOString();
      for (const x of r) {
        const g = liste.find((y) => y.ansatt_id === x.ansatt_id && y.periode === x.periode);
        if (g) Object.assign(g, { innhold: x.innhold, kommentar: x.kommentar }, x.publiser && !g.publisert ? { publisert: naa } : {});
        else liste.push({ id: nyId(), ansatt_id: x.ansatt_id, periode: x.periode, innhold: x.innhold, kommentar: x.kommentar, publisert: x.publiser ? naa : null, lest: null, opprettet: naa });
      }
      endret();
    },
    async slettPersonrapport(id) { if (!leder()) throw new Error("Bare leder kan slette."); d.personrapporter = (d.personrapporter ?? []).filter((x) => x.id !== id); endret(); },
    async markerPersonrapportLest(id) { const r = (d.personrapporter ?? []).find((x) => x.id === id && x.ansatt_id === meg()?.id && x.publisert); if (r && !r.lest) { r.lest = new Date().toISOString(); endret(); } },
    async sendInvitasjon(id) {
      if (!leder()) throw new Error("Bare leder kan sende invitasjoner.");
      const a = d.ansatte.find((x) => x.id === id); if (!a?.epost) throw new Error("Legg inn e-post på den ansatte først.");
      const sist = demoInvitert.get(id); if (sist && Date.now() - new Date(sist).getTime() < 60_000) throw new Error("Invitasjonen ble nettopp sendt. Vent et minutt før du sender på nytt.");
      demoInvitert.set(id, new Date().toISOString());
    },
    async ansatteInnlogging() {
      return d.ansatte.map((a, i) => ({ ansatt_id: a.id, invitert: demoInvitert.get(a.id) ?? null, innlogget: i % 4 === 3 ? null : new Date(Date.now() - (i + 1) * 36e5 * 7).toISOString() }));
    },
    async ansatteMedPush() { return d.ansatte.filter((a) => a.aktiv).slice(0, 3).map((a) => a.id); },
    async lagreDgKategorier(k) { if (!leder()) throw new Error("Bare leder kan endre dette."); d.dgKategorier = k; endret(); },
    async markerLest(id) {
      const m = meg(); if (!m) return;
      if (!d.lest.some((l) => l.rapport_id === id && l.ansatt_id === m.id)) d.lest.push({ rapport_id: id, ansatt_id: m.id, lest: new Date().toISOString() });
      endret();
    },
    async settOmsetningsmaal(belop) { d.maalOmsetning = belop; endret(); },
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
    async lastOppFdv(pid, fil, svenn, kategori) { demoDok.push({ pid, id: nyId(), kategori: kategori ?? "fdv", navn: fil.name, sti: URL.createObjectURL(fil), storrelse: fil.size, opprettet: svenn?.opprettet ?? new Date().toISOString() }); if (svenn) svennFiler.add(svenn.svenn_id); endret(); },
    async settDokKategori(id, kategori) { const x = demoDok.find((y) => y.id === id); if (x) x.kategori = kategori; endret(); },
    async slettFdv(id) { const i = demoDok.findIndex((x) => x.id === id); if (i >= 0) demoDok.splice(i, 1); endret(); },
    async dokUrl(sti) { return sti; },
    async slettBilde(id) { d.bilder = d.bilder.filter((b) => b.id !== id); endret(); },
    async bildeUrler(stier) { return Object.fromEntries(stier.map((s) => [s, s])); },
    async settMittSprak(sprak) { const m = meg(); if (m) m.sprak = sprak; endret(); },
    async settMittTema(tema) { const m = meg(); if (m) m.tema = tema; endret(); },
    async lagreReklamasjon(x) {
      const m = meg(); if (!m) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const liste = (d.reklamasjoner ??= []);
      const naa = new Date().toISOString();
      const g = x.id ? liste.find((r) => r.id === x.id) : undefined;
      if (g) {
        if (!planlegger() && !(g.ansvarlig_id === m.id) && !(g.meldt_av === m.id && g.status === "ny")) throw new Error("Bare leder eller prosjektleder kan behandle reklamasjonen.");
        if (x.signatur && (x.status ?? g.status) !== "utbedret") throw new Error("Kunden kan kvittere når reklamasjonen er utbedret.");
        const forStatus = g.status;
        Object.assign(g, x, { endret: naa });
        if (g.status === "utbedret" && forStatus !== "utbedret") { g.utbedret_av = m.id; g.utbedret_tid = naa; }
        if (x.signatur) g.signert_tid = naa;
        endret(); return g.id;
      }
      const id = nyId();
      liste.unshift({ id, prosjekt_id: x.prosjekt_id, meldt_av: m.id, meldt_dato: x.meldt_dato ?? naa.slice(0, 10), kontakt: x.kontakt ?? "", tittel: x.tittel ?? "", beskrivelse: x.beskrivelse ?? "",
        status: planlegger() ? x.status ?? "ny" : "ny", vurdering: planlegger() ? x.vurdering ?? "" : "", ansvarlig_id: planlegger() ? x.ansvarlig_id ?? null : null, frist: planlegger() ? x.frist ?? null : null,
        materiell_kost: null, behandlet_av: null, utbedret_av: null, utbedret_tid: null, signert_navn: "", signatur: "", signert_tid: null, opprettet: naa, endret: naa });
      // Bedriftens oppsett: ansvarlig og frist settes med en gang
      const ny = liste[0]!, o = d.reklOppsett, p = d.prosjekter.find((y) => y.id === ny.prosjekt_id);
      if (o && !ny.ansvarlig_id && o.ansvar !== "ingen") ny.ansvarlig_id = (o.ansvar === "snekker" ? p?.snekker_id : p?.selger_id ?? p?.snekker_id) ?? null;
      if (o && !ny.frist && o.fristDager > 0) { const f = addDays(ny.meldt_dato, o.fristDager), i = naa.slice(0, 10); ny.frist = f < i ? i : f; }
      endret(); return id;
    },
    async slettReklamasjon(id) { if (!leder()) throw new Error("Bare leder kan slette."); d.reklamasjoner = (d.reklamasjoner ?? []).filter((r) => r.id !== id); endret(); },
    async lagreReklamasjonOppsett(o) {
      if (!leder()) throw new Error("Bare leder kan endre oppsettet for reklamasjon.");
      if (o.timer === "prosjekt" && !o.prosjekt) throw new Error("Velg reklamasjonsprosjektet.");
      d.reklOppsett = { ...o, prosjekt: o.timer === "prosjekt" ? o.prosjekt : d.reklOppsett?.prosjekt ?? null };
      d.reklamasjonProsjekt = o.timer === "prosjekt" ? o.prosjekt : null;
      endret();
    },
    async lagreReklamasjonsprosjekt(id) { if (!leder()) throw new Error("Bare leder kan velge reklamasjonsprosjekt."); d.reklamasjonProsjekt = id; endret(); },
    async stempleTillegg(id) {
      const s = d.stempling.find((x) => x.ansatt_id === meg()?.id); if (!s) throw new Error("Du er ikke logget inn.");
      if (id && !d.tillegg.some((x) => x.id === id && x.prosjekt_id === s.prosjekt_id && x.status !== "avvist")) throw new Error("Tilleggsarbeidet hører ikke til prosjektet du er logget inn på.");
      s.tillegg_id = id; endret();
    },
    async stempleReklamasjon(id) { const s = d.stempling.find((x) => x.ansatt_id === meg()?.id); if (!s) throw new Error("Du er ikke logget inn."); s.reklamasjon_id = id; endret(); },
    async lagreDrakt(logo, logoMork, drakt, forAlle) {
      if (!leder()) throw new Error("Bare leder kan endre logo og farger.");
      d.logo = logo; d.logoMork = logoMork; d.drakt = drakt;
      if (!drakt) for (const a of d.ansatte) { if (a.tema === "egen") a.tema = "byggfag"; }
      else if (forAlle) for (const a of d.ansatte) a.tema = "egen";
      endret();
    },
    async lagreModuler(av) { if (!leder()) throw new Error("Bare leder kan endre hvilke deler av appen som brukes."); d.modulerAv = [...new Set(av)]; endret(); },
    async lagreOppgave(o) {
      if (!planlegger()) throw new Error("Bare leder og prosjektleder kan legge inn arbeid i planen.");
      if (o.til < o.fra) throw new Error("Sluttdatoen er før startdatoen.");
      const liste = (d.oppgaver ??= []);
      const g = o.id ? liste.find((x) => x.id === o.id) : undefined;
      const rad = { prosjekt_id: o.prosjekt_id, tittel: o.tittel.trim(), beskrivelse: o.beskrivelse.trim(), fra: o.fra, til: o.til, ansatte: [...new Set(o.ansatte)], ...(o.reklamasjon_id ? { reklamasjon_id: o.reklamasjon_id } : {}), helg: !!o.helg };
      if (g) Object.assign(g, rad, o.rekkefolge != null ? { rekkefolge: o.rekkefolge } : {});
      else liste.push({ id: nyId(), ...rad, rekkefolge: o.rekkefolge ?? 0, status: "planlagt", opprettet_av: meg()?.id ?? null, ferdig_tid: null });
      endret();
    },
    async slettOppgave(id) { if (!planlegger()) throw new Error("Bare leder og prosjektleder kan slette."); d.oppgaver = (d.oppgaver ?? []).filter((x) => x.id !== id); endret(); },
    async settOppgaveStatus(id, status) {
      const o = (d.oppgaver ?? []).find((x) => x.id === id);
      if (!o) return;
      if (!planlegger() && !o.ansatte.includes(meg()?.id ?? "")) throw new Error("Du kan bare endre dine egne oppgaver.");
      o.status = status; o.ferdig_tid = status === "ferdig" ? new Date().toISOString() : null; endret();
    },
    async lagreLeveranse(l) {
      if (!planlegger()) throw new Error("Bare leder og prosjektleder kan lage leveranser.");
      const liste = (d.leveranser ??= []);
      const g = l.id ? liste.find((x) => x.id === l.id) : undefined;
      const rad = { prosjekt_id: l.prosjekt_id, navn: l.navn.trim(), dato: l.dato || null, leverandor: l.leverandor.trim(), notat: l.notat.trim() };
      if (g) Object.assign(g, rad, l.rekkefolge != null ? { rekkefolge: l.rekkefolge } : {}, l.status ? { status: l.status } : {});
      else liste.push({ id: nyId(), ...rad, rekkefolge: l.rekkefolge ?? 0, status: l.status ?? "planlagt" });
      endret();
    },
    async slettLeveranse(id) {
      if (!planlegger()) throw new Error("Bare leder og prosjektleder kan slette.");
      d.leveranser = (d.leveranser ?? []).filter((x) => x.id !== id);
      for (const m of d.materialer ?? []) if (m.leveranse_id === id) m.leveranse_id = null;
      endret();
    },
    async settLeveranseStatus(id, status) {
      const l = (d.leveranser ?? []).find((x) => x.id === id);
      if (!l) return;
      if (!planlegger() && status !== "levert") return;
      l.status = status; endret();
    },
    async lagreMaterialer(liste) {
      if (!planlegger()) throw new Error("Bare leder og prosjektleder kan endre materiallisten.");
      const alle = (d.materialer ??= []);
      for (const m of liste) {
        const g = m.id ? alle.find((x) => x.id === m.id) : undefined;
        const rad = { prosjekt_id: m.prosjekt_id, leveranse_id: m.leveranse_id, beskrivelse: m.beskrivelse.trim(), antall: m.antall, enhet: m.enhet.trim(), varenr: m.varenr ?? "", nobb_nr: m.nobb_nr ?? "", notat: m.notat ?? "" };
        if (g) Object.assign(g, rad); else alle.push({ id: nyId(), ...rad, rekkefolge: m.rekkefolge ?? 0, levert: false });
      }
      endret();
    },
    async slettMateriale(id) { if (!planlegger()) throw new Error("Bare leder og prosjektleder kan slette."); d.materialer = (d.materialer ?? []).filter((x) => x.id !== id); endret(); },
    async settMaterialeLevert(id, levert) { const m = (d.materialer ?? []).find((x) => x.id === id); if (m) { m.levert = levert; endret(); } },
    async nySjekkliste(prosjekt_id, navn, mal, punkter) {
      const id = nyId(), naa = new Date().toISOString();
      (d.sjekklister ??= []).push({ id, prosjekt_id, navn: navn.trim(), mal, punkter: punkter.map((tekst) => ({ tekst, svar: null, kommentar: "" })), status: "pagaar", opprettet_av: meg()?.id ?? null, opprettet: naa, endret: naa, signert_av: null, signert_tid: null });
      endret(); return id;
    },
    async lagreSjekkliste(id, x) {
      const s = (d.sjekklister ?? []).find((y) => y.id === id);
      if (!s) return;
      if (s.status === "signert" && !planlegger()) throw new Error("Sjekklisten er signert. Be leder eller prosjektleder åpne den igjen.");
      if (x.status === "signert" && (x.punkter ?? s.punkter).some((p) => !p.svar)) throw new Error("Alle punktene må besvares før sjekklisten kan signeres.");
      Object.assign(s, x, { endret: new Date().toISOString() });
      if (x.status === "signert") { s.signert_av = meg()?.id ?? null; s.signert_tid = new Date().toISOString(); }
      if (x.status === "pagaar") { s.signert_av = null; s.signert_tid = null; }
      endret();
    },
    async slettSjekkliste(id) { d.sjekklister = (d.sjekklister ?? []).filter((x) => x.id !== id); endret(); },
    async lagreSja(x) {
      const liste = (d.sja ??= []);
      const g = x.id ? liste.find((y) => y.id === x.id) : undefined;
      if (g) { const nytt = g.arbeid !== x.arbeid || JSON.stringify(g.risikoer) !== JSON.stringify(x.risikoer) || g.verneutstyr !== x.verneutstyr || g.dato !== x.dato; Object.assign(g, x); if (nytt) g.kvittert = {}; }
      else liste.unshift({ ...x, id: nyId(), kvittert: {}, opprettet_av: meg()?.id ?? null, opprettet: new Date().toISOString() });
      endret();
    },
    async kvitterSja(id) {
      const s = (d.sja ?? []).find((x) => x.id === id), m = meg();
      if (!s || !m || !s.deltakere.includes(m.id)) throw new Error("Du står ikke som deltaker på denne SJA-en.");
      s.kvittert = { ...s.kvittert, [m.id]: new Date().toISOString() }; endret();
    },
    async slettSja(id) { d.sja = (d.sja ?? []).filter((x) => x.id !== id); endret(); },
    async lagreMittHmsKort(nr, gyldig) { const m = meg(); if (m) { m.hms_kort_nr = nr.trim(); m.hms_kort_gyldig = gyldig; endret(); } },
    async bestill(x) {
      const liste = (d.bestillinger ??= []);
      const g = x.id ? liste.find((y) => y.id === x.id) : undefined;
      if (g) { if (g.status !== "ny") throw new Error("Bestillingen er tatt i mot av butikken og kan ikke endres."); Object.assign(g, x); }
      else { if (!x.linjer.length) throw new Error("Legg inn minst én vare."); const naa = new Date().toISOString(); liste.unshift({ ...x, id: nyId(), bestilt_av: meg()?.id ?? null, status: "ny", svar: "", behandlet_av: null, leveranse_id: null, opprettet: naa, endret: naa }); }
      endret();
    },
    async settBestillingStatus(id, status, svar) {
      if (!planlegger()) throw new Error("Bare butikk/prosjektleder kan endre status.");
      const b = (d.bestillinger ?? []).find((x) => x.id === id); if (!b) return;
      b.status = status; if (svar != null) b.svar = svar; b.behandlet_av = meg()?.id ?? null; endret();
    },
    async slettBestilling(id) { d.bestillinger = (d.bestillinger ?? []).filter((x) => x.id !== id); endret(); },
    async bestillingTilLeveranse(b, navn) {
      if (!planlegger()) throw new Error("Bare leder og prosjektleder kan endre materiallisten.");
      const levId = nyId();
      (d.leveranser ??= []).push({ id: levId, prosjekt_id: b.prosjekt_id, navn, rekkefolge: 99, dato: b.onsket_dato, status: "bestilt", leverandor: "Eget lager", notat: b.merknad });
      for (const [i, l] of b.linjer.entries()) (d.materialer ??= []).push({ id: nyId(), prosjekt_id: b.prosjekt_id, leveranse_id: levId, rekkefolge: i, varenr: l.nobb ?? "", nobb_nr: l.nobb ?? "", beskrivelse: l.beskrivelse, antall: l.antall, enhet: l.enhet, notat: "", levert: false });
      const g = (d.bestillinger ?? []).find((x) => x.id === b.id); if (g) { g.leveranse_id = levId; if (g.status === "ny") g.status = "plukkes"; }
      endret();
    },
    async flyttMaterialer(ider, leveranseId) { if (!planlegger()) throw new Error("Bare leder og prosjektleder kan endre materiallisten."); for (const m of d.materialer ?? []) if (ider.includes(m.id)) m.leveranse_id = leveranseId; endret(); },
    async lagreKampanje(k, nyeSider = [], fjern = []) {
      if (!leder()) throw new Error("Du har ikke tilgang til å gjøre dette.");
      const liste = (d.kampanjer ??= []);
      const sider = [...(k.sider ?? []).filter((s) => !fjern.includes(s)), ...nyeSider.map((b) => URL.createObjectURL(b))];
      const g = k.id ? liste.find((x) => x.id === k.id) : undefined;
      const rad = { tittel: k.tittel, tekst: k.tekst ?? "", fra: k.fra, til: k.til, lenke: k.lenke || null, sider };
      if (g) Object.assign(g, rad); else liste.unshift({ id: nyId(), opprettet: new Date().toISOString(), ...rad });
      endret();
    },
    async slettKampanje(id) { d.kampanjer = (d.kampanjer ?? []).filter((x) => x.id !== id); endret(); },
    async lagrePush() { /* ikke i demo */ },
    async lagreBedriftsprofil(p) { if (!leder()) throw new Error("Bare leder kan endre bedriftens profil."); d.bedrift = { ...d.bedrift!, ...p }; endret(); },
    async erPlattformAdmin() { return false; },
    async tripletexStatus() { return { ...txDemo }; },
    async vismaKobling() { return { ...vismaDemo }; },
    async kobleVisma() {
      if (!leder()) throw new Error("Bare leder kan koble til Visma.");
      Object.assign(vismaDemo, { koblet: true, firma: d.bedrift?.navn ?? "Demo Bygg AS", status: "Hentet 214 kunder og 37 prosjekter (demo).", sist: new Date().toISOString(), kunder: 214, prosjekter: 37 });
      endret();
    },
    async ansattForslag() { return vismaDemo.koblet ? forslagDemo.filter((f) => !d.ansatte.some((a) => a.navn === f.navn)) : []; },
    async leggTilForslag(kilde, ider) {
      if (!leder()) throw new Error("Bare leder kan legge til ansatte.");
      const nye = forslagDemo.filter((f) => f.kilde === kilde && ider.includes(f.ekstern_id) && !d.ansatte.some((a) => a.navn === f.navn));
      for (const f of nye) d.ansatte.push({ ...d.ansatte[d.ansatte.length - 1]!, id: crypto.randomUUID(), navn: f.navn, epost: f.epost, ansattnr: f.ansattnr, rolle: "ansatt", prosjektleder: false, aktiv: true });
      for (const f of nye) forslagDemo.splice(forslagDemo.indexOf(f), 1);
      endret(); return nye.length;
    },
    async avvisForslag(kilde, id) { const i = forslagDemo.findIndex((f) => f.kilde === kilde && f.ekstern_id === id); if (i >= 0) forslagDemo.splice(i, 1); endret(); },
    async inviterAlleSomMangler() { let n = 0; for (const a of d.ansatte) if (a.aktiv && a.epost && !demoInvitert.has(a.id)) { demoInvitert.set(a.id, new Date().toISOString()); n++; } return n; },
    async kobleTripletex(nokkel) { if (nokkel.trim().length < 10) throw new Error("Lim inn hele ansattnøkkelen fra Tripletex."); Object.assign(txDemo, { aktiv: true, har_nokkel: true, status: "Koblet til (demo). I den ekte appen hentes prosjekter og kunder nå." }); endret(); },
    async kobleFraTripletex() { Object.assign(txDemo, { aktiv: false, har_nokkel: false, status: "Koblet fra." }); endret(); },
    async tripletexInnstillinger(sendTimer, aktivitetId) { Object.assign(txDemo, { send_timer: sendTimer, aktivitet_id: aktivitetId }); },
    async tripletexHentNa() { txDemo.sist = new Date().toISOString(); return "Demo: i den ekte appen hentes prosjekter, kunder og ansatte fra Tripletex nå, og godkjente timer sendes dit."; },
    async lonnOppsett() { return leder() ? { system: lonnDemo.system, arter: { ...lonnDemo.arter } } : null; },
    async lagreLonnOppsett(system, arter) { if (!leder()) throw new Error("Bare leder kan endre lønnsoppsettet."); Object.assign(lonnDemo, { system, arter: { ...arter } }); },
    async tripletexLonnsarter() {
      if (!txDemo.aktiv) throw new Error("Tripletex er ikke koblet til.");
      return [
        { id: 1, number: "1000", name: "Fastlønn", showInTimesheet: false },
        { id: 2, number: "1020", name: "Timelønn", showInTimesheet: true },
        { id: 3, number: "1050", name: "Overtid 50 %", showInTimesheet: true },
        { id: 4, number: "1051", name: "Overtid 100 %", showInTimesheet: true },
        { id: 5, number: "1300", name: "Kilometergodtgjørelse", showInTimesheet: true },
      ];
    },
    async sendLonnTripletex(mnd, linjer) {
      if (!txDemo.aktiv) throw new Error("Tripletex er ikke koblet til.");
      return { mnd, sendt: linjer.length, oppdatert: 0, fjernet: 0, ikke_koblet: [], ukjente_lonnsarter: [], feil: [] };
    },
    async plattformOversikt() { return []; },
    async opprettBedrift() { throw new Error("Ikke i demo."); },
    async settAbonnement() { /* ikke i demo */ },
    async slettPush() { /* ikke i demo */ },
    async settVisKampanjer(vis) { const m = meg(); if (m) m.vis_kampanjer = vis; endret(); },
    async visKampanje(id) { const m = meg(); if (m) { m.skjulte_kampanjer = id ? (m.skjulte_kampanjer ?? []).filter((x) => x !== id) : []; m.vis_kampanjer = true; } endret(); },
    async skjulKampanje(id) { const m = meg(); if (m) m.skjulte_kampanjer = [...(m.skjulte_kampanjer ?? []), id]; endret(); },
    async settFakturertFull(id, full) { const p = d.prosjekter.find((x) => x.id === id); if (p) p.fakturert_full = full; endret(); },
    async lagreEiendom(id, e) { const p = d.prosjekter.find((x) => x.id === id); if (p) Object.assign(p, e); endret(); },
    async settFastpris(id, fastpris) { const p = d.prosjekter.find((x) => x.id === id); if (p) p.fastpris = fastpris; endret(); },
    async kobleProsjekt(fra, til) {
      const a = d.prosjekter.find((x) => x.id === fra), b = d.prosjekter.find((x) => x.id === til);
      if (a?.visma_nr != null) throw new Error("Prosjektet kommer allerede fra Visma.");
      if (b && b.visma_nr == null) throw new Error("Velg et prosjekt som kommer fra Visma.");
      return this.slaaSammenProsjekter(fra, til);
    },
    async slaaSammenProsjekter(fra, til) {
      if (!leder()) throw new Error("Bare leder kan slå sammen prosjekter.");
      const a = d.prosjekter.find((x) => x.id === fra), b = d.prosjekter.find((x) => x.id === til);
      if (!a || !b) throw new Error("Fant ikke prosjektet.");
      if (a.id === b.id) throw new Error("Velg et annet prosjekt.");
      for (const liste of [d.timer, d.dagbok, d.tillegg, d.bilder, d.avvik, d.stempling, d.utstyr ?? [], d.oppgaver ?? [], d.leveranser ?? [], d.materialer ?? [], d.sjekklister ?? [], d.sja ?? [], d.bestillinger ?? [], d.reklamasjoner ?? []] as { prosjekt_id?: string | null }[][])
        for (const x of liste) if (x.prosjekt_id === fra) x.prosjekt_id = til;
      if (!b.adresse && a.adresse) b.adresse = a.adresse;
      if (b.estimert_timer == null && a.estimert_timer != null) b.estimert_timer = a.estimert_timer;
      if (!b.kunde_id && a.kunde_id) b.kunde_id = a.kunde_id;
      if (a.aktiv) b.aktiv = true;
      d.prosjekter = d.prosjekter.filter((x) => x.id !== fra);
      endret();
    },
    async lagreProsjekt(p, nyKunde) {
      if (!leder() && (p.id || p.visma_nr != null)) throw new Error("Du har ikke tilgang til å gjøre dette.");
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

/** Eksempel på en DM-kampanje i demoen: fire enkle sider tegnet som SVG */
function demoKampanjer(): Data["kampanjer"] {
  const idag = isoOf(new Date());
  const side = (tittel: string, varer: [string, string, string][], farge: string) => {
    const rader = varer.map(([navn, pris, foer], i) => {
      const y = 330 + i * 250;
      return `<rect x="40" y="${y}" width="760" height="220" rx="18" fill="#FFFFFF"/><rect x="60" y="${y + 20}" width="180" height="180" rx="12" fill="#E8ECF6"/>`
        + `<text x="270" y="${y + 70}" font-size="34" font-weight="700" fill="#0B1F5C">${navn}</text>`
        + `<text x="270" y="${y + 115}" font-size="24" fill="#5A6278">Før ${foer}</text>`
        + `<rect x="560" y="${y + 120}" width="220" height="80" rx="40" fill="#FFCD00"/><text x="670" y="${y + 173}" font-size="40" font-weight="800" text-anchor="middle" fill="#0B1F5C">${pris}</text>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 1188" font-family="Arial, sans-serif"><rect width="840" height="1188" fill="${farge}"/>`
      + `<rect width="840" height="280" fill="#0B1F5C"/><text x="40" y="120" font-size="36" fill="#FFCD00" font-weight="700">DEMO-KAMPANJE</text>`
      + `<text x="40" y="200" font-size="64" fill="#FFFFFF" font-weight="800">${tittel}</text>${rader}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };
  return [{
    id: "demo-kampanje", tittel: "Høstkampanje (eksempel)", tekst: "Eksempel på hvordan en DM-kampanje vises. Tips kundene om tilbudene!",
    fra: addDays(idag, -3), til: addDays(idag, 11), lenke: null, opprettet: new Date().toISOString(),
    sider: [
      side("Høstkupp", [["Drill/skrutrekker 18 V", "1 990,-", "2 790,-"], ["Kappsag 216 mm", "3 490,-", "4 290,-"], ["Batteripakke 2 stk", "1 290,-", "1 790,-"]], "#F3F5FA"),
      side("Terrasse og ute", [["Terrassebord 28x120", "19,90 lm", "24,90 lm"], ["Terrasseskruer 1000 stk", "449,-", "599,-"], ["Beis 2,7 L", "399,-", "529,-"]], "#F6F2EB"),
      side("Isolasjon og tak", [["Isolasjon 200 mm", "89,- pk", "119,- pk"], ["Takpapp 10 m²", "699,-", "849,-"], ["Lekter 23x48", "8,90 lm", "11,50 lm"]], "#F3F5FA"),
      side("Maling", [["Innendørs maling 9 L", "899,-", "1 199,-"], ["Grunning 3 L", "299,-", "399,-"], ["Rull og brett", "149,-", "219,-"]], "#F6F2EB"),
    ],
  }];
}

/** Demo i Thaugland-drakt: trelast- og byggevarehandel med tre avdelinger og uten egne snekkere */
function thauglandDrakt(d: Data): Data {
  d.avdelinger = [
    { id: 1, navn: "Butikk", maks_borte: 1, rekkefolge: 1 },
    { id: 2, navn: "Proffsalg", maks_borte: 1, rekkefolge: 2 },
    { id: 3, navn: "Lager og levering", maks_borte: 2, rekkefolge: 3 },
  ];
  const navn: Record<string, [string, number]> = {
    stale: ["Kari Thorsen", 2], butikk2: ["Ole Hansen", 1], karianne: ["Ingrid Berg", 1],
    mads: ["Martin Lie", 2], snekker2: ["Sara Nilsen", 2],
    snekker3: ["Tomasz Nowak", 3], snekker4: ["Jonas Bakke", 3], snekker5: ["Ali Hassan", 3], jim: ["Erik Dahl", 3],
  };
  for (const a of d.ansatte) { const n = navn[a.id]; if (n) { a.navn = n[0]; a.avdeling_id = n[1]; a.epost = demoEpost(n[0]); } a.tema = "thaugland"; }
  d.kunder = [
    { id: "k1", visma_nr: 20311, navn: "Byggmester Hansen AS", adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true },
    { id: "k2", visma_nr: 20348, navn: "Snekker Olsen AS", adresse: "", postnr: "", poststed: "", telefon: "", epost: "", aktiv: true },
  ];
  const p = d.prosjekter;
  if (p[0]) Object.assign(p[0], { navn: "Rekkehus Grefsen – leveranser", adresse: "Grefsenveien 12, 0482 Oslo", estimert_timer: 40 });
  if (p[1]) Object.assign(p[1], { navn: "Enebolig Nittedal – materialpakke", adresse: "Hagan, 1480 Slattum", estimert_timer: 60 });
  if (d.avvik[0]) Object.assign(d.avvik[0], { tittel: "Skadet pall ved lossing", beskrivelse: "En pall med gips ble skadet ved lossing hos kunden. Tre plater knust." });
  if (d.dagbok[0]) Object.assign(d.dagbok[0], { tekst: "Levert to billass trelast og gips. Kunden kvitterte, resten leveres torsdag." });
  d.maal = 5000;
  d.maalOmsetning = 120000000;
  d.omsetning = (d.omsetning ?? []).map((o) => ({ ...o, belop: o.belop * 4 }));
  if (d.kampanjer?.[0]) Object.assign(d.kampanjer[0], { tittel: "Månedens tilbud (eksempel)", tekst: "Eksempel på hvordan kampanjene vises for de ansatte. Tips kundene om tilbudene!" });
  return d;
}

/** Standardregler for DG-kategoriene (samme som i databasen) */
export const STANDARD_DG: import("./dg").DgKategori[] = [
  { id: "vinduer", navn: "Vinduer", med: ["vindu", "nordan", "natre", "h-karmen", "takv mh", "skyvedør"], uten: ["base", "kitt", "pensel", "holder", "vindusvr", "vrider", "deponer", "maling", "frakt", "beslag", "lås", "sålbenk", "rullesett"] },
  { id: "tak", navn: "Takplater", med: ["takpl", "takplate", "takpakke", "powertekk", "takpanne", "takshingel", "takstein", "plannja", "tata steel", "tata click", "tata takpl", "decra", "ruukki", "falstak", "click fals"], uten: ["glava", "flexi", "takrenne", "taklist", "undertak", "takstol", "sponpl", "takv", "spiker", "skrue", "huntonit", "trefib", "kraning"] },
];

/** Oppdiktet salg av vinduer og takplater de siste 14 månedene */
function demoSalg(): import("./dg").SalgKategoriMnd[] {
  const ut: import("./dg").SalgKategoriMnd[] = [];
  const n = new Date();
  for (let i = 13; i >= 0; i--) {
    const t = new Date(n.getFullYear(), n.getMonth() - i, 1), aar = t.getFullYear(), mnd = t.getMonth() + 1;
    const sesong = [0.4, 0.5, 0.8, 1.1, 1.4, 1.5, 1.0, 1.2, 1.3, 1.1, 0.7, 0.4][mnd - 1]!;
    const v = Math.round(180000 * sesong * (0.85 + ((aar * 7 + mnd * 13) % 30) / 100)), tk = Math.round(140000 * sesong * (0.8 + ((aar * 3 + mnd * 11) % 35) / 100));
    ut.push({ aar, mnd, kategori: "vinduer", omsetning: v, db: Math.round(v * (0.17 + ((mnd * 5) % 7) / 100)), linjer: 6 + (mnd % 5), eksempler: [{ tekst: "Vinduspakke enebolig", omsetning: Math.round(v * 0.6), db: Math.round(v * 0.11) }, { tekst: "Skifte vindu", omsetning: Math.round(v * 0.4), db: Math.round(v * 0.08) }] });
    ut.push({ aar, mnd, kategori: "tak", omsetning: tk, db: Math.round(tk * (0.12 + ((mnd * 3) % 8) / 100)), linjer: 4 + (mnd % 4), eksempler: [{ tekst: "Stål takplater sort", omsetning: Math.round(tk * 0.7), db: Math.round(tk * 0.09) }, { tekst: "Takpanne betong", omsetning: Math.round(tk * 0.3), db: Math.round(tk * 0.04) }] });
  }
  return ut;
}

/** Demoen oppfører seg som den ekte appen når telefonen er uten nett */
function utenNett() { if (typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("Failed to fetch"); }
