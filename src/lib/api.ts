// Datalaget. Med Supabase-nøkler i .env brukes ekte database; uten nøkler
// starter appen i demomodus med eksempeldata, så den kan prøves uten oppsett.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ansatt, Avdeling, Data, Soknad, Status } from "./ferie";
import { demoApi } from "./demo";
import type { NyTime, Prosjekt } from "./timer";

export type NySoknad = { id?: string; ansatt_id: string; fra: string; til: string; merknad: string };

export interface Api {
  modus: "supabase" | "demo";
  epost(): Promise<string | null>;
  onEpost(cb: (epost: string | null) => void): () => void;
  sendKode(epost: string): Promise<void>;
  bekreftKode(epost: string, kode: string): Promise<void>;
  loggUt(): Promise<void>;
  hent(): Promise<Data>;
  abonner(cb: () => void): () => void;
  lagreSoknad(s: NySoknad): Promise<void>;
  slettSoknad(id: string): Promise<void>;
  behandle(id: string, status: Status, kommentar: string): Promise<void>;
  lagreAnsatt(a: Partial<Ansatt> & { navn: string; avdeling_id: number }): Promise<void>;
  lagreAvdeling(a: Pick<Avdeling, "id" | "maks_borte">): Promise<void>;
  lagreOverfort(ansatt_id: string, aar: number, overfort: number): Promise<void>;
  /** Hemmelig lenke-nøkkel for kalenderabonnement. ny=true lager ny og gjør den gamle ugyldig. */
  kalenderToken(ny?: boolean): Promise<string>;
  kalenderUrl(token: string, alle?: boolean): string;
  lagreTime(t: NyTime): Promise<void>;
  slettTime(id: string): Promise<void>;
  /** Leder: godkjenn eller åpne timer igjen */
  settTimestatus(ids: string[], status: "levert" | "godkjent"): Promise<void>;
  /** Leder: godta en dag uten lunsjtrekk */
  lunsjUnntak(id: string, unntak: boolean): Promise<void>;
  lagreProsjekt(p: Partial<Prosjekt> & { navn: string }, nyKunde?: string): Promise<void>;
  /** Leder: siste henting fra Visma */
  vismaStatus(): Promise<{ tid: string; ok: boolean; melding: string } | null>;
}

/** Gjør databasefeil om til tekst som gir mening for brukeren. */
export function feiltekst(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/overlapper|leder med e-post|godkjent og kan/i.test(m)) return m;
  if (/timer_check|check constraint/i.test(m)) return "Sluttid må være etter starttid, og lunsjen kan ikke være lengre enn arbeidsøkta.";
  if (/timer_prosjekt_id_fkey|foreign key/i.test(m)) return "Prosjektet har registrerte timer og kan ikke slettes.";
  if (/ansatte_epost_unik|duplicate key/i.test(m)) return "Den e-postadressen er allerede brukt av en annen ansatt.";
  if (/row-level security|permission denied/i.test(m)) return "Du har ikke tilgang til å gjøre dette.";
  if (/Token has expired|invalid/i.test(m)) return "Koden er feil eller utløpt. Be om en ny kode.";
  if (/rate limit|too many/i.test(m)) return "For mange forsøk. Vent et minutt og prøv igjen.";
  if (/fetch|network/i.test(m)) return "Får ikke kontakt med serveren. Sjekk nettet og prøv igjen.";
  return m;
}

