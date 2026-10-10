// Datalaget. Med Supabase-nøkler i .env brukes ekte database; uten nøkler
// starter appen i demomodus med eksempeldata, så den kan prøves uten oppsett.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ansatt, Avdeling, Data, Soknad, Status } from "./ferie";
import { demoApi } from "./demo";
import type { NyTime, Prosjekt } from "./timer";
import type { NyRapport } from "./rapport";
import type { FravaerType } from "./fravaer";
import { STANDARD_KVOTER, type Kvoter, type Utstyr } from "./utstyr";
import type { Kobling, importRader } from "./svenn";
import { komprimer, type NyttAvvik, type Dagbok, type Tillegg } from "./hms";

export interface ProsjektOrdre { visma_ordrenr: number; ordredato: string | null; ordretype: number; transaksjonstype: number; navn: string; sum_netto: number; kostnad: number; dekningsbidrag: number; fakturert: number; ferdig: string | null }
/** Vare brukt på prosjektet (fra Visma) med FDV-lenke */
export interface FdvVare { varenr: string; beskrivelse: string; antall: number; enhet: string; nobb_nr: string; fdv_url: string; skjul: boolean }
/** Eget FDV-dokument lastet opp på prosjektet */
export interface FdvDok { id: string; navn: string; sti: string; storrelse: number | null; opprettet: string }
/** Lenke til varen hos NOBB. Fanen «Dokumentasjon» der har FDV, produktdatablad og monteringsanvisning. */
export const nobbLenke = (nr: string) => `https://www.nobb.no/item/${nr}`;
export type BildeMaal = { prosjekt_id?: string | null; avvik_id?: string | null; dagbok_id?: string | null; tillegg_id?: string | null; tekst?: string; svenn_id?: number; opprettet?: string };
export type NySoknad = { id?: string; ansatt_id: string; fra: string; til: string; merknad: string };

/** Svar fra importen av Svenn-timer */
export interface SvennResultat { importert: number; timer: number; fakturerbart: number; internt: number; fra: string; til: string; nye_prosjekter: number; ukjente_ansattnr: string[] }

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
  lagreAvvik(a: NyttAvvik): Promise<string>;
  slettAvvik(id: string): Promise<void>;
  lastOppBilde(fil: File, til: BildeMaal): Promise<void>;
  lagreDagbok(d: Partial<Dagbok> & { prosjekt_id: string; tekst: string }): Promise<string>;
  slettDagbok(id: string): Promise<void>;
  lagreTillegg(t: Partial<Tillegg> & { prosjekt_id: string; tittel: string }): Promise<string>;
  slettTillegg(id: string): Promise<void>;
  /** Leder: ordrer i Visma knyttet til prosjektet */
  prosjektOrdre(prosjektId: string): Promise<ProsjektOrdre[]>;
  slettBilde(id: string, sti: string): Promise<void>;
  /** Midlertidige lenker til bildene (gyldige i en time) */
  bildeUrler(stier: string[]): Promise<Record<string, string>>;
  /** FDV: varer brukt på prosjektet og egne dokumenter */
  fdv(prosjektId: string): Promise<{ varer: FdvVare[]; dok: FdvDok[] }>;
  /** Leder: rett NOBB-nr, legg inn egen FDV-lenke eller skjul en vare (gjelder alle prosjekter) */
  lagreVare(varenr: string, endring: Partial<Pick<FdvVare, "nobb_nr" | "fdv_url" | "skjul">>): Promise<void>;
  lastOppFdv(prosjektId: string, fil: File, svenn?: { svenn_id: number; opprettet: string }): Promise<void>;
  slettFdv(id: string, sti: string): Promise<void>;
  /** Midlertidig lenke til et dokument (gyldig i en time) */
  dokUrl(sti: string, lastNed?: string): Promise<string>;
  /** Leder: lagre (og ev. publisere) en månedsrapport. Publisering sender e-post til alle ansatte. */
  lagreRapport(r: NyRapport): Promise<void>;
  slettRapport(id: string, sti: string): Promise<void>;
  /** Logg inn/bytt/ut. til = sluttid når man glemte å logge ut en tidligere dag. */
  stemple(handling: "inn" | "bytt" | "ut", o?: { prosjekt?: string | null; beskrivelse?: string; lunsj?: number; til?: string }): Promise<void>;
  /** Registrer eller rett sykefravær (egenmelding, sykmelding, sykt barn) */
  lagreFravaer(f: { id?: string; ansatt_id: string; type: FravaerType; fra: string; til: string; grad?: number; merknad?: string }): Promise<void>;
  slettFravaer(id: string): Promise<void>;
  /** Utstyr: ny (eget verktøy) eller endring (serienr, status, merknad; leder også kategori) */
  lagreUtstyr(u: Partial<Utstyr> & { id?: string; beskrivelse?: string }): Promise<string>;
  slettUtstyr(id: string, bilde_sti: string | null): Promise<void>;
  /** Bilde av verktøyet (erstatter et tidligere bilde) */
  utstyrBilde(id: string, fil: File, gammel: string | null): Promise<void>;
  /** Leder: grenser for arbeidstøy og verktøy (kr per ansatt per år, 0 = ingen) og måneder før samme vare igjen */
  settUtstyrGrenser(arbeidstoy: number, verktoy: number, sammeMnd: number): Promise<void>;
  /** Leder: kvoter på antall per plaggtype */
  settUtstyrKvoter(kvoter: Kvoter): Promise<void>;
  /** Leder: lagrede koblinger fra Svenn-prosjekt til prosjekt i ByggLogg */
  svennKoblinger(): Promise<{ nokkel: string; prosjekt_id: string | null; fakturerbar: boolean }[]>;
  /** Leder: importer timer fra Svenn. Erstatter tidligere Svenn-import i samme periode. */
  importerSvenn(koblinger: Kobling[], rader: ReturnType<typeof importRader>): Promise<SvennResultat>;
  /** Leder: koble Svenn-prosjekter til prosjekter (oppretter nye), gir nøkkel -> prosjekt-id */
  svennProsjekter(koblinger: { nokkel: string; prosjekt_id: string | null; ny_navn: string | null }[]): Promise<Record<string, string>>;
  /** Svenn-filer som allerede er importert (bilder og dokumenter) */
  svennImporterteFiler(): Promise<Set<number>>;
  /** Merk rapporten som lest av meg */
  markerLest(id: string): Promise<void>;
  /** Leder: sett mål for fakturerte timer i året */
  settMaal(aar: number): Promise<void>;
  /** Leder: siste henting fra Visma */
  vismaStatus(): Promise<{ tid: string; ok: boolean; melding: string } | null>;
}

