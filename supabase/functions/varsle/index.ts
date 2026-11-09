// E-postvarsler for ByggLogg.
// Kalles fra databasen (pg_net) med { id, hendelse } når en søknad sendes eller behandles,
// når leder publiserer en månedsrapport (hendelse «rapport»), og når leder inviterer en ansatt
// til appen (hendelse «invitasjon», id = raden i invitasjoner), og når en personlig månedsrapport
// publiseres (hendelse «personrapport», id = raden i personrapporter; sendes bare til den ansatte).
// Funksjonen stoler ikke på innholdet i kallet: den leser søknaden fra databasen, sjekker at
// tilstanden stemmer, og logger hver sending slik at samme varsel aldri går ut to ganger.
// Publiseres uten JWT-sjekk. Trenger hemmeligheten RESEND_API_KEY (og VARSEL_FRA, APP_URL).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = Deno.env.get("APP_URL") ?? "";
// Avsendernavnet er alltid «ByggLogg»; adressen hentes fra VARSEL_FRA
const FRA_ADR = (Deno.env.get("VARSEL_FRA") ?? "ferie@austnes.no").match(/<([^>]+)>/)?.[1] ?? (Deno.env.get("VARSEL_FRA") ?? "ferie@austnes.no").trim();
const FRA = `ByggLogg <${FRA_ADR}>`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dato = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}.${m}.${y}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function send(to: string[], subject: string, avsnitt: string[], lenke = APP_URL, lenketekst = "Åpne ByggLogg") {
  if (!to.length) return;
  const html = avsnitt.map((a) => (/^<(h\d|ol|ul|div)/.test(a) ? a : `<p>${a}</p>`)).join("") +
    `<p><a href="${lenke}">${lenketekst}</a></p><p style="color:#666">Hilsen N L Austnes AS</p>`;
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
function invitasjonTekst(sprak: "nb" | "pl" | "en" | "lt", navn: string, firma: string, epost: string) {
  const h = (x: string) => `<h3 style="margin:18px 0 6px">${x}</h3>`;
  const ol = (x: string[]) => `<ol style="margin:0 0 8px 20px;padding:0">${x.map((l) => `<li style="margin:3px 0">${l}</li>`).join("")}</ol>`;
  const fornavn = esc(navn.split(" ")[0] ?? "");
  const f = esc(firma || "Firmaet ditt"), e = esc(epost);
  if (sprak === "en") return {
    emne: `You are invited to ByggLogg – ${firma}`,
    lenke: "Open ByggLogg",
    avsnitt: [
      `Hi ${fornavn}!`,
      `${f} has invited you to <b>ByggLogg</b> – the app for hours, clocking in, projects and messages.`,
      h("1. Log in with a code"),
      ol([`Open the link at the bottom of this email <b>on your phone</b>.`, `Enter your email: <b>${e}</b> and tap «Send kode» (send code).`, `You will get an email with a 6-digit code. Enter it in the app. No password needed.`]),
      h("2. Save as an app – iPhone"),
      ol([`Open the link in <b>Safari</b> (not inside Gmail/Outlook or Chrome). If it opens elsewhere, copy the address and paste it into Safari.`, `Tap the <b>Share</b> button (square with an arrow up) at the bottom of the screen.`, `Scroll down, choose <b>«Add to Home Screen»</b> and tap <b>«Add»</b>.`, `From now on, open ByggLogg from the <b>icon on your home screen</b>.`]),
      h("2. Save as an app – Android"),
      ol([`Open the link in <b>Chrome</b>.`, `Tap the three dots <b>⋮</b> at the top right.`, `Choose <b>«Install app»</b> or <b>«Add to Home screen»</b> and tap <b>«Install»</b>.`, `Samsung Internet: menu <b>☰</b> → «Add page to» → «Home screen».`]),
      h("3. Turn on notifications"),
      ol([`Open ByggLogg from the icon and log in.`, `Tap <b>«Slå på varsler»</b> (turn on notifications) and choose <b>«Allow»</b>.`, `iPhone: notifications only work when the app is opened from the home screen icon (iOS 16.4 or newer).`]),
      `Tip: tap <b>English</b> at the bottom of the login page, and choose English in the language menu at the top of the app.`,
      `Questions? Ask your manager.`,
    ],
  };
  if (sprak === "lt") return {
    emne: `Kvietimas į ByggLogg – ${firma}`,
    lenke: "Atidaryti ByggLogg",
    avsnitt: [
      `Sveiki, ${fornavn}!`,
      `${f} kviečia jus naudotis <b>ByggLogg</b> – programėle darbo valandoms, darbo pradžios ir pabaigos registracijai, projektams ir žinutėms.`,
      h("1. Prisijunkite su kodu"),
      ol([`Atidarykite nuorodą šio laiško apačioje <b>telefone</b>.`, `Įveskite savo el. paštą: <b>${e}</b> ir paspauskite «Send kode» (siųsti kodą).`, `Gausite laišką su 6 skaitmenų kodu. Įveskite jį programėlėje. Slaptažodžio nereikia.`]),
      h("2. Išsaugokite kaip programėlę – iPhone"),
      ol([`Atidarykite nuorodą <b>Safari</b> naršyklėje (ne Gmail/Outlook ar Chrome). Jei atsidaro kitur, nukopijuokite adresą ir įklijuokite į Safari.`, `Paspauskite <b>Bendrinti</b> mygtuką (kvadratas su rodykle aukštyn) ekrano apačioje.`, `Slinkite žemyn, pasirinkite <b>«Į pradžios ekraną»</b> ir paspauskite <b>«Pridėti»</b>.`, `Toliau atidarykite ByggLogg per <b>piktogramą pradžios ekrane</b>.`]),
      h("2. Išsaugokite kaip programėlę – Android"),
      ol([`Atidarykite nuorodą <b>Chrome</b> naršyklėje.`, `Paspauskite tris taškus <b>⋮</b> viršuje dešinėje.`, `Pasirinkite <b>«Įdiegti programą»</b> arba <b>«Pridėti prie pagrindinio ekrano»</b> ir patvirtinkite.`, `Samsung Internet: meniu <b>☰</b> → «Pridėti puslapį prie» → «Pradžios ekranas».`]),
      h("3. Įjunkite pranešimus"),
      ol([`Atidarykite ByggLogg per piktogramą ir prisijunkite.`, `Paspauskite <b>«Slå på varsler»</b> (įjungti pranešimus) ir pasirinkite <b>«Leisti»</b>.`, `iPhone: pranešimai veikia tik tada, kai programėlė atidaroma per piktogramą pradžios ekrane (iOS 16.4 ar naujesnė).`]),
      `Patarimas: prisijungimo puslapio apačioje paspauskite <b>Lietuvių</b>, o programėlės viršuje esančiame kalbų meniu pasirinkite lietuvių kalbą.`,
      `Turite klausimų? Klauskite vadovo.`,
    ],
  };
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

// ---------------------------------------------------------------- Personlig månedsrapport på e-post
type Tall = { omsetning: number; db: number; dg: number | null };
type DgDel = { id: string; navn: string; mnd: Tall; forrige: Tall; hittil: Tall; ifjor: Tall };
type TimerDel = { kunde: number; ikkeFakturerbart: number; intern: number; sum: number; andelIntern: number;
  forrige: { sum: number; andelIntern: number } | null; hittil: { sum: number; andelIntern: number }; snittAndelIntern: number | null };
type Innhold = { navn: string; periode: string; timer?: TimerDel; dg?: DgDel[]; totalt?: DgDel; ikkeSelger?: boolean };

const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO").replace(/ /g, " ")} kr`;
const pst = (n: number | null | undefined) => (n == null ? "–" : `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`);
const tt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("nb-NO");
const BLA = "#0A1EBE", GUL = "#FFCD00", GRONN = "#1A7F37", ROD = "#B42318", GRA = "#5B6275";

function endring(fra: number | null | undefined, til: number | null | undefined, lavErBra = false) {
  if (fra == null || til == null) return "";
  const d = Math.round((til - fra) * 10) / 10;
  if (Math.abs(d) < 0.1) return `<span style="color:${GRA}">som forrige måned</span>`;
  const bra = lavErBra ? d < 0 : d > 0;
  return `<span style="color:${bra ? GRONN : ROD};font-weight:700">${d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("nb-NO")} %-poeng</span>`;
}

function nokkeltall(celler: [string, string, string?][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px 0;margin:0 -6px"><tr>${celler.map(([l, v, farge]) =>
    `<td style="background:#F2F4FA;border-radius:10px;padding:12px 12px 10px;vertical-align:top"><div style="font-size:12px;color:${GRA};margin-bottom:4px">${l}</div><div style="font-size:22px;font-weight:800;color:${farge ?? "#111827"};white-space:nowrap">${v}</div></td>`).join("")}</tr></table>`;
}

function seksjon(tittel: string, innhold: string) {
  return `<tr><td style="padding:18px 24px 4px"><div style="font-size:17px;font-weight:800;color:#111827;margin-bottom:10px">${tittel}</div>${innhold}</td></tr>`;
}

function rapportEpost(i: Innhold, kommentar: string, periode: string, firma: string, lenke: string) {
  const mnd = MND[Number(periode.slice(5, 7)) - 1] ?? "", aar = periode.slice(0, 4);
  const fornavn = esc((i.navn ?? "").split(" ")[0] ?? "");
  const deler: string[] = [];
  if (kommentar.trim()) {
    deler.push(`<tr><td style="padding:18px 24px 0"><div style="background:#FFF8D6;border-left:4px solid ${GUL};border-radius:8px;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:#7A5B00;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Tilbakemelding på måneden</div>
      <div style="font-size:15px;line-height:1.55;color:#1F2937">${esc(kommentar).replace(/\n/g, "<br>")}</div></div></td></tr>`);
  }
  const t = i.timer;
  if (t) {
    deler.push(seksjon("Timer på kunde og interntid", t.sum === 0 ? `<p style="color:${GRA};margin:0">Ingen timer ført denne måneden.</p>` :
      nokkeltall([["På kunde", `${tt(t.kunde)} t`, GRONN], ["Interntid", `${tt(t.intern)} t`], ["Andel interntid", pst(t.andelIntern), t.snittAndelIntern != null && t.andelIntern <= t.snittAndelIntern ? GRONN : undefined]]) +
      `<ul style="margin:12px 0 0;padding-left:18px;font-size:14px;line-height:1.6;color:#374151">
        <li>${tt(t.sum)} timer i alt${t.ikkeFakturerbart ? `, hvorav ${tt(t.ikkeFakturerbart)} t på prosjekt som ikke faktureres` : ""}.</li>
        ${t.forrige ? `<li>Forrige måned: ${pst(t.forrige.andelIntern)} interntid. ${endring(t.forrige.andelIntern, t.andelIntern, true)}</li>` : ""}
        <li>Hittil i år: ${pst(t.hittil.andelIntern)} interntid av ${tt(t.hittil.sum)} timer.</li>
        ${t.snittAndelIntern != null ? `<li>Snitt for snekkerne: ${pst(t.snittAndelIntern)}.${t.andelIntern <= t.snittAndelIntern ? ` <b style="color:${GRONN}">Bedre enn snittet – bra jobba!</b>` : ""}</li>` : ""}
      </ul>`));
  }
  if (i.totalt || i.dg) {
    if (i.ikkeSelger) deler.push(seksjon("Salg", `<p style="color:${GRA};margin:0">Fant deg ikke som selger i Visma, så salget er tomt.</p>`));
    else {
      const T = i.totalt;
      if (T) deler.push(seksjon(`Ditt salg i ${mnd}`, nokkeltall([["Salg", kr(T.mnd.omsetning)], ["Dekningsbidrag", kr(T.mnd.db)], ["DG", pst(T.mnd.dg), BLA]]) +
        `<ul style="margin:12px 0 0;padding-left:18px;font-size:14px;line-height:1.6;color:#374151">
          <li>Forrige måned: ${pst(T.forrige.dg)} DG på ${kr(T.forrige.omsetning)}. ${endring(T.forrige.dg, T.mnd.dg)}</li>
          <li>Hittil i år: <b>${pst(T.hittil.dg)}</b> DG på ${kr(T.hittil.omsetning)}.</li>
          ${T.ifjor.omsetning ? `<li>Samme måned i fjor: ${pst(T.ifjor.dg)} DG på ${kr(T.ifjor.omsetning)}.</li>` : ""}
        </ul>`));
      if (i.dg?.length) {
        const rad = (k: DgDel) => `<tr>
          <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-weight:700">${esc(k.navn)}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:right;white-space:nowrap">${k.mnd.omsetning ? kr(k.mnd.omsetning) : "–"}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:800;color:${BLA}">${pst(k.mnd.dg)}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:right;color:${GRA};white-space:nowrap">${pst(k.hittil.dg)}</td></tr>`;
        deler.push(seksjon("Vinduer, dører og takplater", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#111827">
          <tr><th align="left" style="padding:6px 8px;font-size:12px;color:${GRA};border-bottom:2px solid #D1D5DB">Kategori</th><th align="right" style="padding:6px 8px;font-size:12px;color:${GRA};border-bottom:2px solid #D1D5DB">Salg</th><th align="right" style="padding:6px 8px;font-size:12px;color:${GRA};border-bottom:2px solid #D1D5DB">DG</th><th align="right" style="padding:6px 8px;font-size:12px;color:${GRA};border-bottom:2px solid #D1D5DB">Hittil i år</th></tr>
          ${i.dg.map(rad).join("")}</table>
          <p style="font-size:12px;color:${GRA};margin:8px 0 0">Kategoriene er med i totalen over. DG = dekningsbidrag delt på fakturert salg eks. mva, avstemt mot regnskapet.</p>`));
      }
    }
  }
  const html = `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Månedsrapport</title></head>
<body style="margin:0;padding:0;background:#E9ECF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9ECF5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(10,30,190,.10)">
  <tr><td style="background:${BLA};padding:22px 24px 18px;color:#FFFFFF">
    <div style="font-size:13px;font-weight:700;color:${GUL};letter-spacing:.02em">${esc(firma)}</div>
    <div style="font-size:26px;font-weight:900;margin-top:4px">Din månedsrapport</div>
    <div style="font-size:16px;opacity:.9;margin-top:2px;text-transform:capitalize">${mnd} ${aar}</div>
  </td></tr>
  <tr><td style="height:6px;background:repeating-linear-gradient(90deg,${GUL} 0 18px,#E5B800 18px 20px)"></td></tr>
  <tr><td style="padding:20px 24px 0;font-size:16px;line-height:1.5">Hei ${fornavn}! Her er tallene dine for ${mnd}.</td></tr>
  ${deler.join("")}
  <tr><td align="center" style="padding:24px">
    <a href="${lenke}" style="display:inline-block;background:${GUL};color:#1A1400;font-weight:800;font-size:15px;text-decoration:none;padding:13px 22px;border-radius:10px">Åpne rapporten i ByggLogg</a>
  </td></tr>
  <tr><td style="padding:14px 24px 22px;border-top:1px solid #E5E7EB;font-size:12px;color:${GRA};line-height:1.5">
    Rapporten er bare for deg. Leder ser når du har lest den i appen.<br>Sendt fra ByggLogg for ${esc(firma)}.
  </td></tr>
</table></td></tr></table></body></html>`;
  return { emne: `Din månedsrapport for ${mnd} ${aar}`, html };
}