function supabaseApi(sb: SupabaseClient): Api {
  const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
  return {
    modus: "supabase",
    async epost() { return (await sb.auth.getSession()).data.session?.user.email ?? null; },
    onEpost(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s?.user.email ?? null));
      return () => data.subscription.unsubscribe();
    },
    async sendKode(epost) {
      ok(await sb.auth.signInWithOtp({ email: epost.trim(), options: { emailRedirectTo: location.origin } }));
    },
    async bekreftKode(epost, kode) {
      ok(await sb.auth.verifyOtp({ email: epost.trim(), token: kode.trim(), type: "email" }));
    },
    async loggUt() { await sb.auth.signOut(); },
    async hent() {
      const fraDato = new Date(Date.now() - 430 * 864e5).toISOString().slice(0, 10);
      const [avdelinger, ansatte, ferieaar, soknader, kunder, prosjekter, timer] = await Promise.all([
        sb.from("avdelinger").select("*").order("rekkefolge"),
        sb.from("ansatte").select("*"),
        sb.from("ferieaar").select("*"),
        sb.from("soknader").select("*").order("fra"),
        sb.from("kunder").select("*").order("navn"),
        sb.from("prosjekter").select("*").order("visma_nr", { ascending: false, nullsFirst: true }),
        sb.from("timer").select("*").gte("dato", fraDato).order("dato").order("fra").limit(20000),
      ]);
      return {
        avdelinger: ok(avdelinger), ansatte: ok(ansatte), ferieaar: ok(ferieaar), soknader: ok(soknader),
        kunder: ok(kunder), prosjekter: ok(prosjekter),
        timer: (ok(timer) as any[]).map((t) => ({ ...t, timer: Number(t.timer), km: Number(t.km), reisetid: Number(t.reisetid), fra: t.fra.slice(0, 5), til: t.til.slice(0, 5) })),
      } as Data;
    },
    abonner(cb) {
      let t: number | undefined;
      const snart = () => { clearTimeout(t); t = window.setTimeout(cb, 250); };
      const ch = sb.channel("ferie")
        .on("postgres_changes", { event: "*", schema: "public", table: "soknader" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "ansatte" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "ferieaar" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "avdelinger" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "timer" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "prosjekter" }, snart)
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },
    async lagreSoknad(s) {
      const rad = { ansatt_id: s.ansatt_id, fra: s.fra, til: s.til, merknad: s.merknad };
      ok(s.id ? await sb.from("soknader").update(rad).eq("id", s.id) : await sb.from("soknader").insert(rad));
    },
    async slettSoknad(id) { ok(await sb.from("soknader").delete().eq("id", id)); },
    async behandle(id, status, kommentar) { ok(await sb.from("soknader").update({ status, kommentar }).eq("id", id)); },
    async lagreAnsatt(a) {
      const { id, ...rad } = a;
      if (rad.epost !== undefined) rad.epost = rad.epost?.trim() || null;
      ok(id ? await sb.from("ansatte").update(rad).eq("id", id) : await sb.from("ansatte").insert(rad));
    },
    async lagreAvdeling(a) { ok(await sb.from("avdelinger").update({ maks_borte: a.maks_borte }).eq("id", a.id)); },
    async lagreOverfort(ansatt_id, aar, overfort) {
      ok(await sb.from("ferieaar").upsert({ ansatt_id, aar, overfort }));
    },
    async kalenderToken(ny) {
      return ok(await sb.rpc(ny ? "ny_kalender_token" : "min_kalender_token")) as string;
    },
    kalenderUrl(token, alle) {
      return `${url}/functions/v1/kalender?t=${token}${alle ? "&alle=1" : ""}`;
    },
    async lagreTime(t) {
      const { id, ...rad } = t;
      ok(id ? await sb.from("timer").update(rad).eq("id", id) : await sb.from("timer").insert(rad));
    },
    async slettTime(id) { ok(await sb.from("timer").delete().eq("id", id)); },
    async settTimestatus(ids, status) { if (ids.length) ok(await sb.from("timer").update({ status }).in("id", ids)); },
    async lunsjUnntak(id, unntak) { ok(await sb.from("timer").update({ lunsj_unntak: unntak }).eq("id", id)); },
    async vismaStatus() {
      const r = await sb.from("visma_sync_logg").select("tid, ok, melding").order("id", { ascending: false }).limit(1);
      return r.data?.[0] ?? null;
    },
    async lagreProsjekt(p, nyKunde) {
      let kunde_id = p.kunde_id ?? null;
      if (nyKunde?.trim()) kunde_id = (ok(await sb.from("kunder").insert({ navn: nyKunde.trim() }).select("id").single()) as { id: string }).id;
      const { id, ...rad } = { ...p, kunde_id };
      ok(id ? await sb.from("prosjekter").update(rad).eq("id", id) : await sb.from("prosjekter").insert(rad));
    },
  };
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const api: Api = url && key ? supabaseApi(createClient(url, key)) : demoApi();
export type { Soknad };
