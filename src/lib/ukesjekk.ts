// Ukesjekk for leder: hva som trenger deg før helgen. Regnes ut i appen fra det som allerede er lastet,
// og som et kort push-varsel fredag ettermiddag (tallene regnes da i databasen, se ukesjekk_tall()).
import type { Data } from "./ferie";
import { bruker, type Modul } from "./moduler";
import { drarUt } from "./service";
import { folgOppNaa, MIN_BELOP, type Tilbud } from "./tilbud";
import { dagerUtenTimer, mandag } from "./timer";

export interface Sjekkpunkt { id: string; ok: boolean; tittel: string; detalj: string; lenke: string }

/** Arbeidsuker i året (52 minus ferie og helligdager), brukt til ukemålet for fakturerte timer */
export const ARBEIDSUKER = 46;

const addDager = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const t1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("nb-NO");

export function ukesjekk(d: Data, idag: string, tilbud: Tilbud[], helligdag: (iso: string) => string | undefined): Sjekkpunkt[] {
  const b = (m: Modul) => bruker(d, m);
  const man = mandag(idag);
  const ut: Sjekkpunkt[] = [];

  // Fører bedriften timer i ByggLogg? (ellers, f.eks. når timene føres i Svenn, er punkt 1–3 bare støy)
  const forer = new Set(d.timer.filter((t) => t.dato >= addDager(idag, -42)).map((t) => t.ansatt_id));

  // 1. Fakturerbare timer denne uka mot ukemålet (forholdsmessig for dagene som har gått)
  const dager = Array.from({ length: 5 }, (_, i) => addDager(man, i)).filter((x) => x <= idag && !helligdag(x)).length;
  const ukemaal = ((d.maal ?? 6000) / ARBEIDSUKER) * (dager / 5);
  const fakt = d.timer.filter((t) => t.dato >= man && t.dato <= idag && t.prosjekt_id && t.fakturerbar !== false).reduce((s, t) => s + Number(t.timer), 0);
  if (forer.size) ut.push({
    id: "timer", ok: dager === 0 || fakt >= ukemaal * 0.9, lenke: "#prosjekter",
    tittel: `${t1(fakt)} fakturerbare timer denne uka`,
    detalj: dager ? `Mål så langt i uka: ${Math.round(ukemaal)} t (${Math.round((fakt / (ukemaal || 1)) * 100)} %)` : "Uka har så vidt startet",
  });

  // 2. Ansatte som mangler timer på hverdager som har gått (bare de som fører timer)
  const mangler = d.ansatte.filter((a) => a.aktiv && forer.has(a.id))
    .map((a) => ({ a, dager: dagerUtenTimer(a.id, d, man, idag, helligdag) })).filter((x) => x.dager.length);
  if (forer.size) ut.push({
    id: "mangler", ok: !mangler.length, lenke: "#timer",
    tittel: mangler.length ? `${mangler.length} mangler timer denne uka` : "Alle har ført timer",
    detalj: mangler.map((x) => `${x.a.navn.split(" ")[0]} (${x.dager.length})`).join(", "),
  });

  // 3. Timer som ikke er godkjent fra tidligere uker
  const ikkeGodkjent = d.timer.filter((t) => t.status === "levert" && t.dato < man).length;
  if (ikkeGodkjent) ut.push({ id: "godkjenn", ok: false, lenke: "#timer", tittel: `${ikkeGodkjent} timeføringer fra tidligere uker er ikke godkjent`, detalj: "" });

  // 4. Feriesøknader som venter
  const sok = d.soknader.filter((s) => s.status === "venter").length;
  if (sok) ut.push({ id: "soknader", ok: false, lenke: "#sok", tittel: `${sok} ${sok === 1 ? "feriesøknad venter" : "feriesøknader venter"}`, detalj: "" });

  // 5. Åpne avvik med passert frist eller eldre enn to uker
  const avvik = (d.avvik ?? []).filter((a) => a.status !== "lukket" && ((a.frist && a.frist < idag) || a.opprettet.slice(0, 10) < addDager(idag, -14)));
  if (b("avvik") && avvik.length) ut.push({ id: "avvik", ok: false, lenke: "#avvik", tittel: `${avvik.length} ${avvik.length === 1 ? "avvik er åpent" : "avvik er åpne"} for lenge`, detalj: avvik.slice(0, 3).map((a) => a.tittel).join(", ") });

  // 6. Reklamasjoner over fristen
  const rekl = (d.reklamasjoner ?? []).filter((r) => (r.status === "ny" || r.status === "godkjent") && r.frist && r.frist < idag);
  if (b("reklamasjon") && rekl.length) ut.push({ id: "reklamasjon", ok: false, lenke: "#plan", tittel: `${rekl.length} ${rekl.length === 1 ? "reklamasjon er" : "reklamasjoner er"} over fristen`, detalj: rekl.slice(0, 3).map((r) => r.tittel).join(", ") });

  // 7. Serviceoppdrag som drar ut, og som venter på fakturering
  const service = d.serviceoppdrag ?? [];
  const drar = service.filter((s) => drarUt(s, idag)).length, faktura = service.filter((s) => s.status === "ferdig").length;
  if (b("service") && (drar || faktura)) ut.push({
    id: "service", ok: false, lenke: "#prosjekter",
    tittel: [drar ? `${drar} serviceoppdrag drar ut` : "", faktura ? `${faktura} serviceoppdrag til fakturering` : ""].filter(Boolean).join(" · "), detalj: "",
  });

  // 8. Bestillinger fra byggeplassen som ikke er tatt
  const best = (d.bestillinger ?? []).filter((b) => b.status === "ny").length;
  if (b("bestilling") && best) ut.push({ id: "bestilling", ok: false, lenke: "#plan", tittel: `${best} ${best === 1 ? "bestilling er" : "bestillinger er"} ikke behandlet`, detalj: "" });

  // 9. Tilbud å følge opp
  const tb = tilbud.filter((t) => folgOppNaa(t, idag) && t.belop >= MIN_BELOP);
  if (b("tilbud") && tb.length) ut.push({
    id: "tilbud", ok: false, lenke: "#prosjekter",
    tittel: `${tb.length} tilbud å følge opp`, detalj: `${Math.round(tb.reduce((s, t) => s + t.belop, 0)).toLocaleString("nb-NO")} kr`,
  });

  return ut;
}
