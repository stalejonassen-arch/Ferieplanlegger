// E-postvarsler for ByggLogg.
// Kalles fra databasen (pg_net) med { id, hendelse } når en søknad sendes eller behandles,
// når leder publiserer en månedsrapport (hendelse «rapport»), og når leder inviterer en ansatt
// til appen (hendelse «invitasjon», id = raden i invitasjoner).
// Funksjonen stoler ikke på innholdet i kallet: den leser søknaden fra databasen, sjekker at
// tilstanden stemmer, og logger hver sending slik at samme varsel aldri går ut to ganger.
// Publiseres uten JWT-sjekk. Trenger hemmeligheten RESEND_API_KEY (og VARSEL_FRA, APP_URL).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = Deno.env.get("APP_URL") ?? "";
const FRA = Deno.env.get("VARSEL_FRA") ?? "ByggLogg <varsel@bygglogg.no>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dato = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}.${m}.${y}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function send(to: string[], subject: string, avsnitt: string[], lenke = APP_URL, lenketekst = "Åpne ByggLogg") {
  if (!to.length) return;
  const html = avsnitt.map((a) => (/^<(h\d|ol|ul|div)/.test(a) ? a : `<p>${a}</p>`)).join("") +
    `<p><a href="${lenke}">${lenketekst}</a></p><p style="color:#666">Sendt fra ByggLogg</p>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FRA, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend svarte ${res.status}: ${await res.text()}`);
}

/** Registrerer at et varsel er sendt. Gir false hvis det allerede var sendt. */
async function forsteGang(soknad_id: string, hendelse: string) {
  const { error } = await sb.from("varsel_logg").insert({ soknad_id, hendelse });
  return !error;
}

