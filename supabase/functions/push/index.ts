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
type Sp = "nb" | "pl" | "en" | "lt";
/** Språket den ansatte har valgt i appen (norsk hvis ukjent) */
const sp = (a: { sprak: string | null }): Sp => (["pl", "en", "lt"].includes(a.sprak ?? "") ? a.sprak as Sp : "nb");
/** Velg tekst etter mottakerens språk */
const v = <T>(a: { sprak: string | null }, t: Record<Sp, T>): T => t[sp(a)];
const LOCALE: Record<Sp, string> = { nb: "nb-NO", pl: "pl-PL", en: "en-GB", lt: "lt-LT" };

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
const TIMER: Record<Sp, string> = { nb: "t", pl: "godz.", en: "h", lt: "val." };
const varighet = (min: number, s: Sp = "nb") => `${Math.floor(min / 60)} ${TIMER[s]}${min % 60 ? ` ${min % 60} min` : ""}`;

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
  const res = await send([a], (x) => {
    const t = `${hm(r.start)} (${varighet(r.minutter, sp(x))})`;
    return { ...v(x, {
      nb: { tittel: "Fortsatt stemplet inn?", tekst: `Du har vært stemplet inn siden ${t}. Husk å stemple ut når du går for dagen.` },
      pl: { tittel: "Nadal zalogowany?", tekst: `Jesteś zalogowany od ${t}. Pamiętaj, aby się wylogować, gdy kończysz pracę.` },
      en: { tittel: "Still clocked in?", tekst: `You have been clocked in since ${t}. Remember to clock out when you finish for the day.` },
      lt: { tittel: "Vis dar užsiregistravęs?", tekst: `Esate užsiregistravęs nuo ${t}. Nepamirškite atsižymėti, kai baigiate darbo dieną.` },
    }), url: "/#timer", tag: "stemplet" };
  });
  return Response.json(res);
}

const MND = ["jan.", "feb.", "mar.", "apr.", "mai", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "des."];
/** Kort dato på mottakerens språk, f.eks. «21. okt.», «21 paź», «21 Oct», «spalio 21 d.» */
const dato = (iso: string, s: Sp = "nb") => s === "nb"
  ? `${Number(iso.slice(8, 10))}. ${MND[Number(iso.slice(5, 7)) - 1]}`
  : new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(LOCALE[s], { day: "numeric", month: s === "lt" ? "long" : "short", timeZone: "UTC" });
const fraTil = (fra: string, til: string, s: Sp) => (fra === til ? dato(fra, s) : `${dato(fra, s)} – ${dato(til, s)}`);

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
  const r = await send(mottakere ?? [], (a) => ({
    tittel: `${v(a, { nb: "Nytt arbeid", pl: "Nowa praca", en: "New job", lt: "Naujas darbas" })}: ${kort(o.tittel, 60)}`,
    tekst: [p?.navn, fraTil(o.fra, o.til, sp(a)), p?.adresse].filter(Boolean).join(" · "),
    url: "/#plan", tag: `oppgave-${o.id}`,
  }));
  return Response.json(r);
}

/** Reklamasjon med frist om to dager, eller passert frist: varsle den ansvarlige og leder/prosjektleder */
async function reklamasjon(id: string) {
  const { data: r } = await sb.from("reklamasjoner").select("id, bedrift_id, prosjekt_id, tittel, status, frist, ansvarlig_id").eq("id", id).maybeSingle();
  if (!r || !r.frist || !["ny", "godkjent"].includes(r.status)) return new Response("ikke aktuelt");
  const idag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const passert = r.frist < idag;
  const { error: finnes } = await sb.from("push_logg").insert({ type: `reklamasjon:${passert ? "passert" : "snart"}:${r.frist}`, id: r.id });
  if (finnes) return new Response("allerede sendt");
  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);
  const { data: p } = await sb.from("prosjekter").select("navn").eq("id", r.prosjekt_id).maybeSingle();
  const { data: alle } = await sb.from("ansatte").select("id, navn, sprak, rolle, prosjektleder").eq("bedrift_id", r.bedrift_id).eq("aktiv", true);
  const mottakere = (alle ?? []).filter((a) => a.id === r.ansvarlig_id || a.rolle === "leder" || a.prosjektleder);
  const res = await send(mottakere, (a) => ({
    tittel: passert
      ? v(a, { nb: "Reklamasjon over fristen", pl: "Reklamacja po terminie", en: "Warranty claim past deadline", lt: "Pretenzijos terminas praėjo" })
      : v(a, { nb: "Frist for reklamasjon om 2 dager", pl: "Termin reklamacji za 2 dni", en: "Warranty claim due in 2 days", lt: "Pretenzijos terminas po 2 dienų" }),
    tekst: [r.tittel, p?.navn, `${v(a, { nb: "frist", pl: "termin", en: "due", lt: "terminas" })} ${dato(r.frist, sp(a))}`].filter(Boolean).join(" · "),
    url: "/#plan", tag: `reklamasjon-${r.id}`,
  }));
  return Response.json(res);
}

