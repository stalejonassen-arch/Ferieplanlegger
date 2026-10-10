// Fakturerte timer fra Visma: ordrelinjer med produktet «Arbeid» (salgsordrer, ikke tilbud).
import type { Data } from "./ferie";

export interface FakturertTime {
  visma_ordrenr: number; linjenr: number; ordredato: string | null; fakturadato: string | null; fakturanr: string;
  kunde_id: string | null; prosjekt_id: string | null; antall: number; fakturert: number; ikke_fakturert: number; pris: number;
}

/** Ordre på et prosjekt (fra Visma) */
export interface ProsjektOrdreKort { prosjekt_id: string; kunde_nr: number | null; transaksjonstype: number; ordretype: number; fakturert: number; kostnad: number; ordredato: string | null; ferdig: string | null }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Fakturerte timer per måned (etter fakturadato) */
export function fakturertVismaPerMnd(f: FakturertTime[], aar: number) {
  const ut = Array(12).fill(0) as number[];
  for (const x of f) if (x.fakturadato?.startsWith(`${aar}-`)) ut[Number(x.fakturadato.slice(5, 7)) - 1] += x.fakturert;
  return ut.map(r1);
}

/** Timer som ligger på åpne ordrer, men ikke er fakturert ennå */
export const ikkeFakturert = (f: FakturertTime[]) => r1(f.reduce((n, x) => n + Math.max(0, x.ikke_fakturert), 0));

/** Fastprisprosjekter (beregnes), men ikke de som er merket ferdig fakturert */
export const fastprisIder = (d: Data) => new Set(d.prosjekter.filter((p) => p.fastpris && !p.fakturert_full).map((p) => p.id));
/** Prosjekter merket ferdig fakturert: alle fakturerbare timer teller som fakturert */
export const fullIder = (d: Data) => new Set(d.prosjekter.filter((p) => p.fakturert_full).map((p) => p.id));

/** Arbeid-linjer som ikke tilhører et ferdig fakturert prosjekt (de er alt telt med full pott) */
export function arbeidUtenFull(d: Data) {
  const full = fullIder(d);
  if (!full.size) return d.fakturerteTimer ?? [];
  const kundeAv = new Map(d.prosjekter.map((p) => [p.id, p.faktura_kunde_id ?? p.kunde_id]));
  // Kunder der alle prosjekter med timer er ferdig fakturert: linjer uten prosjekt på dem er også telt
  const harAndre = new Set<string>(), harFull = new Set<string>();
  for (const t of d.timer) { if (!t.prosjekt_id) continue; const k = kundeAv.get(t.prosjekt_id); if (!k) continue; (full.has(t.prosjekt_id) ? harFull : harAndre).add(k); }
  return (d.fakturerteTimer ?? []).filter((x) => x.prosjekt_id ? !full.has(x.prosjekt_id) : !(x.kunde_id && harFull.has(x.kunde_id) && !harAndre.has(x.kunde_id)));
}

/** Fakturerbare timer per måned på ferdig fakturerte prosjekter (etter dato for timene) */
export function fullPerMnd(d: Data, aar: number) {
  const full = fullIder(d), ut = Array(12).fill(0) as number[];
  for (const t of d.timer) if (t.fakturerbar !== false && t.prosjekt_id && full.has(t.prosjekt_id) && t.dato.startsWith(`${aar}-`)) ut[Number(t.dato.slice(5, 7)) - 1] += Number(t.timer);
  return ut.map(r1);
}

/** Registrerte fakturerbare timer i året, uten fastprisprosjekter, og timene på fastpris for seg */
export function registrertUtenFastpris(d: Data, aar: number, tilMnd = 12) {
  const fp = fastprisIder(d);
  let vanlig = 0, fast = 0;
  for (const t of d.timer) {
    if (t.fakturerbar === false || !t.prosjekt_id || !t.dato.startsWith(`${aar}-`) || Number(t.dato.slice(5, 7)) > tilMnd) continue;
    if (fp.has(t.prosjekt_id)) fast += Number(t.timer); else vanlig += Number(t.timer);
  }
  return { vanlig: r1(vanlig), fastpris: r1(fast) };
}

