// Valgfritt: sender e-post når noen søker ferie, og når leder har behandlet søknaden.
// Kobles til med en Database Webhook på tabellen «soknader» (INSERT og UPDATE).
// Trenger hemmelighetene RESEND_API_KEY, VARSEL_FRA og APP_URL (se README).
import { createClient } from "jsr:@supabase/supabase-js@2";

type Soknad = {
  id: string; ansatt_id: string; fra: string; til: string;
  merknad: string; status: "venter" | "godkjent" | "avslatt"; kommentar: string;
};
type Payload = { type: "INSERT" | "UPDATE" | "DELETE"; record: Soknad | null; old_record: Soknad | null };

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = Deno.env.get("APP_URL") ?? "";
const FRA = Deno.env.get("VARSEL_FRA") ?? "Ferieplanlegger <onboarding@resend.dev>";

const dato = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
};

async function send(to: string[], subject: string, text: string) {
  if (!to.length) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FRA, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend svarte ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  const p = (await req.json()) as Payload;
  const s = p.record;
  if (!s) return new Response("ingen endring");

  const { data: ansatt } = await supabase.from("ansatte").select("navn, epost").eq("id", s.ansatt_id).single();
  const periode = `${dato(s.fra)}–${dato(s.til)}`;

  if (p.type === "INSERT" && s.status === "venter") {
    const { data: ledere } = await supabase.from("ansatte").select("epost")
      .eq("rolle", "leder").eq("aktiv", true).not("epost", "is", null);
    await send(
      (ledere ?? []).map((l) => l.epost as string),
      `Ny feriesøknad fra ${ansatt?.navn ?? "en ansatt"}`,
      `${ansatt?.navn} har søkt ferie ${periode}.${s.merknad ? `\nMerknad: ${s.merknad}` : ""}\n\nBehandle søknaden: ${APP_URL}`,
    );
  } else if (p.type === "UPDATE" && p.old_record?.status !== s.status && s.status !== "venter" && ansatt?.epost) {
    const ord = s.status === "godkjent" ? "godkjent" : "avslått";
    await send(
      [ansatt.epost],
      `Feriesøknaden din er ${ord}`,
      `Ferien din ${periode} er ${ord}.${s.kommentar ? `\nKommentar fra leder: ${s.kommentar}` : ""}\n\nSe ferieplanen: ${APP_URL}`,
    );
  }
  return new Response("ok");
});