/** Serviceoppdrag: nytt → leder og prosjektleder; delt ut → den ansvarlige; satt til «haster» → begge */
async function service(id: string) {
  const { data: o } = await sb.from("serviceoppdrag").select("id, bedrift_id, tittel, kunde_navn, kunde_id, adresse, prioritet, status, ansvarlig_id, dato, registrert_av").eq("id", id).maybeSingle();
  if (!o || !["ny", "planlagt"].includes(o.status)) return new Response("ikke aktuelt");
  const { data: n } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!n) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", n.offentlig, n.privat);
  const { data: alle } = await sb.from("ansatte").select("id, navn, sprak, rolle, prosjektleder").eq("bedrift_id", o.bedrift_id).eq("aktiv", true);
  const { data: k } = o.kunde_id ? await sb.from("kunder").select("navn").eq("id", o.kunde_id).maybeSingle() : { data: null };
  const kunde = k?.navn || o.kunde_navn || "";
  const ikon = o.prioritet === "haster" ? "🔴 " : "";
  const ut: Record<string, unknown> = {};
  // Ny: leder og prosjektleder (ikke den som registrerte den selv)
  if ((await sb.from("push_logg").insert({ type: "service:ny", id: o.id })).error == null) {
    const m = (alle ?? []).filter((a) => (a.rolle === "leder" || a.prosjektleder) && a.id !== o.registrert_av && a.id !== o.ansvarlig_id);
    const haster = o.prioritet === "haster";
    ut.ny = await send(m, (a) => ({
      tittel: ikon + v(a, {
        nb: `Nytt serviceoppdrag${haster ? " – haster" : ""}`, pl: `Nowe zlecenie serwisowe${haster ? " – pilne" : ""}`,
        en: `New service job${haster ? " – urgent" : ""}`, lt: `Naujas serviso darbas${haster ? " – skubu" : ""}`,
      }),
      tekst: [o.tittel, kunde, o.adresse].filter(Boolean).join(" · "), url: "/#prosjekter", tag: `service-${o.id}`,
    }));
  }
  // Delt ut til en snekker (ikke når han tok det selv)
  if (o.ansvarlig_id && o.ansvarlig_id !== o.registrert_av && (await sb.from("push_logg").insert({ type: `service:ansvarlig:${o.ansvarlig_id}`, id: o.id })).error == null) {
    const m = (alle ?? []).filter((a) => a.id === o.ansvarlig_id);
    const naar = (s: Sp) => o.dato ? new Date(`${o.dato}T12:00:00Z`).toLocaleDateString(LOCALE[s], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "";
    ut.ansvarlig = await send(m, (a) => ({
      tittel: ikon + v(a, { nb: "Serviceoppdrag til deg", pl: "Zlecenie serwisowe dla ciebie", en: "Service job for you", lt: "Serviso darbas jums" }),
      tekst: [o.tittel, kunde, naar(sp(a))].filter(Boolean).join(" · "), url: "/#prosjekter", tag: `service-${o.id}`,
    }));
  }
  // Satt til «haster» etterpå
  if (o.prioritet === "haster" && (await sb.from("push_logg").insert({ type: "service:haster", id: o.id })).error == null && ut.ny === undefined) {
    const m = (alle ?? []).filter((a) => a.id === o.ansvarlig_id || ((a.rolle === "leder" || a.prosjektleder) && !o.ansvarlig_id));
    ut.haster = await send(m, (a) => ({
      tittel: "🔴 " + v(a, { nb: "Serviceoppdraget haster", pl: "Pilne zlecenie serwisowe", en: "Urgent service job", lt: "Skubus serviso darbas" }),
      tekst: [o.tittel, kunde].filter(Boolean).join(" · "), url: "/#prosjekter", tag: `service-${o.id}`,
    }));
  }
  return Response.json(ut);
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
  const m = Number(String(r.periode).slice(5, 7)) - 1;
  const MNDNAVN: Record<Sp, string[]> = {
    nb: ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"],
    pl: ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    lt: ["sausį", "vasarį", "kovą", "balandį", "gegužę", "birželį", "liepą", "rugpjūtį", "rugsėjį", "spalį", "lapkritį", "gruodį"],
  };
  const res = await send(mottakere ?? [], (a) => {
    const mnd = MNDNAVN[sp(a)][m];
    return { ...v(a, {
      nb: { tittel: "Din månedsrapport", tekst: `Rapporten for ${mnd} er klar.` },
      pl: { tittel: "Twój raport miesięczny", tekst: `Raport za ${mnd} jest gotowy.` },
      en: { tittel: "Your monthly report", tekst: `Your report for ${mnd} is ready.` },
      lt: { tittel: "Jūsų mėnesio ataskaita", tekst: `Ataskaita už ${mnd} paruošta.` },
    }), url: "/#rapporter", tag: `personrapport-${r.id}` };
  });
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
      tittel: `${v(a, { nb: "Ny bestilling", pl: "Nowe zamówienie", en: "New order", lt: "Naujas užsakymas" })}: ${kort(p?.navn ?? "", 40)}`,
      tekst: `${bestiller}${b.onsket_dato ? ` (${v(a, { nb: "til", pl: "na", en: "for", lt: "iki" })} ${dato(b.onsket_dato, sp(a))})` : ""}: ${varer}`,
      url: "/#plan", tag: `bestilling-${b.id}`,
    }));
    return Response.json(r);
  }
  const meg = (alle ?? []).filter((a) => a.id === b.bestilt_av);
  const tekst: Record<string, Record<Sp, string>> = {
    klar: { nb: "Bestillingen er klar", pl: "Zamówienie jest gotowe", en: "Your order is ready", lt: "Užsakymas paruoštas" },
    levert: { nb: "Bestillingen er levert", pl: "Zamówienie dostarczone", en: "Your order has been delivered", lt: "Užsakymas pristatytas" },
    avvist: { nb: "Bestillingen kan ikke leveres", pl: "Zamówienie nie może zostać zrealizowane", en: "Your order cannot be delivered", lt: "Užsakymo pristatyti negalima" },
  };
  const r = await send(meg, (a) => ({
    tittel: v(a, tekst[b.status]!),
    tekst: [p?.navn, b.svar || varer].filter(Boolean).join(" · "),
    url: "/#prosjekter", tag: `bestilling-${b.id}`,
  }));
  return Response.json(r);
}