/** Per kunde i året: registrerte fakturerbare timer (ByggLogg), fakturert og ikke fakturert (Visma). Fastpris holdes utenfor. */
export function perKunde(d: Data, aar: number) {
  const fp = fastprisIder(d), full = fullIder(d);
  const f = arbeidUtenFull(d).filter((x) => !x.prosjekt_id || !fp.has(x.prosjekt_id));
  const kundeAv = new Map(d.prosjekter.map((p) => [p.id, p.faktura_kunde_id ?? p.kunde_id]));
  const m = new Map<string, { kunde_id: string | null; navn: string; registrert: number; fakturert: number; aapent: number; kr: number }>();
  const rad = (kid: string | null) => {
    const k = kid ?? "";
    if (!m.has(k)) m.set(k, { kunde_id: kid, navn: d.kunder.find((x) => x.id === kid)?.navn ?? "Uten kunde i Visma", registrert: 0, fakturert: 0, aapent: 0, kr: 0 });
    return m.get(k)!;
  };
  for (const t of d.timer) if (t.fakturerbar !== false && t.prosjekt_id && !fp.has(t.prosjekt_id) && t.dato.startsWith(`${aar}-`)) {
    const k = rad(kundeAv.get(t.prosjekt_id) ?? null); k.registrert += Number(t.timer);
    if (full.has(t.prosjekt_id)) k.fakturert += Number(t.timer);
  }
  for (const x of f) {
    const k = rad(x.kunde_id);
    if (x.fakturadato?.startsWith(`${aar}-`)) { k.fakturert += x.fakturert; k.kr += x.fakturert * x.pris; }
    if (x.ikke_fakturert > 0) k.aapent += x.ikke_fakturert;
  }
  return [...m.values()].map((k) => ({ ...k, registrert: r1(k.registrert), fakturert: r1(k.fakturert), aapent: r1(k.aapent), kr: Math.round(k.kr) }))
    .filter((k) => k.registrert || k.fakturert || k.aapent)
    .sort((a, b) => Math.max(b.registrert, b.fakturert) - Math.max(a.registrert, a.fakturert));
}

/** Timeprisen som brukes for å regne kroner om til timer: satt av leder, ellers snittet på Arbeid i året */
export function timepris(d: Data, aar: number) {
  if (d.timepris) return d.timepris;
  let t = 0, kr = 0;
  for (const x of d.fakturerteTimer ?? []) if (x.fakturadato?.startsWith(`${aar}-`) && x.fakturert > 0) { t += x.fakturert; kr += x.fakturert * x.pris; }
  return t ? Math.round(kr / t) : 0;
}

/**
 * Fastprisprosjekter: arbeidsdelen = fakturert kunden − kostpris på materialene på firmaets egne ordrer
 * (N L med kundeprosjekt) − Arbeid som allerede er telt. Delt på timeprisen gir beregnede timer.
 */