/** Gjør databasefeil om til tekst som gir mening for brukeren. */
export function feiltekst(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/overlapper|leder med e-post|godkjent og kan/i.test(m)) return m;
  if (/timer_check|check constraint/i.test(m)) return "Sluttid må være etter starttid, og lunsjen kan ikke være lengre enn arbeidsøkta.";
  if (/timer_prosjekt_id_fkey|foreign key/i.test(m)) return "Prosjektet har registrerte timer og kan ikke slettes.";
  if (/allerede logget inn|ikke logget inn|Skriv inn når du sluttet|Egenmelding kan|Fraværet overlapper|for deg selv/i.test(m)) return m;
  if (/ansatte_ansattnr_unik/i.test(m)) return "Det ansattnummeret er allerede brukt av en annen ansatt.";
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
      const [avdelinger, ansatte, ferieaar, soknader, kunder, prosjekter, timer, avvik, bilder, dagbok, tillegg, bedrift, rapporter, lest, stempling, fravaer, utstyr] = await Promise.all([
        sb.from("avdelinger").select("*").order("rekkefolge"),
        sb.from("ansatte").select("*"),
        sb.from("ferieaar").select("*"),
        sb.from("soknader").select("*").order("fra"),
        sb.from("kunder").select("*").order("navn"),
        sb.from("prosjekter").select("*").order("visma_nr", { ascending: false, nullsFirst: true }),
        sb.from("timer").select("*").gte("dato", fraDato).order("dato").order("fra").limit(20000),
        sb.from("avvik").select("*").order("opprettet", { ascending: false }).limit(2000),
        sb.from("bilder").select("*").order("opprettet", { ascending: false }).limit(5000),
        sb.from("dagbok").select("*").order("dato", { ascending: false }).order("opprettet", { ascending: false }).limit(5000),
        sb.from("tillegg").select("*").order("opprettet", { ascending: false }).limit(2000),
        sb.from("bedrifter").select("*").limit(1),
        sb.from("rapporter").select("id, tittel, periode, ingress, lenke, sti, publisert, opprettet").order("periode", { ascending: false }).limit(200),
        sb.from("rapport_lest").select("rapport_id, ansatt_id, lest").limit(10000),
        sb.from("stempling").select("ansatt_id, prosjekt_id, dato, fra, startet"),
        sb.from("fravaer").select("id, ansatt_id, type, fra, til, grad, merknad, opprettet").order("fra", { ascending: false }).limit(5000),
        sb.from("utstyr").select("id, ansatt_id, kilde, visma_ordrenr, dato, varenr, nobb_nr, beskrivelse, antall, enhet, pris, kategori, kategori_manuell, serienr, bilde_sti, status, merknad, bytte_avklart").order("dato", { ascending: false }).limit(10000),
      ]);
      const b0 = (bedrift.data as any[])?.[0] ?? {};
      return {
        avdelinger: ok(avdelinger), ansatte: ok(ansatte), ferieaar: ok(ferieaar), soknader: ok(soknader),
        kunder: ok(kunder), prosjekter: ok(prosjekter), avvik: ok(avvik), bilder: ok(bilder), dagbok: ok(dagbok),
        tillegg: (ok(tillegg) as Tillegg[]).map((t) => ({ ...t, timer: t.timer == null ? null : Number(t.timer), pris: t.pris == null ? null : Number(t.pris) })),
        rapporter: rapporter.error ? [] : rapporter.data, lest: lest.error ? [] : lest.data,
        fravaer: fravaer.error ? [] : fravaer.data,
        utstyr: utstyr.error ? [] : (utstyr.data as any[]).map((x) => ({ ...x, antall: Number(x.antall), pris: Number(x.pris) })),
        utstyrGrenser: { arbeidstoy: b0.utstyr_grense_arbeidstoy == null ? null : Number(b0.utstyr_grense_arbeidstoy), verktoy: b0.utstyr_grense_verktoy == null ? null : Number(b0.utstyr_grense_verktoy), sammeMnd: Number(b0.utstyr_samme_mnd ?? 6), kvoter: (b0.utstyr_kvoter as Kvoter | undefined) ?? STANDARD_KVOTER },
        egenmelding: { maksDager: Number((bedrift.data as any[])?.[0]?.egenmelding_maks_dager ?? 3), maksGanger: Number((bedrift.data as any[])?.[0]?.egenmelding_maks_ganger ?? 4) },
        stempling: stempling.error ? [] : (stempling.data as any[]).map((x) => ({ ...x, fra: String(x.fra).slice(0, 5) })),
        maal: Number((ok(bedrift) as { maal_fakturert_aar: number }[])[0]?.maal_fakturert_aar ?? 6000),
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
        .on("postgres_changes", { event: "*", schema: "public", table: "avvik" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "bilder" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "dagbok" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "tillegg" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "rapporter" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "rapport_lest" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "stempling" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "fravaer" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "utstyr" }, snart)
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
    async lagreAvvik(a) {
      const { id, ...rad } = a;
      for (const k of ["meldt_av", "lukket_av", "lukket_tid", "opprettet"] as const) delete (rad as Record<string, unknown>)[k];
      const r = id ? await sb.from("avvik").update(rad).eq("id", id).select("id").single() : await sb.from("avvik").insert(rad).select("id").single();
      return (ok(r) as { id: string }).id;
    },
    async slettAvvik(id) { ok(await sb.from("avvik").delete().eq("id", id)); },
    async lastOppBilde(fil, til) {
      const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
      const mappe = til.prosjekt_id ? `p-${til.prosjekt_id}` : `a-${til.avvik_id}`;
      const sti = `${bedrift}/${mappe}/${crypto.randomUUID()}.jpg`;
      const data = await komprimer(fil);
      ok(await sb.storage.from("bilder").upload(sti, data, { contentType: data.type || "image/jpeg" }));
      const r = await sb.from("bilder").insert({ sti, prosjekt_id: til.prosjekt_id ?? null, avvik_id: til.avvik_id ?? null, dagbok_id: til.dagbok_id ?? null, tillegg_id: til.tillegg_id ?? null, tekst: til.tekst ?? "",
        ...(til.svenn_id ? { svenn_id: til.svenn_id, opprettet: til.opprettet } : {}) });
      if (r.error) { await sb.storage.from("bilder").remove([sti]); throw r.error; }
    },
    async lagreDagbok(x) {
      const { id, ...rad } = x;
      for (const k of ["ansatt_id", "opprettet"] as const) delete (rad as Record<string, unknown>)[k];
      const r = id ? await sb.from("dagbok").update(rad).eq("id", id).select("id").single() : await sb.from("dagbok").insert(rad).select("id").single();
      return (ok(r) as { id: string }).id;
    },
    async slettDagbok(id) { ok(await sb.from("dagbok").delete().eq("id", id)); },
    async lagreTillegg(x) {
      const { id, ...rad } = x;
      for (const k of ["opprettet_av", "opprettet", "signert_tid"] as const) delete (rad as Record<string, unknown>)[k];
      const r = id ? await sb.from("tillegg").update(rad).eq("id", id).select("id").single() : await sb.from("tillegg").insert(rad).select("id").single();
      return (ok(r) as { id: string }).id;
    },
    async slettTillegg(id) { ok(await sb.from("tillegg").delete().eq("id", id)); },
    async prosjektOrdre(prosjektId) {
      const r = ok(await sb.from("prosjekt_ordre").select("*").eq("prosjekt_id", prosjektId).order("ordredato", { ascending: false })) as ProsjektOrdre[];
      return r.map((o) => ({ ...o, sum_netto: Number(o.sum_netto), kostnad: Number(o.kostnad), dekningsbidrag: Number(o.dekningsbidrag), fakturert: Number(o.fakturert) }));
    },
    async slettBilde(id, sti) {
      ok(await sb.from("bilder").delete().eq("id", id));
      await sb.storage.from("bilder").remove([sti]);
    },
    async bildeUrler(stier) {
      if (!stier.length) return {};
      const r = ok(await sb.storage.from("bilder").createSignedUrls(stier, 3600)) as { path: string | null; signedUrl: string }[];
      return Object.fromEntries(r.filter((x) => x.path).map((x) => [x.path as string, x.signedUrl]));
    },
    async fdv(prosjektId) {
      const [pv, dok] = await Promise.all([
        sb.from("prosjekt_vare").select("varenr, beskrivelse, antall, enhet").eq("prosjekt_id", prosjektId).order("beskrivelse"),
        sb.from("fdv_dok").select("id, navn, sti, storrelse, opprettet").eq("prosjekt_id", prosjektId).order("opprettet"),
      ]);
      const rader = ok(pv) as { varenr: string; beskrivelse: string; antall: number; enhet: string }[];
      const info = new Map<string, { nobb_nr: string; fdv_url: string; skjul: boolean; beskrivelse: string }>();
      for (let i = 0; i < rader.length; i += 200) {
        const r = ok(await sb.from("varer").select("varenr, nobb_nr, fdv_url, skjul, beskrivelse").in("varenr", rader.slice(i, i + 200).map((x) => x.varenr))) as ({ varenr: string; nobb_nr: string; fdv_url: string; skjul: boolean; beskrivelse: string })[];
        for (const v of r) info.set(v.varenr, v);
      }
      return {
        varer: rader.map((x) => { const v = info.get(x.varenr); return { ...x, antall: Number(x.antall), nobb_nr: v?.nobb_nr ?? "", fdv_url: v?.fdv_url ?? "", skjul: v?.skjul ?? false }; }),
        dok: ok(dok) as FdvDok[],
      };
    },
    async lagreVare(varenr, endring) { ok(await sb.from("varer").update(endring).eq("varenr", varenr)); },
    async lastOppFdv(prosjektId, fil, svenn) {
      if (fil.size > 25 * 1024 * 1024) throw new Error("Filen er større enn 25 MB.");
      if (!/pdf|jpeg|png/.test(fil.type)) throw new Error("Bare PDF og bilder (JPG/PNG) kan lastes opp.");
      const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
      const ext = fil.type === "application/pdf" ? "pdf" : fil.type === "image/png" ? "png" : "jpg";
      const sti = `${bedrift}/p-${prosjektId}/${crypto.randomUUID()}.${ext}`;
      ok(await sb.storage.from("dokumenter").upload(sti, fil, { contentType: fil.type }));
      const r = await sb.from("fdv_dok").insert({ prosjekt_id: prosjektId, navn: fil.name, sti, storrelse: fil.size, ...(svenn ?? {}) });
      if (r.error) { await sb.storage.from("dokumenter").remove([sti]); throw r.error; }
    },
    async slettFdv(id, sti) {
      ok(await sb.from("fdv_dok").delete().eq("id", id));
      await sb.storage.from("dokumenter").remove([sti]);
    },
    async dokUrl(sti, lastNed) {
      return (ok(await sb.storage.from("dokumenter").createSignedUrl(sti, 3600, lastNed ? { download: lastNed } : undefined)) as { signedUrl: string }).signedUrl;
    },
    async lagreRapport(r) {
      let sti: string | undefined;
      if (r.fil) {
        if (r.fil.type !== "application/pdf") throw new Error("Rapporten må være en PDF.");
        if (r.fil.size > 25 * 1024 * 1024) throw new Error("Filen er større enn 25 MB.");
        const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
        sti = `${bedrift}/rapporter/${crypto.randomUUID()}.pdf`;
        ok(await sb.storage.from("dokumenter").upload(sti, r.fil, { contentType: "application/pdf" }));
      }
      const rad: Record<string, unknown> = { tittel: r.tittel.trim(), periode: r.periode, ingress: r.ingress.trim(), lenke: r.lenke.trim() };
      if (sti) rad.sti = sti;
      if (r.publiser) rad.publisert = new Date().toISOString();
      const res = r.id ? await sb.from("rapporter").update(rad).eq("id", r.id) : await sb.from("rapporter").insert(rad);
      if (res.error) { if (sti) await sb.storage.from("dokumenter").remove([sti]); throw res.error; }
    },
    async slettRapport(id, sti) {
      ok(await sb.from("rapporter").delete().eq("id", id));
      if (sti) await sb.storage.from("dokumenter").remove([sti]);
    },
    async stemple(handling, o = {}) {
      ok(await sb.rpc("stemple", { handling, prosjekt: o.prosjekt || null, beskrivelse: o.beskrivelse ?? "", lunsj: o.lunsj ?? 0, til: o.til || null }));
    },
    async lagreFravaer(f) {
      const { id, ...rad } = f;
      ok(id ? await sb.from("fravaer").update(rad).eq("id", id) : await sb.from("fravaer").insert(rad));
    },
    async slettFravaer(id) { ok(await sb.from("fravaer").delete().eq("id", id)); },
    async lagreUtstyr(u) {
      const { id, ...rad } = u;
      for (const k of ["kilde", "visma_ordrenr", "kategori_manuell", "bilde_sti"] as const) delete (rad as Record<string, unknown>)[k];
      const r = id ? await sb.from("utstyr").update(rad).eq("id", id).select("id").single() : await sb.from("utstyr").insert(rad).select("id").single();
      return (ok(r) as { id: string }).id;
    },
    async slettUtstyr(id, bilde_sti) {
      ok(await sb.from("utstyr").delete().eq("id", id));
      if (bilde_sti) await sb.storage.from("bilder").remove([bilde_sti]);
    },
    async utstyrBilde(id, fil, gammel) {
      const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
      const sti = `${bedrift}/u-${id}/${crypto.randomUUID()}.jpg`;
      const data = await komprimer(fil);
      ok(await sb.storage.from("bilder").upload(sti, data, { contentType: data.type || "image/jpeg" }));
      const r = await sb.from("utstyr").update({ bilde_sti: sti }).eq("id", id);
      if (r.error) { await sb.storage.from("bilder").remove([sti]); throw r.error; }
      if (gammel) await sb.storage.from("bilder").remove([gammel]);
    },
    async settUtstyrKvoter(kvoter) { ok(await sb.rpc("sett_utstyr_kvoter", { kvoter })); },
    async svennKoblinger() { return (ok(await sb.from("svenn_kobling").select("nokkel, prosjekt_id, fakturerbar")) ?? []) as { nokkel: string; prosjekt_id: string | null; fakturerbar: boolean }[]; },
    async svennProsjekter(koblinger) { return (ok(await sb.rpc("svenn_prosjekter", { koblinger })) ?? {}) as Record<string, string>; },
    async svennImporterteFiler() {
      const [b, f] = await Promise.all([
        sb.from("bilder").select("svenn_id").not("svenn_id", "is", null).limit(20000),
        sb.from("fdv_dok").select("svenn_id").not("svenn_id", "is", null).limit(20000)]);
      return new Set([...(ok(b) as { svenn_id: number }[]), ...(ok(f) as { svenn_id: number }[])].map((x) => Number(x.svenn_id)));
    },
    async importerSvenn(koblinger, rader) { return ok(await sb.rpc("importer_svenn", { koblinger, rader })) as SvennResultat; },
    async settUtstyrGrenser(arbeidstoy, verktoy, sammeMnd) { ok(await sb.rpc("sett_utstyr_grenser", { arbeidstoy, verktoy, samme_mnd: sammeMnd })); },
    async markerLest(id) { ok(await sb.rpc("marker_lest", { rapport: id })); },
    async settMaal(aar) { ok(await sb.rpc("sett_maal", { aar })); },
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
