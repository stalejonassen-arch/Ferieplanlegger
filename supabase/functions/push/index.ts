// Push-varsler for ByggLogg (Web Push), også når appen er lukket.
// Kalles fra databasen (pg_net) med { type: "melding" | "prosjekt" | "oppgave", id } når noe nytt legges inn,
// og med { type: "stemplet", id: ansatt } når noen har vært stemplet inn lenge (sjekkes hvert 5. minutt).
// Funksjonen stoler ikke på innholdet i kallet: den leser meldingen/prosjektet selv, finner mottakerne,
// og logger hvert varsel slik at det aldri går ut to ganger. Publiseres uten JWT-sjekk.
// VAPID-nøklene ligger i tabellen push_noekler (bare tjenestenøkkelen kan lese den).
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kort = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type Ansatt = { id: string; navn: string; sprak: string | null };
type Varsel = { tittel: string; tekst: string; url: string; tag: string };

async function send(mottakere: Ansatt[], lag: (a: Ansatt) => Varsel) {
  if (!mottakere.length) return { sendt: 0, fjernet: 0 };
  const { data: abo } = await sb.from("push_abonnement").select("endpoint, ansatt_id, p256dh, auth").in("ansatt_id", mottakere.map((a) => a.id));
  let sendt = 0, fjernet = 0;
  await Promise.all((abo ?? []).map(async (s) => {
    const a = mottakere.find((x) => x.id === s.ansatt_id)!;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(lag(a)), { TTL: 60 * 60 * 24, urgency: "high" });
      sendt++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // Abonnementet finnes ikke lenger (appen avinstallert, varsler slått av)
      if (status === 404 || status === 410) { await sb.from("push_abonnement").delete().eq("endpoint", s.endpoint); fjernet++; }
    }
  }));
  return { sendt, fjernet };
}

const hm = (t: string) => t.slice(0, 5);
const varighet = (min: number) => `${Math.floor(min / 60)} t${min % 60 ? ` ${min % 60} min` : ""}`;
const varighetPl = (min: number) => `${Math.floor(min / 60)} godz.${min % 60 ? ` ${min % 60} min` : ""}`;

/** Fortsatt stemplet inn etter grensen: databasen sjekker selv, så kallet kan ikke brukes til å sende falske varsler */
async function stemplet(ansattId: string) {
  const { data: rader } = await sb.rpc("stemplet_lenge");
  const r = (rader as { ansatt_id: string; dato: string; start: string; minutter: number }[] | null)?.find((x) => x.ansatt_id === ansattId);
  if (!r) return new Response("ikke aktuelt");
  // Én gang per ansatt per dag
  const { error: finnes } = await sb.from("push_logg").insert({ type: `stemplet:${r.dato}`, id: ansattId });
  if (finnes) return new Response("allerede sendt");
  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);
  const { data: a } = await sb.from("ansatte").select("id, navn, sprak").eq("id", ansattId).maybeSingle();
  if (!a) return new Response("finnes ikke", { status: 404 });
  const res = await send([a], (x) => x.sprak === "pl"
    ? { tittel: "Nadal zalogowany?", tekst: `Jesteś zalogowany od ${hm(r.start)} (${varighetPl(r.minutter)}). Pamiętaj, aby się wylogować, gdy kończysz pracę.`, url: "/#timer", tag: "stemplet" }
    : { tittel: "Fortsatt stemplet inn?", tekst: `Du har vært stemplet inn siden ${hm(r.start)} (${varighet(r.minutter)}). Husk å stemple ut når du går for dagen.`, url: "/#timer", tag: "stemplet" });
  return Response.json(res);
}

const MND = ["jan.", "feb.", "mar.", "apr.", "mai", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "des."];
const dato = (iso: string) => `${Number(iso.slice(8, 10))}. ${MND[Number(iso.slice(5, 7)) - 1]}`;