/** Ukesjekk fredag: kort oppsummering til leder av det som venter (tallene fra ukesjekk_tall) */
async function ukesjekk(id: string) {
  const { data: a } = await sb.from("ansatte").select("id, navn, sprak, rolle, bedrift_id, aktiv").eq("id", id).maybeSingle();
  if (!a || !a.aktiv || a.rolle !== "leder") return new Response("ikke aktuelt");
  const uke = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const { error: finnes } = await sb.from("push_logg").insert({ type: `ukesjekk:${uke}`, id: a.id });
  if (finnes) return new Response("allerede sendt");
  const { data: t } = await sb.rpc("ukesjekk_tall", { b: a.bedrift_id });
  const n = (t ?? {}) as Record<string, number>;
  const s = sp(a);
  const deler: Record<Sp, [string, (k: number) => string][]> = {
    nb: [["tilbud", (k) => `${k} tilbud å følge opp`], ["soknader", (k) => `${k} feriesøknad${k === 1 ? "" : "er"} venter`], ["godkjenn", (k) => `${k} timeføring${k === 1 ? "" : "er"} ikke godkjent`],
      ["bestilling", (k) => `${k} bestilling${k === 1 ? "" : "er"} ikke behandlet`], ["service_faktura", (k) => `${k} serviceoppdrag til fakturering`], ["service_drar", (k) => `${k} serviceoppdrag drar ut`],
      ["reklamasjon", (k) => `${k} reklamasjon${k === 1 ? "" : "er"} over fristen`], ["avvik", (k) => `${k} avvik åpne for lenge`]],
    pl: [["tilbud", (k) => `oferty do kontaktu: ${k}`], ["soknader", (k) => `wnioski urlopowe: ${k}`], ["godkjenn", (k) => `niezatwierdzone godziny: ${k}`],
      ["bestilling", (k) => `nowe zamówienia: ${k}`], ["service_faktura", (k) => `zlecenia do fakturowania: ${k}`], ["service_drar", (k) => `opóźnione zlecenia: ${k}`],
      ["reklamasjon", (k) => `reklamacje po terminie: ${k}`], ["avvik", (k) => `otwarte odchylenia: ${k}`]],
    en: [["tilbud", (k) => `${k} quote${k === 1 ? "" : "s"} to follow up`], ["soknader", (k) => `${k} holiday request${k === 1 ? "" : "s"} waiting`], ["godkjenn", (k) => `${k} time entr${k === 1 ? "y" : "ies"} not approved`],
      ["bestilling", (k) => `${k} order${k === 1 ? "" : "s"} not handled`], ["service_faktura", (k) => `${k} service job${k === 1 ? "" : "s"} to invoice`], ["service_drar", (k) => `${k} service job${k === 1 ? "" : "s"} running late`],
      ["reklamasjon", (k) => `${k} warranty claim${k === 1 ? "" : "s"} overdue`], ["avvik", (k) => `${k} deviation${k === 1 ? "" : "s"} open too long`]],
    lt: [["tilbud", (k) => `pasiūlymai: ${k}`], ["soknader", (k) => `atostogų prašymai: ${k}`], ["godkjenn", (k) => `nepatvirtintos valandos: ${k}`],
      ["bestilling", (k) => `nauji užsakymai: ${k}`], ["service_faktura", (k) => `serviso darbai sąskaitai: ${k}`], ["service_drar", (k) => `vėluojantys serviso darbai: ${k}`],
      ["reklamasjon", (k) => `pretenzijos po termino: ${k}`], ["avvik", (k) => `atviri neatitikimai: ${k}`]],
  };
  const tekst = deler[s].filter(([k]) => (n[k] ?? 0) > 0).map(([k, f]) => f(n[k]!));
  const { data: nk } = await sb.from("push_noekler").select("offentlig, privat").eq("id", 1).maybeSingle();
  if (!nk) return new Response("mangler nøkler", { status: 500 });
  webpush.setVapidDetails("mailto:stale.jonassen@austnes.no", nk.offentlig, nk.privat);
  const res = await send([a], () => ({
    tittel: v(a, { nb: "Ukesjekk før helgen", pl: "Podsumowanie tygodnia", en: "Weekly check before the weekend", lt: "Savaitės apžvalga prieš savaitgalį" }),
    tekst: tekst.length ? kort(tekst.join(" · "), 180) : v(a, { nb: "Alt ser bra ut denne uka. God helg!", pl: "Wszystko w porządku w tym tygodniu. Miłego weekendu!", en: "Everything looks good this week. Have a nice weekend!", lt: "Šią savaitę viskas gerai. Gero savaitgalio!" }),
    url: "/#timer", tag: "ukesjekk",
  }));
  return Response.json({ ...res, tall: n });
}