/** Invitasjon til appen, med egne steg for iPhone og Android */
function invitasjonTekst(sprak: "nb" | "pl", navn: string, firma: string, epost: string) {
  const h = (x: string) => `<h3 style="margin:18px 0 6px">${x}</h3>`;
  const ol = (x: string[]) => `<ol style="margin:0 0 8px 20px;padding:0">${x.map((l) => `<li style="margin:3px 0">${l}</li>`).join("")}</ol>`;
  const fornavn = esc(navn.split(" ")[0] ?? "");
  const f = esc(firma || "Firmaet ditt"), e = esc(epost);
  if (sprak === "pl") return {
    emne: `Zaproszenie do ByggLogg – ${firma}`,
    lenke: "Otwórz ByggLogg",
    avsnitt: [
      `Cześć ${fornavn}!`,
      `${f} zaprasza Cię do <b>ByggLogg</b> – aplikacji do godzin, odbić czasu, projektów i wiadomości.`,
      h("1. Zaloguj się kodem"),
      ol([`Otwórz link na dole tego e-maila <b>na telefonie</b>.`, `Wpisz swój e-mail: <b>${e}</b> i naciśnij «Wyślij kod».`, `Dostaniesz e-mail z 6-cyfrowym kodem. Wpisz kod w aplikacji. Nie ma hasła do zapamiętania.`]),
      h("2. Zapisz jako aplikację – iPhone"),
      ol([`Otwórz link w <b>Safari</b> (nie w Gmail/Outlook ani Chrome). Jeśli otworzy się w innej aplikacji, skopiuj adres i wklej go w Safari.`, `Naciśnij przycisk <b>Udostępnij</b> (kwadrat ze strzałką w górę) na dole ekranu.`, `Przewiń w dół i wybierz <b>«Do ekranu początkowego»</b>, potem <b>«Dodaj»</b>.`, `Od teraz otwieraj ByggLogg <b>ikoną na ekranie</b>.`]),
      h("2. Zapisz jako aplikację – Android"),
      ol([`Otwórz link w <b>Chrome</b>.`, `Naciśnij trzy kropki <b>⋮</b> w prawym górnym rogu.`, `Wybierz <b>«Zainstaluj aplikację»</b> lub <b>«Dodaj do ekranu głównego»</b> i potwierdź.`, `Samsung Internet: menu <b>☰</b> → «Dodaj stronę do» → «Ekran startowy».`]),
      h("3. Włącz powiadomienia"),
      ol([`Otwórz ByggLogg ikoną na ekranie i zaloguj się.`, `Naciśnij <b>«Włącz powiadomienia»</b> i wybierz <b>«Zezwól»</b>.`, `iPhone: powiadomienia działają tylko, gdy aplikacja jest otwierana ikoną z ekranu (iOS 16.4 lub nowszy).`]),
      `Pytania? Zapytaj kierownika.`,
    ],
  };
  return {
    emne: `Du er invitert til ByggLogg – ${firma}`,
    lenke: "Åpne ByggLogg",
    avsnitt: [
      `Hei ${fornavn}!`,
      `${f} har invitert deg til <b>ByggLogg</b> – appen for timer, stempling, prosjekter og beskjeder.`,
      h("1. Logg inn med kode"),
      ol([`Åpne lenken nederst i denne e-posten <b>på mobilen</b>.`, `Skriv inn e-posten din: <b>${e}</b> og trykk «Send kode».`, `Du får en e-post med en 6-sifret kode. Skriv koden inn i appen. Du trenger ikke noe passord.`]),
      h("2. Lagre som app – iPhone"),
      ol([`Åpne lenken i <b>Safari</b> (ikke inne i Gmail/Outlook eller i Chrome). Åpner den seg et annet sted: kopier adressen og lim den inn i Safari.`, `Trykk på <b>Del</b>-knappen (firkant med pil opp) nederst på skjermen.`, `Bla ned og velg <b>«Legg til på Hjem-skjerm»</b>, og trykk <b>«Legg til»</b> øverst til høyre.`, `Åpne ByggLogg fra <b>ikonet på hjemskjermen</b> heretter.`]),
      h("2. Lagre som app – Android"),
      ol([`Åpne lenken i <b>Chrome</b>.`, `Trykk på de tre prikkene <b>⋮</b> øverst til høyre.`, `Velg <b>«Installer app»</b> eller <b>«Legg til på startsiden»</b>, og trykk <b>«Installer»</b>.`, `Bruker du Samsung Internet: menyen <b>☰</b> nederst → «Legg til side til» → «Startskjerm».`]),
      h("3. Slå på varsler"),
      ol([`Åpne ByggLogg fra ikonet og logg inn.`, `Trykk <b>«Slå på varsler»</b> og velg <b>«Tillat»</b>.`, `iPhone: varsler virker bare når appen åpnes fra ikonet på hjemskjermen (iOS 16.4 eller nyere).`]),
      `Lurer du på noe? Spør leder.`,
    ],
  };
}

