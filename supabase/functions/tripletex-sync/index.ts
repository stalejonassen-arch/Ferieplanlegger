// Kobling mellom ByggLogg og Tripletex, per bedrift som har lagt inn en ansattnøkkel.
// Henter kunder, prosjekter og ansatte fra Tripletex, og sender godkjente timer tilbake som timeføringer.
// Kalles av pg_cron hvert kvarter (uten innlogging: alle koblede bedrifter), eller av en leder i appen
// (med innlogging: bare lederens egen bedrift, for «Hent nå»). Publiseres uten JWT-sjekk.
// Leder kan også sende månedens lønnsgrunnlag ({ handling: "lonn" }) og hente lønnsartene ({ handling: "lonnsarter" }).
// Hemmeligheter: TRIPLETEX_CONSUMER_TOKEN (ByggLogg sin applikasjonsnøkkel fra Tripletex),
// TRIPLETEX_URL (valgfri, standard https://tripletex.no/v2, testmiljø https://api-test.tripletex.tech/v2).
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  finnLonnsart, koblAnsatte, lonnPlan, plan, sisteDag, samleTimer, tilKunde, tilProsjekt, txFeil, velgAktivitet,
  type LonnLinje, type TxAnsatt, type TxKunde, type TxProsjekt,
} from "./logikk.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = (Deno.env.get("TRIPLETEX_URL") ?? "https://tripletex.no/v2").replace(/\/$/, "");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };

class TxFeil extends Error {}