Deno.serve(async (req) => {
  const { id, hendelse } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? "") || !["ny", "behandlet", "rapport", "invitasjon", "personrapport"].includes(hendelse)) return new Response("ugyldig", { status: 400 });

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
    const t = invitasjonTekst(["pl", "en", "lt"].includes(a.sprak) ? a.sprak : "nb", a.navn ?? "", b?.navn ?? "", inv.epost);
    try { await send([inv.epost], t.emne, t.avsnitt, APP_URL, t.lenke); }
    catch (e) {
      // Ikke sendt: fjern merket, så leder ser at det ikke gikk og kan prøve igjen
      await sb.from("invitasjoner").update({ levert: null }).eq("id", inv.id);
      throw e;
    }
    return new Response("sendt");
  }

  if (hendelse === "personrapport") {
    const { data: r } = await sb.from("personrapporter").select("id, bedrift_id, ansatt_id, periode, innhold, kommentar, publisert, epost_sendt").eq("id", id).maybeSingle();
    if (!r?.publisert) return new Response("ikke publisert");
    if (r.epost_sendt) return new Response("allerede sendt");
    const { data: a } = await sb.from("ansatte").select("navn, epost, aktiv").eq("id", r.ansatt_id).maybeSingle();
    const epost = String(a?.epost ?? "").trim();
    if (!a?.aktiv || !epost) return new Response("mangler e-post");
    // Merk som sendt først, så samme rapport ikke går ut to ganger om kallet gjentas
    const { data: merket } = await sb.from("personrapporter").update({ epost_sendt: new Date().toISOString() }).eq("id", r.id).is("epost_sendt", null).select("id");
    if (!merket?.length) return new Response("allerede sendt");
    const { data: b } = await sb.from("bedrifter").select("navn").eq("id", r.bedrift_id).maybeSingle();
    const p = rapportEpost(r.innhold as Innhold, String(r.kommentar ?? ""), String(r.periode), b?.navn ?? "", `${APP_URL}#rapporter`);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FRA, to: [epost], subject: p.emne, html: p.html }),
      });
      if (!res.ok) throw new Error(`Resend svarte ${res.status}: ${await res.text()}`);
    } catch (e) {
      await sb.from("personrapporter").update({ epost_sendt: null }).eq("id", r.id);
      throw e;
    }
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
  const { data: ansatt } = await sb.from("ansatte").select("navn, epost").eq("id", s.ansatt_id).single();
  const periode = s.fra === s.til ? dato(s.fra) : `${dato(s.fra)}–${dato(s.til)}`;

  if (hendelse === "ny" && s.status === "venter") {
    if (!(await forsteGang(s.id, "ny"))) return new Response("allerede sendt");
    const { data: ledere } = await sb.from("ansatte").select("epost").eq("rolle", "leder").eq("aktiv", true).not("epost", "is", null);
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