/** Nytt arbeid i planen: varsle dem som har fått oppgaven og ikke er varslet om den før (ikke den som la den inn) */
async function oppgave(id: string) {
  const { data: o } = await sb.from("oppgaver").select("id, bedrift_id, prosjekt_id, tittel, fra, til, ansatte, status, opprettet_av").eq("id", id).maybeSingle();
  if (!o) return new Response("finnes ikke", { status: 404 });
  if (o.status === "ferdig") return new Response("ferdig, hoppet over");
  const nye: string[] = [];
  for (const a of (o.ansatte ?? []) as string[]) {
    if (a === o.opprettet_av) continue;
    const { error } = await sb.from("push_logg").insert({ type: `oppgave:${a}`, id: o.id });
    if (!error) nye.push(a);
  }
  if (!nye.length) return new Response("ingen nye");
  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);
  const { data: mottakere } = await sb.from("ansatte").select("id, navn, sprak").in("id", nye).eq("bedrift_id", o.bedrift_id).eq("aktiv", true);
  const { data: p } = await sb.from("prosjekter").select("navn, adresse").eq("id", o.prosjekt_id).maybeSingle();
  const naar = o.fra === o.til ? dato(o.fra) : `${dato(o.fra)} – ${dato(o.til)}`;
  const r = await send(mottakere ?? [], (a) => ({
    tittel: a.sprak === "pl" ? `Nowa praca: ${kort(o.tittel, 60)}` : `Nytt arbeid: ${kort(o.tittel, 60)}`,
    tekst: [p?.navn, naar, p?.adresse].filter(Boolean).join(" · "),
    url: "/#plan", tag: `oppgave-${o.id}`,
  }));
  return Response.json(r);
}

/** Personlig månedsrapport publisert: varsle bare den ansatte rapporten gjelder */
async function personrapport(id: string) {
  const { data: r } = await sb.from("personrapporter").select("id, bedrift_id, ansatt_id, periode, publisert").eq("id", id).maybeSingle();
  if (!r || !r.publisert) return new Response("finnes ikke / ikke publisert", { status: 404 });
  const { error: finnes } = await sb.from("push_logg").insert({ type: "personrapport", id: r.id });
  if (finnes) return new Response("allerede sendt");
  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);
  const { data: mottakere } = await sb.from("ansatte").select("id, navn, sprak").eq("id", r.ansatt_id).eq("bedrift_id", r.bedrift_id).eq("aktiv", true);
  const MNDNAVN = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  const MNDPL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
  const m = Number(String(r.periode).slice(5, 7)) - 1;
  const res = await send(mottakere ?? [], (a) => a.sprak === "pl"
    ? { tittel: "Twój raport miesięczny", tekst: `Raport za ${MNDPL[m]} jest gotowy.`, url: "/#rapporter", tag: `personrapport-${r.id}` }
    : { tittel: "Din månedsrapport", tekst: `Rapporten for ${MNDNAVN[m]} er klar.`, url: "/#rapporter", tag: `personrapport-${r.id}` });
  return Response.json(res);
}

/** Bestilling fra byggeplassen: ny → butikk/prosjektleder; klar, levert eller avvist → den som bestilte */
async function bestilling(id: string) {
  const { data: b } = await sb.from("bestillinger").select("id, bedrift_id, prosjekt_id, bestilt_av, status, linjer, svar, onsket_dato").eq("id", id).maybeSingle();
  if (!b || !["ny", "klar", "levert", "avvist"].includes(b.status)) return new Response("ikke aktuelt");
  const { error: finnes } = await sb.from("push_logg").insert({ type: `bestilling:${b.status}`, id: b.id });
  if (finnes) return new Response("allerede sendt");
  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);
  const { data: p } = await sb.from("prosjekter").select("navn").eq("id", b.prosjekt_id).maybeSingle();
  const { data: alle } = await sb.from("ansatte").select("id, navn, sprak, rolle, prosjektleder").eq("bedrift_id", b.bedrift_id).eq("aktiv", true);
  const linjer = (b.linjer ?? []) as { beskrivelse: string; antall?: number; enhet?: string }[];
  const varer = kort(linjer.map((l) => `${l.antall ? `${l.antall} ${l.enhet ?? ""} `.replace("  ", " ") : ""}${l.beskrivelse}`).join(", "), 150);
  if (b.status === "ny") {
    const bestiller = (alle ?? []).find((a) => a.id === b.bestilt_av)?.navn ?? "Byggeplassen";
    const mottakere = (alle ?? []).filter((a) => (a.rolle === "leder" || a.prosjektleder) && a.id !== b.bestilt_av);
    const r = await send(mottakere, (a) => ({
      tittel: a.sprak === "pl" ? `Nowe zamówienie: ${kort(p?.navn ?? "", 40)}` : `Ny bestilling: ${kort(p?.navn ?? "", 40)}`,
      tekst: `${bestiller}${b.onsket_dato ? ` (til ${dato(b.onsket_dato)})` : ""}: ${varer}`,
      url: "/#plan", tag: `bestilling-${b.id}`,
    }));
    return Response.json(r);
  }
  const meg = (alle ?? []).filter((a) => a.id === b.bestilt_av);
  const tekst: Record<string, [string, string]> = {
    klar: ["Bestillingen er klar", "Zamówienie jest gotowe"],
    levert: ["Bestillingen er levert", "Zamówienie dostarczone"],
    avvist: ["Bestillingen kan ikke leveres", "Zamówienie nie może zostać zrealizowane"],
  };
  const r = await send(meg, (a) => ({
    tittel: tekst[b.status]![a.sprak === "pl" ? 1 : 0],
    tekst: [p?.navn, b.svar || varer].filter(Boolean).join(" · "),
    url: "/#prosjekter", tag: `bestilling-${b.id}`,
  }));
  return Response.json(r);
}