export function fastprisBeregning(d: Data, aar: number | null) {
  const pris = timepris(d, aar ?? new Date().getFullYear()), eget = d.egetKundenr ?? null;
  const iAar = (o: ProsjektOrdreKort) => aar == null || (o.ferdig ?? o.ordredato ?? "").startsWith(`${aar}-`);
  const iAarDato = (x: string | null | undefined) => aar == null ? !!x : !!x?.startsWith(`${aar}-`);
  const mndAv = (o: ProsjektOrdreKort) => Number((o.ferdig ?? o.ordredato ?? "").slice(5, 7)) - 1;
  const reg = new Map<string, number>();
  for (const t of d.timer) if (t.fakturerbar !== false && t.prosjekt_id && iAarDato(t.dato)) reg.set(t.prosjekt_id, (reg.get(t.prosjekt_id) ?? 0) + Number(t.timer));
  const prosjekter = d.prosjekter.filter((p) => p.fastpris && !p.fakturert_full).map((p) => {
    const ordrer = (d.ordrer ?? []).filter((o) => o.prosjekt_id === p.id && o.transaksjonstype === 1 && o.ordretype !== 5 && iAar(o));
    const kunde = ordrer.filter((o) => o.kunde_nr !== eget);
    const salg = kunde.reduce((n, o) => n + o.fakturert, 0);
    const material = ordrer.filter((o) => o.kunde_nr === eget).reduce((n, o) => n + o.kostnad, 0);
    const arbeidLinjer = (d.fakturerteTimer ?? []).filter((x) => x.prosjekt_id === p.id && iAarDato(x.fakturadato)).reduce((n, x) => n + x.fakturert * x.pris, 0);
    const arbeidKr = Math.max(0, salg - material - arbeidLinjer);
    const timer = pris ? arbeidKr / pris : 0;
    // Fordel timene over månedene etter når kunden er fakturert
    const mnd = Array(12).fill(0) as number[];
    for (const o of kunde) if (salg > 0 && mndAv(o) >= 0) mnd[mndAv(o)] += (o.fakturert / salg) * timer;
    return { p, salg: Math.round(salg), material: Math.round(material), arbeidKr: Math.round(arbeidKr), timer: r1(timer), registrert: r1(reg.get(p.id) ?? 0), mnd };
  }).sort((a, b) => b.timer - a.timer);
  const perMnd = Array(12).fill(0) as number[];
  for (const x of prosjekter) x.mnd.forEach((v, i) => (perMnd[i] += v));
  return { pris, prosjekter, perMnd: perMnd.map(r1), timer: r1(prosjekter.reduce((n, x) => n + x.timer, 0)) };
}

/**
 * Timer per prosjekt (alt som er lastet): registrert fakturerbart mot fakturert «Arbeid», Arbeid på åpne ordrer
 * og beregnede fastpristimer. Arbeid-linjer uten prosjekt fordeles på kundens prosjekter etter registrerte timer.
 */
export function prosjektFakturering(d: Data) {
  const reg = new Map<string, number>();
  for (const t of d.timer) if (t.fakturerbar !== false && t.prosjekt_id) reg.set(t.prosjekt_id, (reg.get(t.prosjekt_id) ?? 0) + Number(t.timer));
  const kundeAv = new Map(d.prosjekter.map((p) => [p.id, p.faktura_kunde_id ?? p.kunde_id]));
  const perKundeReg = new Map<string, number>();
  for (const [pid, t] of reg) { const k = kundeAv.get(pid); if (k) perKundeReg.set(k, (perKundeReg.get(k) ?? 0) + t); }
  const ut = new Map<string, { registrert: number; fakturert: number; aapent: number; fastpris: number }>();
  const rad = (pid: string) => { if (!ut.has(pid)) ut.set(pid, { registrert: reg.get(pid) ?? 0, fakturert: 0, aapent: 0, fastpris: 0 }); return ut.get(pid)!; };
  for (const pid of reg.keys()) rad(pid);
  const full = fullIder(d);
  for (const x of arbeidUtenFull(d)) {
    if (x.prosjekt_id) { const r = rad(x.prosjekt_id); r.fakturert += x.fakturert; r.aapent += Math.max(0, x.ikke_fakturert); continue; }
    const tot = x.kunde_id ? perKundeReg.get(x.kunde_id) : 0;
    if (!x.kunde_id || !tot) continue;
    for (const [pid, t] of reg) if (kundeAv.get(pid) === x.kunde_id) { const r = rad(pid); r.fakturert += (x.fakturert * t) / tot; r.aapent += (Math.max(0, x.ikke_fakturert) * t) / tot; }
  }
  for (const f of fastprisBeregning(d, null).prosjekter) rad(f.p.id).fastpris = f.timer;
  for (const pid of full) { const r = rad(pid); r.fakturert = r.registrert; r.aapent = 0; r.fastpris = 0; }
  for (const r of ut.values()) { r.registrert = r1(r.registrert); r.fakturert = r1(r.fakturert); r.aapent = r1(r.aapent); }
  return ut;
}

/** Mange timer, lite fakturert: minst 20 registrerte timer og under halvparten fakturert, på ordre eller beregnet fastpris */
export const liteFakturert = (r: { registrert: number; fakturert: number; aapent: number; fastpris: number }) =>
  r.registrert >= 20 && r.fakturert + r.aapent + r.fastpris < r.registrert * 0.5;