/** En innlogget økt hos Tripletex for én bedrift */
async function okt(ansattnokkel: string) {
  const consumer = Deno.env.get("TRIPLETEX_CONSUMER_TOKEN");
  if (!consumer) throw new TxFeil("TRIPLETEX_CONSUMER_TOKEN mangler på serveren.");
  const utloper = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
  const q = new URLSearchParams({ consumerToken: consumer, employeeToken: ansattnokkel, expirationDate: utloper });
  const res = await fetch(`${BASE}/token/session/:create?${q}`, { method: "PUT" });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new TxFeil(txFeil(res.status, j));
  const auth = "Basic " + btoa(`0:${j.value.token}`);

  async function kall<T>(metode: string, sti: string, body?: unknown): Promise<T> {
    for (let forsok = 0; ; forsok++) {
      const r = await fetch(`${BASE}${sti}`, {
        method: metode, headers: { Authorization: auth, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.status === 429 && forsok < 3) { await new Promise((ok) => setTimeout(ok, 1500 * (forsok + 1))); continue; }
      const b = r.status === 204 ? null : await r.json().catch(() => null);
      if (!r.ok) throw new TxFeil(txFeil(r.status, b));
      return b as T;
    }
  }
  /** Alle rader fra en liste, side for side */
  async function alle<T>(sti: string, felt: string): Promise<T[]> {
    const ut: T[] = [];
    for (let fra = 0; fra < 100000; fra += 1000) {
      const sep = sti.includes("?") ? "&" : "?";
      const s = await kall<{ fullResultSize: number; values: T[] }>("GET", `${sti}${sep}from=${fra}&count=1000&fields=${encodeURIComponent(felt)}`);
      ut.push(...s.values);
      if (s.values.length < 1000) break;
    }
    return ut;
  }
  return { kall, alle };
}

type Okt = Awaited<ReturnType<typeof okt>>;
interface Bedrift { id: number; tripletex_aktivitet_id: number | null; tripletex_send_timer: boolean }

async function hent(tx: Okt, b: Bedrift) {
  const naa = new Date().toISOString();
  const idag = naa.slice(0, 10);

  // Kunder
  const kunder = await tx.alle<TxKunde>("/customer",
    "id,name,customerNumber,email,phoneNumber,phoneNumberMobile,isInactive,postalAddress(addressLine1,postalCode,city),physicalAddress(addressLine1,postalCode,city)");
  const kRader = kunder.map((k) => tilKunde(k, b.id, naa));
  for (let i = 0; i < kRader.length; i += 500) {
    const { error } = await sb.from("kunder").upsert(kRader.slice(i, i + 500), { onConflict: "bedrift_id,tripletex_id" });
    if (error) throw new Error(`Kunder: ${error.message}`);
  }
  const { data: km } = await sb.from("kunder").select("id, tripletex_id").eq("bedrift_id", b.id).not("tripletex_id", "is", null);
  const kundeId = new Map((km ?? []).map((k) => [Number(k.tripletex_id), k.id as string]));

  // Prosjekter. Adresse som er rettet i appen (adresse_manuell) beholdes.
  const prosjekter = await tx.alle<TxProsjekt>("/project",
    "id,number,name,customer(id),startDate,endDate,isClosed,deliveryAddress(addressLine1,postalCode,city)");
  const { data: manuelle } = await sb.from("prosjekter").select("tripletex_id").eq("bedrift_id", b.id).eq("adresse_manuell", true).not("tripletex_id", "is", null)
    .then((r) => r, () => ({ data: [] as { tripletex_id: number }[] }));
  const behold = new Set((manuelle ?? []).map((p) => Number(p.tripletex_id)));
  const pRader = prosjekter.map((p) => {
    const r: Record<string, unknown> = tilProsjekt(p, b.id, kundeId, naa, idag);
    if (behold.has(p.id) || !r.adresse) delete r.adresse;
    return r;
  });
  for (let i = 0; i < pRader.length; i += 500) {
    const { error } = await sb.from("prosjekter").upsert(pRader.slice(i, i + 500), { onConflict: "bedrift_id,tripletex_id" });
    if (error) throw new Error(`Prosjekter: ${error.message}`);
  }

  // Ansatte kobles på e-post eller ansattnummer (ByggLogg oppretter ikke brukere selv)
  const txAnsatte = await tx.alle<TxAnsatt>("/employee", "id,firstName,lastName,email,employeeNumber");
  const { data: egne } = await sb.from("ansatte").select("id, epost, ansattnr, tripletex_id").eq("bedrift_id", b.id);
  const endr = koblAnsatte(egne ?? [], txAnsatte);
  for (const e of endr) await sb.from("ansatte").update({ tripletex_id: e.tripletex_id }).eq("id", e.id);

  return { kunder: kRader.length, prosjekter: pRader.length, ansatte_koblet: endr.length, ansatte_i_tripletex: txAnsatte.length };
}

/** Sender godkjente timer de siste 62 dagene. Endrede dager oppdateres, nye legges til. */
async function sendTimer(tx: Okt, b: Bedrift) {
  if (!b.tripletex_send_timer) return { sendt: 0, oppdatert: 0, hoppet_over: 0 };
  const fra = new Date(Date.now() - 62 * 86400e3).toISOString().slice(0, 10);
  const { data: rader, error } = await sb.from("timer")
    .select("ansatt_id, prosjekt_id, dato, timer, beskrivelse, ansatte!inner(tripletex_id), prosjekter!inner(tripletex_id)")
    .eq("bedrift_id", b.id).eq("status", "godkjent").gte("dato", fra)
    .not("ansatte.tripletex_id", "is", null).not("prosjekter.tripletex_id", "is", null);
  if (error) throw new Error(`Timer: ${error.message}`);
  const txAnsatt = new Map<string, number>(), txProsjekt = new Map<string, number>();
  for (const r of (rader ?? []) as unknown as { ansatt_id: string; prosjekt_id: string; ansatte: { tripletex_id: number }; prosjekter: { tripletex_id: number } }[]) {
    txAnsatt.set(r.ansatt_id, Number(r.ansatte.tripletex_id));
    txProsjekt.set(r.prosjekt_id, Number(r.prosjekter.tripletex_id));
  }
  const samlet = samleTimer((rader ?? []) as unknown as Parameters<typeof samleTimer>[0]);
  const { data: tidligere } = await sb.from("tripletex_timer").select("ansatt_id, prosjekt_id, dato, tripletex_id, timer").eq("bedrift_id", b.id).gte("dato", fra);
  const sendt = new Map((tidligere ?? []).map((t) => [`${t.ansatt_id}|${t.prosjekt_id}|${t.dato}`, { tripletex_id: Number(t.tripletex_id), timer: Number(t.timer) }]));
  const { nye, endret } = plan(samlet, sendt);

  // Aktivitet per prosjekt (Tripletex krever en aktivitet på hver timeføring)
  const aktivitet = new Map<number, number | null>();
  async function aktivitetFor(prosjekt: number, ansatt: number, dato: string) {
    if (!aktivitet.has(prosjekt)) {
      const a = await tx.kall<{ values: { id: number; name: string }[] }>("GET",
        `/activity/>forTimeSheet?projectId=${prosjekt}&employeeId=${ansatt}&date=${dato}&fields=id,name&count=100`);
      aktivitet.set(prosjekt, velgAktivitet(a.values, b.tripletex_aktivitet_id));
    }
    return aktivitet.get(prosjekt)!;
  }

  let ok = 0, opp = 0, hopp = 0;
  const feil: string[] = [];
  for (const x of nye) {
    const ansatt = txAnsatt.get(x.ansatt_id)!, prosjekt = txProsjekt.get(x.prosjekt_id)!;
    try {
      const akt = await aktivitetFor(prosjekt, ansatt, x.dato);
      if (!akt) { hopp++; continue; }
      const r = await tx.kall<{ value: { id: number } }>("POST", "/timesheet/entry", {
        employee: { id: ansatt }, project: { id: prosjekt }, activity: { id: akt }, date: x.dato, hours: x.timer, comment: x.kommentar,
      });
      await sb.from("tripletex_timer").upsert({ ansatt_id: x.ansatt_id, prosjekt_id: x.prosjekt_id, dato: x.dato, bedrift_id: b.id, tripletex_id: r.value.id, timer: x.timer, sendt: new Date().toISOString() });
      ok++;
    } catch (e) { feil.push(`${x.dato}: ${(e as Error).message}`); }
  }
  for (const x of endret) {
    try {
      const g = await tx.kall<{ value: { id: number; version: number } }>("GET", `/timesheet/entry/${x.tripletex_id}?fields=id,version`);
      await tx.kall("PUT", `/timesheet/entry/${x.tripletex_id}`, { id: x.tripletex_id, version: g.value.version, hours: x.timer, comment: x.kommentar });
      await sb.from("tripletex_timer").update({ timer: x.timer, sendt: new Date().toISOString() })
        .eq("ansatt_id", x.ansatt_id).eq("prosjekt_id", x.prosjekt_id).eq("dato", x.dato);
      opp++;
    } catch (e) { feil.push(`${x.dato}: ${(e as Error).message}`); }
  }
  return { sendt: ok, oppdatert: opp, hoppet_over: hopp, feil: feil.slice(0, 5) };
}

async function synkBedrift(b: Bedrift) {
  const { data: t } = await sb.from("tripletex_tilgang").select("ansattnokkel").eq("bedrift_id", b.id).maybeSingle();
  if (!t) return { bedrift: b.id, hoppet_over: "ingen nøkkel" };
  try {
    const tx = await okt(t.ansattnokkel);
    const hentet = await hent(tx, b);
    const timer = await sendTimer(tx, b);
    const status = `Hentet ${hentet.prosjekter} prosjekter og ${hentet.kunder} kunder. ${timer.sendt + timer.oppdatert} timeføringer sendt.` +
      (timer.feil?.length ? ` ${timer.feil.length} feilet.` : "");
    await sb.from("bedrifter").update({ tripletex_sist: new Date().toISOString(), tripletex_status: status }).eq("id", b.id);
    await sb.from("tripletex_logg").insert({ bedrift_id: b.id, ok: !timer.feil?.length, melding: JSON.stringify({ ...hentet, ...timer }) });
    return { bedrift: b.id, ...hentet, ...timer };
  } catch (e) {
    const m = (e as Error).message;
    await sb.from("bedrifter").update({ tripletex_status: m.slice(0, 300) }).eq("id", b.id);
    await sb.from("tripletex_logg").insert({ bedrift_id: b.id, ok: false, melding: m.slice(0, 2000) });
    return { bedrift: b.id, feil: m };
  }
}

const ARTNAVN: Record<string, string> = {
  normal: "Normaltid", ot50: "Overtid 50 %", ot100: "Overtid 100 %", km: "Kjøring", reisetid: "Reisetid",
  ferie: "Ferie", egenmelding: "Egenmelding", sykmelding: "Sykmelding", syktBarn: "Sykt barn",
};

/** Lønnsartene i Tripletex (for å velge riktige nummer i ByggLogg) */
async function lonnsarter(tx: Okt) {
  const typer = await tx.alle<{ id: number; number: string; name: string; showInTimesheet: boolean }>("/salary/type?isInactive=false", "id,number,name,showInTimesheet");
  return typer.sort((a, b) => String(a.number).localeCompare(String(b.number), "nb", { numeric: true }));
}

/** Sender månedens lønnslinjer til timelisten i Tripletex. Sendes måneden på nytt, oppdateres eller fjernes linjene. */
async function sendLonn(tx: Okt, bedriftId: number, mnd: string, linjer: LonnLinje[]) {
  const { data: ansatte } = await sb.from("ansatte").select("id, navn, tripletex_id").eq("bedrift_id", bedriftId);
  const ans = new Map((ansatte ?? []).map((a) => [a.id as string, a as { id: string; navn: string; tripletex_id: number | null }]));
  const ikkeKoblet = new Set<string>();
  const gyldige = linjer.filter((l) => {
    const a = ans.get(l.ansatt_id);
    if (!a) return false;
    if (!a.tripletex_id) { ikkeKoblet.add(a.navn); return false; }
    return true;
  });
  const { data: tidligere } = await sb.from("tripletex_lonn").select("ansatt_id, art, tripletex_id, antall").eq("bedrift_id", bedriftId).eq("mnd", mnd);
  const { nye, endret, slett } = lonnPlan(gyldige, (tidligere ?? []).map((t) => ({ ...t, tripletex_id: Number(t.tripletex_id), antall: Number(t.antall) })));

  const typer = await lonnsarter(tx);
  const dato = sisteDag(mnd);
  const feil: string[] = [];
  const ukjente = new Set<string>();
  let ok = 0, opp = 0, fjernet = 0;
  const tekst = (l: LonnLinje) => `ByggLogg ${mnd}: ${ARTNAVN[l.art] ?? l.art}`;

  for (const l of nye) {
    const type = finnLonnsart(typer, l.kode);
    if (!type) { ukjente.add(l.kode); continue; }
    try {
      const r = await tx.kall<{ value: { id: number } }>("POST", "/timesheet/salaryTypeSpecification", {
        employee: { id: Number(ans.get(l.ansatt_id)!.tripletex_id) }, salaryType: { id: type }, date: dato, count: l.antall, description: tekst(l),
      });
      await sb.from("tripletex_lonn").upsert({ ansatt_id: l.ansatt_id, mnd, art: l.art, bedrift_id: bedriftId, tripletex_id: r.value.id, antall: l.antall, sendt: new Date().toISOString() });
      ok++;
    } catch (e) { feil.push(`${ans.get(l.ansatt_id)!.navn}, ${ARTNAVN[l.art]}: ${(e as Error).message}`); }
  }
  for (const l of endret) {
    const type = finnLonnsart(typer, l.kode);
    if (!type) { ukjente.add(l.kode); continue; }
    try {
      const g = await tx.kall<{ value: { id: number; version: number } }>("GET", `/timesheet/salaryTypeSpecification/${l.tripletex_id}?fields=id,version`);
      await tx.kall("PUT", `/timesheet/salaryTypeSpecification/${l.tripletex_id}`, {
        id: l.tripletex_id, version: g.value.version, salaryType: { id: type }, count: l.antall, description: tekst(l),
      });
      await sb.from("tripletex_lonn").update({ antall: l.antall, sendt: new Date().toISOString() }).eq("ansatt_id", l.ansatt_id).eq("mnd", mnd).eq("art", l.art);
      opp++;
    } catch (e) { feil.push(`${ans.get(l.ansatt_id)!.navn}, ${ARTNAVN[l.art]}: ${(e as Error).message}`); }
  }
  for (const l of slett) {
    try {
      await tx.kall("DELETE", `/timesheet/salaryTypeSpecification/${l.tripletex_id}`).catch((e) => { if (!/ 404/.test((e as Error).message)) throw e; });
      await sb.from("tripletex_lonn").delete().eq("ansatt_id", l.ansatt_id).eq("mnd", mnd).eq("art", l.art);
      fjernet++;
    } catch (e) { feil.push(`${ans.get(l.ansatt_id)?.navn ?? "Ansatt"}, ${ARTNAVN[l.art]}: ${(e as Error).message}`); }
  }
  const resultat = { mnd, sendt: ok, oppdatert: opp, fjernet, ikke_koblet: [...ikkeKoblet], ukjente_lonnsarter: [...ukjente], feil: feil.slice(0, 10) };
  await sb.from("tripletex_logg").insert({ bedrift_id: bedriftId, ok: !feil.length && !ukjente.size, melding: JSON.stringify({ lonn: resultat }) });
  return resultat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  // Leder i appen: bare egen bedrift. Ellers (cron): alle koblede bedrifter.
  let bare: number | null = null;
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (jwt && jwt !== Deno.env.get("SUPABASE_ANON_KEY")) {
    const { data: u } = await sb.auth.getUser(jwt);
    const epost = u.user?.email?.toLowerCase();
    if (!epost) return new Response("ikke innlogget", { status: 401, headers: CORS });
    const { data: a } = await sb.from("ansatte").select("bedrift_id, rolle, aktiv").ilike("epost", epost).maybeSingle();
    if (!a?.aktiv || a.rolle !== "leder") return new Response("bare leder", { status: 403, headers: CORS });
    bare = a.bedrift_id;
  }
  const body = await req.json().catch(() => ({})) as { handling?: string; mnd?: string; linjer?: LonnLinje[] };
  if (body.handling === "lonn" || body.handling === "lonnsarter") {
    if (!bare) return new Response("bare leder", { status: 403, headers: CORS });
    const { data: t } = await sb.from("tripletex_tilgang").select("ansattnokkel").eq("bedrift_id", bare).maybeSingle();
    if (!t) return Response.json({ feil: "Tripletex er ikke koblet til." }, { status: 400, headers: CORS });
    try {
      const tx = await okt(t.ansattnokkel);
      if (body.handling === "lonnsarter") return Response.json(await lonnsarter(tx), { headers: CORS });
      if (!/^\d{4}-\d{2}$/.test(body.mnd ?? "") || !Array.isArray(body.linjer) || body.linjer.length > 5000) {
        return Response.json({ feil: "Ugyldig lønnsgrunnlag." }, { status: 400, headers: CORS });
      }
      return Response.json(await sendLonn(tx, bare, body.mnd!, body.linjer), { headers: CORS });
    } catch (e) {
      return Response.json({ feil: (e as Error).message }, { status: 502, headers: CORS });
    }
  }
  let q = sb.from("bedrifter").select("id, tripletex_aktivitet_id, tripletex_send_timer").eq("tripletex_aktiv", true).eq("aktiv", true);
  if (bare) q = q.eq("id", bare);
  const { data: bedrifter } = await q;
  const ut = [];
  for (const b of (bedrifter ?? []) as Bedrift[]) ut.push(await synkBedrift(b));
  return Response.json(ut, { headers: CORS });
});