Deno.serve(async (req) => {
  const { id, hendelse } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? "") || !["ny", "behandlet", "rapport", "invitasjon"].includes(hendelse)) return new Response("ugyldig", { status: 400 });

  if (hendelse === "invitasjon") {
    const { data: inv } = await sb.from("invitasjoner").select("id, bedrift_id, ansatt_id, epost, opprettet, levert").eq("id", id).maybeSingle();
    if (!inv) return new Response("finnes ikke", { status: 404 });
    // Bare ferske invitasjoner som ikke er sendt ennå (hindrer at kallet brukes til å sende på nytt)
    if (inv.levert || Date.now() - new Date(inv.opprettet).getTime() > 10 * 60_000) return new Response("allerede sendt");
    const { data: a } = await sb.from("ansatte").select("navn, epost, aktiv, sprak").eq("id", inv.ansatt_id).maybeSingle();
    if (!a?.aktiv || String(a.epost ?? "").trim().toLowerCase() !== String(inv.epost).toLowerCase()) return new Response("ugyldig");
    const { data: b } = await sb.from("bedrifter").select("navn").eq("id", inv.bedrift_id).maybeSingle();
    const { error } = await sb.from("invitasjoner").update({ levert: new Date().toISOString() }).eq("id", inv.id).is("levert", null).select("id").single();
    if (error) return new Response("allerede sendt");
    const t = invitasjonTekst(a.sprak === "pl" ? "pl" : "nb", a.navn ?? "", b?.navn ?? "", inv.epost);
    await send([inv.epost], t.emne, t.avsnitt, APP_URL, t.lenke);
    return new Response("sendt");
  }

  if (hendelse === "rapport") {
    const { data: r } = await sb.from("rapporter").select("id, bedrift_id, tittel, ingress, publisert").eq("id", id).maybeSingle();
    if (!r?.publisert) return new Response("ikke publisert");
    const { data: mottakere } = await sb.from("ansatte").select("epost").eq("bedrift_id", r.bedrift_id).eq("aktiv", true).not("epost", "is", null);
    const til = [...new Set((mottakere ?? []).map((m) => String(m.epost).trim()).filter(Boolean))];
    const { error } = await sb.from("rapport_varsel_logg").insert({ rapport_id: r.id, antall: til.length });
    if (error) return new Response("allerede sendt");
    // Én e-post per mottaker, så ingen ser de andres adresser
    for (const epost of til) {
      await send([epost], `Ny månedsrapport: ${r.tittel}`, [
        `<b>${esc(r.tittel)}</b> er klar til å leses.`,
        ...(r.ingress ? [esc(r.ingress)] : []),
        "Åpne den i ByggLogg under «Rapporter». Leder ser når du har lest den.",
      ], `${APP_URL}#rapporter`, "Les rapporten i ByggLogg");
      await new Promise((ok) => setTimeout(ok, 600)); // Resend tåler to e-poster i sekundet
    }
    return new Response(`sendt til ${til.length}`);
  }

  const { data: s } = await sb.from("soknader").select("id, ansatt_id, fra, til, merknad, status, kommentar, behandlet_tid").eq("id", id).maybeSingle();
  if (!s) return new Response("finnes ikke", { status: 404 });
  const { data: ansatt } = await sb.from("ansatte").select("navn, epost, bedrift_id").eq("id", s.ansatt_id).single();
  const periode = s.fra === s.til ? dato(s.fra) : `${dato(s.fra)}–${dato(s.til)}`;

  if (hendelse === "ny" && s.status === "venter") {
    if (!(await forsteGang(s.id, "ny"))) return new Response("allerede sendt");
    const { data: ledere } = await sb.from("ansatte").select("epost").eq("bedrift_id", ansatt?.bedrift_id ?? -1).eq("rolle", "leder").eq("aktiv", true).not("epost", "is", null);
    await send((ledere ?? []).map((l) => l.epost as string), `Ny feriesøknad fra ${ansatt?.navn ?? "en ansatt"}`, [
      `<b>${esc(ansatt?.navn ?? "")}</b> har søkt ferie <b>${periode}</b>.`,
      ...(s.merknad ? [`Merknad: ${esc(s.merknad)}`] : []),
      "Godkjenn eller avslå under «Søknader» i appen.",
    ]);
    return new Response("sendt");
  }

  if (hendelse === "behandlet" && (s.status === "godkjent" || s.status === "avslatt") && ansatt?.epost) {
    if (!(await forsteGang(s.id, `${s.status}:${s.behandlet_tid}`))) return new Response("allerede sendt");
    const ord = s.status === "godkjent" ? "godkjent" : "avslått";
    await send([ansatt.epost], `Feriesøknaden din er ${ord}`, [
      `Ferien din <b>${periode}</b> er <b>${ord}</b>.`,
      ...(s.kommentar ? [`Kommentar fra leder: ${esc(s.kommentar)}`] : []),
      ...(s.status === "godkjent" ? ["Har du abonnert på ferien i mobilkalenderen, dukker den opp der av seg selv."] : []),
    ]);
    return new Response("sendt");
  }
  return new Response("ingenting å sende");
});
