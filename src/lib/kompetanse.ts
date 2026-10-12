// Kurs og kompetansebevis per ansatt, med gyldighet og varsling før de går ut.

export interface Kompetanse {
  id: string; ansatt_id: string; type: string; navn: string; utsteder: string;
  utstedt: string | null; gyldig_til: string | null; sti: string | null; filnavn: string; merknad: string; opprettet: string;
}

/** Vanlige kurs og bevis i tømrer- og byggfag. Gyldighet varierer, så den føres fra beviset. */
export const KURS: { id: string; navn: string; hint?: string }[] = [
  { id: "stillas", navn: "Stillasmontør / stillaskurs", hint: "Hvilken høyde/klasse kurset gjelder" },
  { id: "hoyde", navn: "Arbeid i høyden / fallsikring" },
  { id: "lift", navn: "Personløfter / lift", hint: "Klasse, f.eks. A og B" },
  { id: "truck", navn: "Truck", hint: "Klasse, f.eks. T1 og T4" },
  { id: "kran", navn: "Kran og anhuker", hint: "Klasse, f.eks. G4 eller anhuker" },
  { id: "varme", navn: "Varme arbeider" },
  { id: "forstehjelp", navn: "Førstehjelp" },
  { id: "hms", navn: "HMS-kort" },
  { id: "sikkerhet", navn: "HMS- og sikkerhetskurs", hint: "F.eks. Prosjekt fareblind" },
  { id: "verktoy", navn: "Maskiner og verktøy", hint: "F.eks. motorsag, spikerpistol" },
  { id: "asbest", navn: "Asbest og miljøsanering" },
  { id: "varsling", navn: "Arbeidsvarsling" },
  { id: "fagbrev", navn: "Fagbrev / svennebrev" },
  { id: "forerkort", navn: "Førerkort", hint: "Klasse, f.eks. BE eller C1" },
  { id: "annet", navn: "Annet kurs eller bevis" },
];
export const kursNavn = (type: string) => KURS.find((k) => k.id === type)?.navn ?? "Annet kurs eller bevis";

export type KStatus = "gyldig" | "snart" | "utlopt";
export const VARSEL_DAGER = 60;

/** Gyldig (eller uten utløp), utløper innen 60 dager, eller utløpt */
export function kStatus(k: Pick<Kompetanse, "gyldig_til">, idag: string): KStatus {
  if (!k.gyldig_til) return "gyldig";
  if (k.gyldig_til < idag) return "utlopt";
  const dager = (Date.parse(k.gyldig_til) - Date.parse(idag)) / 86400000;
  return dager <= VARSEL_DAGER ? "snart" : "gyldig";
}
export const STATUS_TEKST: Record<KStatus, string> = { gyldig: "Gyldig", snart: "Går ut snart", utlopt: "Utløpt" };

/** Beste bevis per ansatt og type (det som varer lengst), for oversikten */
export function besteBevis(liste: Kompetanse[]): Map<string, Kompetanse> {
  const m = new Map<string, Kompetanse>();
  for (const k of liste) {
    const n = `${k.ansatt_id}|${k.type}`;
    const f = m.get(n);
    if (!f || (f.gyldig_til && (!k.gyldig_til || k.gyldig_til > f.gyldig_til))) m.set(n, k);
  }
  return m;
}

/** Bevis som er utløpt eller går ut snart (bare det beste per ansatt og type teller) */
export function trengerFornyelse(liste: Kompetanse[], idag: string): Kompetanse[] {
  return [...besteBevis(liste).values()].filter((k) => kStatus(k, idag) !== "gyldig")
    .sort((a, b) => (a.gyldig_til ?? "").localeCompare(b.gyldig_til ?? ""));
}

// ------------------------------------------------------------ Lesing av kursbevis (tekst fra OCR/PDF)

export interface Funn {
  type?: string; navn?: string; tittel?: string; utsteder?: string; utstedt?: string; gyldig_til?: string;
  /** Teksten utløpsdatoen ble funnet i, så brukeren kan sjekke */
  bevis?: string;
  /** Beviset nevner ingen utløpsdato eller varighet */
  ingenUtlop?: boolean;
}

