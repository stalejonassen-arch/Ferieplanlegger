// Påminnelse om hovedferie. Kjøres av pg_cron 1. mars, 1. april og 1. mai.
// Sender e-post til ansatte som ennå ikke har søkt om 3 uker sommerferie (1. juni–30. september),
// og en oversikt til leder. Logges per måned, så den sender aldri mer enn én gang per runde.
// Publiseres uten JWT-sjekk. Trenger RESEND_API_KEY (og VARSEL_FRA, APP_URL).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = Deno.env.get("APP_URL") ?? "";
const FRA = Deno.env.get("VARSEL_FRA") ?? "Ferieplanlegger <ferie@austnes.no>";
const HOVEDFERIE = 15; // 3 uker mandag–fredag

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
function paaske(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
function fridager(y: number) {
  const p = paaske(y), pl = (n: number) => iso(new Date(p.getTime() + n * 864e5));
  return new Set([`${y}-05-01`, `${y}-05-17`, pl(39), pl(50)]); // helligdager som kan falle i perioden
}
/** Feriedager mandag–fredag i hovedferieperioden for én søknad. */
function hovedferieDager(fra: string, til: string, y: number) {
  const fri = fridager(y);
  const start = fra > `${y}-06-01` ? fra : `${y}-06-01`, slutt = til < `${y}-09-30` ? til : `${y}-09-30`;
  let n = 0;
  for (let d = new Date(start + "T00:00:00Z"); iso(d) <= slutt; d = new Date(d.getTime() + 864e5)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6 && !fri.has(iso(d))) n++;
  }
  return n;
}

async function send(to: string[], subject: string, html: string) {
  if (!to.length) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FRA, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend svarte ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  const naa = new Date();
  const y = naa.getUTCFullYear(), mnd = naa.getUTCMonth() + 1;
  const tvungen = new URL(req.url).searchParams.get("test") === "1"; // bare til leder, for testing
  if (!tvungen && (mnd < 3 || mnd > 5)) return new Response("utenfor påminnelsesperioden");

  if (!tvungen) {
    const { error } = await sb.from("paaminnelse_logg").insert({ runde: `${y}-${pad(mnd)}` });
    if (error) return new Response("allerede sendt denne måneden");
  }

  const { data: ansatte } = await sb.from("ansatte").select("id, navn, epost, rolle").eq("aktiv", true);
  const { data: soknader } = await sb.from("soknader").select("ansatt_id, fra, til, status")
    .neq("status", "avslatt").lte("fra", `${y}-09-30`).gte("til", `${y}-06-01`);

  const mangler = (ansatte ?? []).map((a) => {
    const dager = (soknader ?? []).filter((s) => s.ansatt_id === a.id).reduce((n, s) => n + hovedferieDager(s.fra, s.til, y), 0);
    return { ...a, dager };
  }).filter((a) => a.dager < HOVEDFERIE);

  if (!tvungen) {
    for (const a of mangler) {
      if (!a.epost) continue;
      await send([a.epost], `Har du planlagt sommerferien ${y}?`,
        `<p>Hei ${a.navn.split(" ")[0]}</p>` +
        `<p>Du har søkt om <b>${a.dager} av ${HOVEDFERIE}</b> dager hovedferie (1. juni–30. september) for ${y}.</p>` +
        `<p>Søk gjerne snart, så vi får lagt sommerplanen i god tid.</p>` +
        `<p><a href="${APP_URL}">Søk ferie i Ferieplanlegger</a></p><p style="color:#666">Hilsen N L Austnes AS</p>`);
    }
  }

  const ledere = (ansatte ?? []).filter((a) => a.rolle === "leder" && a.epost).map((a) => a.epost as string);
  const liste = mangler.length
    ? `<ul>${mangler.map((a) => `<li>${a.navn}: ${a.dager} av ${HOVEDFERIE} dager${a.epost ? "" : " (mangler e-post, fikk ikke påminnelse)"}</li>`).join("")}</ul>`
    : "<p>Alle har søkt om hovedferie.</p>";
  await send(ledere, `${tvungen ? "[TEST] " : ""}Sommerferie ${y}: ${mangler.length} har ikke søkt ferdig`,
    `<p>Status for hovedferie ${y} (minst ${HOVEDFERIE} dager mellom 1. juni og 30. september):</p>${liste}` +
    `<p>Husk at de ansatte har krav på å få vite ferietidspunktet senest 2 måneder før.</p><p><a href="${APP_URL}">Åpne Ferieplanlegger</a></p>`);
  return new Response(`sendt, ${mangler.length} mangler`);
});