Deno.serve(async (req) => {
  const { type, id } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? "") || !["melding", "prosjekt", "stemplet", "oppgave", "bestilling", "personrapport"].includes(type)) return new Response("ugyldig", { status: 400 });

  if (type === "stemplet") return stemplet(id);
  if (type === "oppgave") return oppgave(id);
  if (type === "bestilling") return bestilling(id);
  if (type === "personrapport") return personrapport(id);

  // Bare én gang per melding/prosjekt
  const { error: finnes } = await sb.from("push_logg").insert({ type, id });
  if (finnes) return new Response("allerede sendt");

  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);

  if (type === "melding") {
    const { data: m } = await sb.from("meldinger").select("id, bedrift_id, ansatt_id, kanal, tekst, bilde_sti").eq("id", id).maybeSingle();
    if (!m) return new Response("finnes ikke", { status: 404 });
    const { data: alle } = await sb.from("ansatte").select("id, navn, sprak").eq("bedrift_id", m.bedrift_id).eq("aktiv", true);
    const avsender = (alle ?? []).find((a) => a.id === m.ansatt_id)?.navn ?? "ByggLogg";
    let mottakere = (alle ?? []).filter((a) => a.id !== m.ansatt_id);
    let hvor = "";
    if (m.kanal.startsWith("dm:")) {
      const [, x, y] = m.kanal.split(":");
      mottakere = mottakere.filter((a) => a.id === x || a.id === y);
    } else if (m.kanal.startsWith("p:")) {
      const { data: p } = await sb.from("prosjekter").select("navn").eq("id", m.kanal.slice(2)).maybeSingle();
      hvor = p?.navn ?? "Prosjekt";
    } else hvor = "Felles";
    const r = await send(mottakere, (a) => ({
      tittel: hvor ? `${avsender} · ${kort(hvor, 40)}` : avsender,
      tekst: m.tekst ? kort(m.tekst, 180) : (a.sprak === "pl" ? "📷 Zdjęcie" : "📷 Bilde"),
      url: "/#chat", tag: m.kanal,
    }));
    return Response.json(r);
  }

  // Nytt prosjekt
  const { data: p } = await sb.from("prosjekter").select("id, bedrift_id, navn, adresse, aktiv, fra_svenn, visma_nr").eq("id", id).maybeSingle();
  if (!p) return new Response("finnes ikke", { status: 404 });
  // Ikke varsle om import fra Svenn, avsluttede prosjekter eller utstyrskontoer
  if (p.fra_svenn || !p.aktiv || /utstyr|arbeidskl|arbeidst/i.test(p.navn)) return new Response("hoppet over");
  // Mange nye på en gang (masseimport): varsle ikke om hvert enkelt
  const { count } = await sb.from("push_logg").select("id", { count: "exact", head: true }).eq("type", "prosjekt").gte("sendt", new Date(Date.now() - 5 * 60e3).toISOString());
  if ((count ?? 0) > 5) return new Response("masseimport, hoppet over");
  const { data: alle } = await sb.from("ansatte").select("id, navn, sprak").eq("bedrift_id", p.bedrift_id).eq("aktiv", true).eq("varsel_prosjekt", true);
  const r = await send(alle ?? [], (a) => ({
    tittel: a.sprak === "pl" ? "Nowy projekt" : "Nytt prosjekt",
    tekst: [p.visma_nr ? `${p.visma_nr} ${p.navn}` : p.navn, p.adresse].filter(Boolean).join(" – "),
    url: "/#prosjekter", tag: `prosjekt-${p.id}`,
  }));
  return Response.json(r);
});