const MND_NAVN: Record<string, number> = {
  jan: 1, januar: 1, january: 1, stycznia: 1, styczeń: 1, feb: 2, februar: 2, february: 2, lutego: 2, mar: 3, mars: 3, march: 3, marca: 3,
  apr: 4, april: 4, kwietnia: 4, mai: 5, may: 5, maja: 5, jun: 6, juni: 6, june: 6, czerwca: 6, jul: 7, juli: 7, july: 7, lipca: 7,
  aug: 8, august: 8, sierpnia: 8, sep: 9, sept: 9, september: 9, września: 9, okt: 10, oktober: 10, oct: 10, october: 10, października: 10,
  nov: 11, november: 11, listopada: 11, des: 12, desember: 12, dec: 12, december: 12, grudnia: 12,
};
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (y < 1960 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt.toISOString().slice(0, 10) : null;
};

/** Alle datoer i teksten med posisjon: 12.03.2024, 12/3-24, 2024-03-12, 12. mars 2024, March 12, 2024 */
export function finnDatoer(tekst: string): { dato: string; pos: number }[] {
  const ut: { dato: string; pos: number }[] = [];
  const legg = (d: string | null, pos: number) => { if (d && !ut.some((x) => x.pos === pos)) ut.push({ dato: d, pos }); };
  for (const m of tekst.matchAll(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/g)) legg(iso(+m[1], +m[2], +m[3]), m.index!);
  for (const m of tekst.matchAll(/\b(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})\b/g)) legg(iso(+m[3], +m[2], +m[1]), m.index!);
  for (const m of tekst.matchAll(/\b(\d{1,2})\.?\s+([a-zæøåśźżńółęąć]{3,12})\.?,?\s+(\d{4})\b/gi)) {
    const mnd = MND_NAVN[m[2].toLowerCase()]; if (mnd) legg(iso(+m[3], mnd, +m[1]), m.index!);
  }
  for (const m of tekst.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
    const mnd = MND_NAVN[m[1].toLowerCase()]; if (mnd) legg(iso(+m[3], mnd, +m[2]), m.index!);
  }
  return ut.sort((a, b) => a.pos - b.pos);
}

const UTLOP = /(gyldig\s*(til|t\.?\s?o\.?\s?m\.?|tom|frem\s*til|fram\s*til)|utl(ø|o)p(s?dato|er)?|g(å|a)r\s*ut|fornyes|valid\s*(until|to|thru|through)|expir(y|es|ation)|ważn(y|ość)\s*do|data\s*ważności)/i;
const UTSTEDT = /(utstedt|kursdato|gjennomf(ø|o)rt|best(å|a)tt|dato\s*:|date\s*(of\s*issue)?|issued|data\s*(wydania|ukończenia)|tatt)/i;
const KURS_ORD: [string, RegExp][] = [
  ["stillas", /stillas|scaffold|rusztowa/i],
  ["hoyde", /h(ø|o)yde|fallsikr|fall\s*protect|wysoko/i],
  ["lift", /personl(ø|o)fter|\blift\b|mewp|podno(ś|s)nik/i],
  ["truck", /truck|forklift|w(ó|o)zek/i],
  ["kran", /kran|anhuk|crane|d(ź|z)wig|hakow/i],
  ["varme", /varme\s*arbeid|hot\s*work|prace\s*po(ż|z)arowo/i],
  ["forstehjelp", /f(ø|o)rstehjelp|first\s*aid|pierwsz(a|ej)\s*pomoc/i],
  ["hms", /hms[-\s]?kort|byggekort/i],
  ["sikkerhet", /hms|sikkerhet|fareblind|farlige\s*m(ø|o)nstre|risikovurdering|bhp|safety/i],
  ["asbest", /asbest/i],
  ["varsling", /arbeidsvarsling/i],
  ["fagbrev", /fagbrev|svennebrev|mesterbrev/i],
  ["forerkort", /f(ø|o)rerkort|driving\s*licen|prawo\s*jazdy/i],
  ["verktoy", /motorsag|spikerpistol|verkt(ø|o)y|maskin/i],
];
const KURSHOLDERE = /(AKA|Fagopplæring|Arbeidsmiljøsenteret|Norsk\s*Folkehjelp|Røde\s*Kors|Norsk\s*Brannvernforening|Brannvernforeningen|Stillasopplæring|HMS\s*Partner|Kompetansesenter[\w ]*|Opplæringskontor[\w ]*|Statens\s*vegvesen|Forum\s*Stillas|Peri|Haki|Layher|Ramirent|Cramo|Byggmakker|Byggfag|Nordisk\s*Stillas[\w ]*)/i;

