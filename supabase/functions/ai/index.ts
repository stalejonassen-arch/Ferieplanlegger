// KI-hjelp for ByggLogg:
//  * «dagbok»   – snekkeren snakker inn dagen (på norsk, polsk, engelsk eller litauisk), og får ferdig dagbok på norsk.
//  * «befaring» – bilder og det som er sagt på befaringen fyller ut punkter, mål og notat (og tilbudstekst før tilbud).
//  * «status»   – om KI er satt opp (har API-nøkkel), så appen kan vise eller skjule knappene.
// Kalles fra appen med brukerens innlogging. Funksjonen sjekker selv at brukeren er en aktiv ansatt,
// logger bruken i ai_bruk og stopper ved mye bruk samme dag. Trenger hemmeligheten ANTHROPIC_API_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const NOKKEL = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELL = Deno.env.get("AI_MODELL") ?? "claude-sonnet-5-5";
const MAKS_PER_DAG = Number(Deno.env.get("AI_MAKS_PER_DAG") ?? 60);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const feil = (melding: string, status = 400) => svar({ feil: melding }, status);
const kort = (s: unknown, n: number) => String(s ?? "").slice(0, n);

const VAER = ["Sol", "Skyet", "Regn", "Snø", "Vind", "Kuling", "Frost"];
const SPRAK: Record<string, string> = { nb: "norsk", pl: "polsk", en: "engelsk", lt: "litauisk" };

type Innhold = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string } };