Deno.serve(async (req) => {
  const { type, id } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? "") || !["melding", "prosjekt", "stemplet", "oppgave", "bestilling", "personrapport", "reklamasjon", "service", "ukesjekk"].includes(type)) return new Response("ugyldig", { status: 400 });

  if (type === "stemplet") return stemplet(id);
  if (type === "oppgave") return oppgave(id);
  if (type === "bestilling") return bestilling(id);
  if (type === "personrapport") return personrapport(id);
  if (type === "reklamasjon") return reklamasjon(id);
  if (type === "service") return service(id);
  if (type === "ukesjekk") return ukesjekk(id);

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
      tittel: hvor ? `${avsender} · ${kort(hvor === "Felles" ? v(a, { nb: "Felles", pl: "Wszyscy w firmie", en: "Everyone in the company", lt: "Visi įmonėje" }) : hvor, 40)}` : avsender,
      tekst: m.tekst ? kort(m.tekst, 180) : "📷 " + v(a, { nb: "Bilde", pl: "Zdjęcie", en: "Photo", lt: "Nuotrauka" }),
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
    tittel: v(a, { nb: "Nytt prosjekt", pl: "Nowy projekt", en: "New project", lt: "Naujas projektas" }),
    tekst: [p.visma_nr ? `${p.visma_nr} ${p.navn}` : p.navn, p.adresse].filter(Boolean).join(" – "),
    url: "/#prosjekter", tag: `prosjekt-${p.id}`,
  }));
  return Response.json(r);
});