/** Leser kurstype, kursholder, dato og utløp ut av teksten på et kursbevis. Gir bare det den finner – brukeren bekrefter. */
export function lesBevis(tekst: string): Funn {
  const t = tekst.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const f: Funn = {};
  const treff = KURS_ORD.map(([id, rx]) => [id, (t.match(new RegExp(rx.source, "gi")) ?? []).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (treff[0]) f.type = treff[0][0];
  const kh = t.match(KURSHOLDERE);
  if (kh) f.utsteder = kh[1].trim();
  else {
    // Første firmanavn med AS/ASA/SA/ANS i teksten (ikke vårt eget)
    const firma = t.split("\n").map((l) => l.trim()).find((l) => /^[A-ZÆØÅ0-9][\wÆØÅæøå&.\- ]{1,40}\s(AS|ASA|SA|ANS)$/i.test(l) && !/austnes/i.test(l));
    if (firma) f.utsteder = firma.replace(/\s+(AS|ASA|SA|ANS)$/i, (m) => m.toUpperCase());
  }
  // Kurstittel: linjen etter deltakerens navn på diplomer («DIPLOM / DELTAKER / navn / tittel»), ellers linjen etter «Kurs:»
  const linjer = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const iDelt = linjer.findIndex((l) => /^(deltaker|participant|uczestnik|navn|name)\b:?$/i.test(l));
  const tittel = iDelt >= 0 ? linjer.slice(iDelt + 2).find((l) => !/^(gjennomført|beskrivelse|dato)/i.test(l) && /[a-zæøå]/i.test(l) && !/^[A-Za-z]{1,10}-?\d[\w-]*$/.test(l) && !finnDatoer(l).length)
    : t.match(/\b(kurs|course|kurs\s*nazwa)\s*:\s*(.+)/i)?.[2]?.trim();
  if (tittel && tittel.length <= 80) f.tittel = tittel.replace(/\s+i$/, "");
  const klasse = t.match(/\b(klasse|class|kl\.?|kategori)\s*:?\s*([A-Z]{1,2}\d{0,2}(?:\s*(?:,|og|\+|&)\s*[A-Z]{1,2}\d{0,2})*)\b/i);
  if (klasse) f.navn = `Klasse ${klasse[2].replace(/\s+/g, " ")}`;
  else if (f.tittel && (!f.type || ["annet", "sikkerhet", "verktoy"].includes(f.type))) f.navn = f.tittel;
  else { const h = t.match(/\b(\d{1,2}(?:[,.]\d)?)\s*(m|meter)\b/i); if (f.type === "stillas" && h) f.navn = `Inntil ${h[1].replace(".", ",")} m`; }

  const datoer = finnDatoer(t);
  // Utløp: dato rett etter et «gyldig til/utløper»-ord
  for (const m of t.matchAll(new RegExp(UTLOP.source, "gi"))) {
    const d = datoer.find((x) => x.pos >= m.index! && x.pos - m.index! < 60);
    if (d) { f.gyldig_til = d.dato; f.bevis = t.slice(m.index!, Math.min(t.length, d.pos + 12)).replace(/\s+/g, " ").trim(); break; }
  }
  for (const m of t.matchAll(new RegExp(UTSTEDT.source, "gi"))) {
    const d = datoer.find((x) => x.pos >= m.index! && x.pos - m.index! < 60 && x.dato !== f.gyldig_til);
    if (d) { f.utstedt = d.dato; break; }
  }
  if (!f.utstedt) { const andre = datoer.filter((x) => x.dato !== f.gyldig_til).map((x) => x.dato).sort(); if (andre.length) f.utstedt = andre[andre.length - 1]; }
  if (f.utstedt && f.gyldig_til && f.utstedt > f.gyldig_til) f.utstedt = undefined;
  // «Gyldig i 3 år» / «varighet 5 år» → regn ut fra kursdato
  if (!f.gyldig_til) {
    const v = t.match(/(gyldig\s*i|varighet|gyldighet|valid\s*for|ważn\w*\s*przez)\s*:?\s*(\d{1,2})\s*(år|years?|lat)/i);
    if (v && f.utstedt) {
      const d = new Date(f.utstedt + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + Number(v[2]));
      f.gyldig_til = d.toISOString().slice(0, 10); f.bevis = v[0];
    } else if (!UTLOP.test(t)) f.ingenUtlop = true;
  }
  return f;
}
