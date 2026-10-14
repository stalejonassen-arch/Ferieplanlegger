// Push-varsler for ByggLogg (Web Push), også når appen er lukket.
// Kalles fra databasen (pg_net) med { type: "melding" | "prosjekt", id } når noe nytt legges inn,
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

Deno.serve(async (req) => {
  const { type, id } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? "") || !["melding", "prosjekt", "stemplet"].includes(type)) return new Response("ugyldig", { status: 400 });

  if (type === "stemplet") return stemplet(id);

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
