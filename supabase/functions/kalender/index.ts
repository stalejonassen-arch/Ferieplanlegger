// Kalenderabonnement: GET /functions/v1/kalender?t=<hemmelig lenke>
// Gir godkjent ferie som .ics. For leder kan &alle=1 gi ferien til alle ansatte.
// Må publiseres UTEN JWT-sjekk (kalenderapper kan ikke sende innlogging); lenken er nøkkelen.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dato = (iso: string) => iso.replace(/-/g, "");
const nesteDag = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const tekst = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
function brett(linje: string) {
  const ut: string[] = [];
  let rest = linje;
  while (rest.length > 74) { ut.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  ut.push(rest);
  return ut.join("\r\n");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  if (!UUID.test(token)) return new Response("Ugyldig lenke", { status: 404 });

  const { data: tok } = await sb.from("kalender_tokens").select("ansatt_id").eq("token", token).maybeSingle();
  if (!tok) return new Response("Ugyldig lenke", { status: 404 });
  const { data: meg } = await sb.from("ansatte").select("id, navn, rolle, aktiv").eq("id", tok.ansatt_id).single();
  if (!meg?.aktiv) return new Response("Ugyldig lenke", { status: 404 });

  const alle = url.searchParams.get("alle") === "1" && meg.rolle === "leder";
  const fraDato = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);

  let q = sb.from("soknader").select("id, ansatt_id, fra, til, merknad").eq("status", "godkjent").gte("til", fraDato);
  if (!alle) q = q.eq("ansatt_id", meg.id);
  const { data: soknader } = await q;
  const { data: ansatte } = await sb.from("ansatte").select("id, navn");
  const navn = new Map((ansatte ?? []).map((a) => [a.id, a.navn]));

  const naa = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const linjer = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//N L Austnes AS//Ferieplanlegger//NO",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${tekst(alle ? "Ferie N L Austnes" : `Ferie – ${meg.navn}`)}`,
    "X-WR-TIMEZONE:Europe/Oslo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const s of soknader ?? []) {
    linjer.push(
      "BEGIN:VEVENT",
      `UID:ferie-${s.id}@ferieplanlegger.austnes.no`,
      `DTSTAMP:${naa}`,
      `DTSTART;VALUE=DATE:${dato(s.fra)}`,
      `DTEND;VALUE=DATE:${dato(nesteDag(s.til))}`,
      `SUMMARY:${tekst(`Ferie – ${navn.get(s.ansatt_id) ?? ""}`)}`,
      ...(s.merknad && !alle ? [`DESCRIPTION:${tekst(s.merknad)}`] : []),
      `TRANSP:${alle ? "TRANSPARENT" : "OPAQUE"}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  linjer.push("END:VCALENDAR");
  return new Response(linjer.map(brett).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ferie.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
});