/** Ett kall til Claude med fast svarformat (verktøy), gir verktøyets input */
async function spor(system: string, innhold: Innhold[], verktoy: { name: string; description: string; input_schema: unknown }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": NOKKEL, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELL, max_tokens: 2000, system,
      tools: [verktoy], tool_choice: { type: "tool", name: verktoy.name },
      messages: [{ role: "user", content: innhold }],
    }),
  });
  if (!r.ok) throw new Error(`KI-tjenesten svarte ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const bit = (j.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!bit) throw new Error("KI-tjenesten ga ikke noe svar.");
  return { data: bit.input as Record<string, unknown>, inn: j.usage?.input_tokens ?? 0, ut: j.usage?.output_tokens ?? 0 };
}

async function dagbok(b: Record<string, unknown>) {
  const tale = kort(b.tekst, 6000).trim();
  if (tale.length < 5) throw new Error("Si eller skriv litt mer om dagen først.");
  const system = [
    "Du skriver byggedagbok for et norsk byggefirma (snekkere/tømrere). Teksten er det en håndverker har sagt eller skrevet om arbeidsdagen,",
    `ofte muntlig og kanskje på ${Object.values(SPRAK).join(", ")}. Skriv dagboken på norsk bokmål, kort og saklig, som en erfaren bas ville ført den:`,
    "hva som ble gjort (gjerne mengder, rom, etasje), leveranser, og hvem som var der hvis det er nevnt. Ikke legg til noe som ikke er sagt.",
    "Ikke skriv hilsener eller kommentarer til leseren. Bruk korte setninger, gjerne én linje per arbeidsoperasjon.",
  ].join(" ");
  const r = await spor(system, [{ type: "text", text: `Prosjekt: ${kort(b.prosjekt, 200)}\nDato: ${kort(b.dato, 20)}\n\nDette ble sagt:\n${tale}` }], {
    name: "dagbok", description: "Ferdig dagbok for dagen",
    input_schema: {
      type: "object", required: ["tekst", "vaer", "hindringer"],
      properties: {
        tekst: { type: "string", description: "Hva som ble gjort i dag, på norsk bokmål" },
        vaer: { type: "string", enum: ["", ...VAER], description: "Været hvis det er nevnt, ellers tom" },
        hindringer: { type: "string", description: "Hindringer, ventetid eller problemer som er nevnt, ellers tom" },
      },
    },
  });
  return r;
}

async function befaring(b: Record<string, unknown>) {
  const type = String(b.type ?? "tilbud");
  const punkter = (Array.isArray(b.punkter) ? b.punkter : []).slice(0, 60).map((p, i) => `${i + 1}. ${kort((p as { tekst?: string }).tekst, 200)}`);
  const bilder = (Array.isArray(b.bilder) ? b.bilder : []).slice(0, 6).filter((x) => typeof x === "string" && x.length < 1_500_000) as string[];
  const tale = kort(b.tekst, 8000).trim();
  if (!tale && !bilder.length) throw new Error("Si noe om befaringen eller ta bilder først.");
  const hva = type === "tilbud" ? "en befaring hos kunden før tilbud" : type === "overtakelse" ? "en overtakelse (ferdigbefaring) med kunden" : "en befaring underveis på jobben";
  const system = [
    `Du hjelper en norsk snekker/tømrer med ${hva}. Du får sjekkpunktene, det håndverkeren har sagt (kanskje på polsk, engelsk eller litauisk) og bilder.`,
    "Fyll ut punktene bare der det sagte eller bildene gir grunnlag. Ikke finn på mål – bruk bare mål som er sagt eller står tydelig skrevet.",
    "Svar «avvik» bare når det er en feil, mangel eller skade. Skriv alt på norsk bokmål, kort og faglig.",
    "Nye punkter bare for viktige ting som ikke passer i noen av de eksisterende.",
  ].join(" ");
  const innhold: Innhold[] = [
    { type: "text", text: `Befaring: ${kort(b.tittel, 200)}\nSjekkpunkter:\n${punkter.join("\n") || "(ingen)"}\n\nDette ble sagt:\n${tale || "(ingenting – bare bilder)"}` },
    ...bilder.map((data): Innhold => ({ type: "image", source: { type: "base64", media_type: data.startsWith("iVBOR") ? "image/png" : "image/jpeg", data } })),
  ];
  const punkt = {
    type: "object", required: ["nr"],
    properties: {
      nr: { type: "integer", description: "Nummeret på sjekkpunktet" },
      svar: { type: "string", enum: ["", "ok", "avvik", "na"] },
      maal: { type: "string", description: "Mål eller mengde, f.eks. «4,2 × 2,4 m»" },
      merknad: { type: "string" },
    },
  };
  return await spor(system, innhold, {
    name: "befaring", description: "Utfylt befaring",
    input_schema: {
      type: "object", required: ["notat", "punkter"],
      properties: {
        notat: { type: "string", description: "Kort sammendrag: kundens ønsker, valg, ting å huske" },
        punkter: { type: "array", items: punkt },
        nye_punkter: { type: "array", items: { type: "object", required: ["tekst"], properties: { tekst: { type: "string" }, svar: { type: "string", enum: ["", "ok", "avvik", "na"] }, maal: { type: "string" }, merknad: { type: "string" } } } },
        ...(type === "tilbud" ? { tilbudstekst: { type: "string", description: "Utkast til beskrivelse av arbeidet i tilbudet (uten priser)" } } : {}),
      },
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return feil("Ugyldig forespørsel.", 405);
  const auth = req.headers.get("Authorization") ?? "";
  const bruker = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: meg } = await bruker.rpc("mitt_ansatt_id");
  if (!meg) return feil("Du må være logget inn.", 401);
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const oppgave = String(b.oppgave ?? "");
  if (oppgave === "status") return svar({ ok: !!NOKKEL });
  if (!NOKKEL) return feil("KI er ikke satt opp ennå.", 503);
  if (!["dagbok", "befaring"].includes(oppgave)) return feil("Ukjent oppgave.");

  const { data: a } = await sb.from("ansatte").select("id, bedrift_id").eq("id", meg).maybeSingle();
  if (!a) return feil("Du må være logget inn.", 401);
  const fra = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { count } = await sb.from("ai_bruk").select("id", { count: "exact", head: true }).eq("ansatt_id", a.id).gte("tid", fra);
  if ((count ?? 0) >= MAKS_PER_DAG) return feil("Du har brukt KI-hjelpen mye i dag. Prøv igjen i morgen.", 429);

  try {
    const r = oppgave === "dagbok" ? await dagbok(b) : await befaring(b);
    await sb.from("ai_bruk").insert({ bedrift_id: a.bedrift_id, ansatt_id: a.id, oppgave, inn_tokens: r.inn, ut_tokens: r.ut });
    return svar(r.data);
  } catch (e) {
    return feil(e instanceof Error ? e.message : String(e), 500);
  }
});
