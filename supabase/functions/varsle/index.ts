// E-postvarsler for ByggLogg.
// Kalles fra databasen (pg_net) med { id, hendelse } når en søknad sendes eller behandles,
// og når leder publiserer en månedsrapport (hendelse «rapport»).
// Funksjonen stoler ikke på innholdet i kallet: den leser søknaden fra databasen, sjekker at
// tilstanden stemmer, og logger hver sending slik at samme varsel aldri går ut to ganger.
// Publiseres uten JWT-sjekk. Trenger hemmeligheten RESEND_API_KEY (og VARSEL_FRA, APP_URL).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = Deno.env.get("APP_URL") ?? "";
const FRA = Deno.env.get("VARSEL_FRA") ?? "Ferieplanlegger <ferie@austnes.no>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dato = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}.${m}.${y}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function send(to: string[], subject: string, avsnitt: string[], lenke = APP_URL, lenketekst = "Åpne ByggLogg") {
  if (!to.length) return;
  const html = avsnitt.map((a) => `<p>${a}</p>`).join("") +
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

Deno.serve(async (req) => {
  const { id, hendelse } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? "") || !["ny", "behandlet", "rapport"].includes(hendelse)) return new Response("ugyldig", { status: 400 });

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
