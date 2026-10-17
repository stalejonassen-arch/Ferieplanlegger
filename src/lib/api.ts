// Datalaget. Med Supabase-nøkler i .env brukes ekte database; uten nøkler
// starter appen i demomodus med eksempeldata, så den kan prøves uten oppsett.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ansatt, Avdeling, Data, Kampanje, Soknad, Status, Tema } from "./ferie";
import { demoApi } from "./demo";
import type { NyTime, Prosjekt } from "./timer";
import type { NyRapport } from "./rapport";
import type { FravaerType } from "./fravaer";
import { STANDARD_KVOTER, type Kvoter, type Utstyr } from "./utstyr";
import type { Kompetanse } from "./kompetanse";
import type { Lest, Melding } from "./chat";
import type { Kobling, importRader } from "./svenn";
import type { LeveranseStatus, NyLeveranse, NyOppgave, NyttMateriale, OppgaveStatus } from "./plan";
import type { Bestilling, BestillingStatus, Bestillingslinje, Punkt, Risiko } from "./kvalitet";
import { komprimer, type NyttAvvik, type Dagbok, type Tillegg } from "./hms";

export interface ProsjektOrdre { visma_ordrenr: number; ordredato: string | null; ordretype: number; transaksjonstype: number; navn: string; sum_netto: number; kostnad: number; dekningsbidrag: number; fakturert: number; ferdig: string | null }
/** Vare brukt på prosjektet (fra Visma) med FDV-lenke */
export interface FdvVare { varenr: string; beskrivelse: string; antall: number; enhet: string; nobb_nr: string; fdv_url: string; skjul: boolean; sist_dato?: string | null }
/** Eget FDV-dokument lastet opp på prosjektet */
export type DokKategori = "fdv" | "sjekkliste" | "tegning" | "kontrakt" | "annet";
export interface FdvDok { id: string; navn: string; sti: string; storrelse: number | null; opprettet: string; kategori?: DokKategori; ansatt_id?: string }
/** Lenke til varen hos NOBB. Fanen «Dokumentasjon» der har FDV, produktdatablad og monteringsanvisning. */
export const nobbLenke = (nr: string) => `https://www.nobb.no/item/${nr}`;
export type BildeMaal = { prosjekt_id?: string | null; avvik_id?: string | null; dagbok_id?: string | null; tillegg_id?: string | null; sjekkliste_id?: string | null; sjekkliste_punkt?: number | null; tekst?: string; svenn_id?: number; opprettet?: string };
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
  /** Leder: slå et prosjekt laget i appen sammen med prosjektet fra Visma (alt flyttes, app-prosjektet slettes) */
  kobleProsjekt(fra: string, til: string): Promise<void>;
  /** Slår «fra» inn i «til»: alt flyttes, «fra» forsvinner fra listene */
  slaaSammenProsjekter(fra: string, til: string): Promise<void>;
  /** Leder: merk prosjektet som fastpris (holdes utenfor sammenligning av fakturerte timer) */
  settFastpris(id: string, fastpris: boolean): Promise<void>;
  /** Leder: merk prosjektet som ferdig fakturert (alle fakturerbare timer teller som fakturert) */
  settFakturertFull(id: string, full: boolean): Promise<void>;
  /** Leder: eiendomsdata til Boligmappa (matrikkel, bruksenhet, fag) */
  lagreEiendom(id: string, e: Partial<Pick<Prosjekt, "adresse" | "kommunenr" | "kommune" | "gnr" | "bnr" | "fnr" | "snr" | "bruksenhet" | "boligmappe_nr" | "fag" | "kontakt_navn" | "kontakt_telefon" | "selger_id" | "snekker_id" | "adresse_manuell">>): Promise<void>;
  /** Mitt språk i appen */
  settMittSprak(sprak: "nb" | "pl"): Promise<void>;
  settMittTema(tema: Tema): Promise<void>;
  /** Arbeidsplan: leder deler ut arbeid, den som har fått det endrer status */
  lagreOppgave(o: NyOppgave): Promise<void>;
  slettOppgave(id: string): Promise<void>;
  settOppgaveStatus(id: string, status: OppgaveStatus): Promise<void>;
  /** Materialliste delt i leveranser */
  lagreLeveranse(l: NyLeveranse): Promise<void>;
  slettLeveranse(id: string): Promise<void>;
  settLeveranseStatus(id: string, status: LeveranseStatus): Promise<void>;
  lagreMaterialer(m: NyttMateriale[]): Promise<void>;
  slettMateriale(id: string): Promise<void>;
  settMaterialeLevert(id: string, levert: boolean): Promise<void>;
  flyttMaterialer(ider: string[], leveranseId: string | null): Promise<void>;
  /** Sjekklister (egenkontroll) */
  nySjekkliste(prosjektId: string, navn: string, mal: string, punkter: string[]): Promise<string>;
  lagreSjekkliste(id: string, x: { navn?: string; punkter?: Punkt[]; status?: "pagaar" | "signert" }): Promise<void>;
  slettSjekkliste(id: string): Promise<void>;
  /** SJA */
  lagreSja(x: { id?: string; prosjekt_id: string; dato: string; arbeid: string; risikoer: Risiko[]; verneutstyr: string; deltakere: string[] }): Promise<void>;
  kvitterSja(id: string): Promise<void>;
  slettSja(id: string): Promise<void>;
  /** HMS-kort: den ansatte selv */
  lagreMittHmsKort(nr: string, gyldig: string | null): Promise<void>;
  /** Bestilling fra byggeplassen */
  bestill(x: { id?: string; prosjekt_id: string; onsket_dato: string | null; merknad: string; linjer: Bestillingslinje[] }): Promise<void>;
  settBestillingStatus(id: string, status: BestillingStatus, svar?: string): Promise<void>;
  slettBestilling(id: string): Promise<void>;
  /** Lager en leveranse i materiallisten av bestillingen */
  bestillingTilLeveranse(b: Bestilling, navn: string): Promise<void>;
  /** Leder: lagre kampanje (DM). nyeSider legges til bak eksisterende, fjern = stier som tas bort. */
  lagreKampanje(k: Partial<Kampanje> & { tittel: string; fra: string; til: string }, nyeSider?: Blob[], fjern?: string[]): Promise<void>;
  slettKampanje(id: string, sider: string[]): Promise<void>;
  /** Push-varsler: meld på/av denne enheten */
  lagrePush(endpoint: string, p256dh: string, auth: string): Promise<void>;
  slettPush(endpoint: string): Promise<void>;
  /** Mitt valg: vis kampanjer i appen eller ikke */
  settVisKampanjer(vis: boolean): Promise<void>;
  /** Skjul én kampanje for meg */
  skjulKampanje(id: string): Promise<void>;
  /** Meldinger (chat): alle kanaler jeg kan se, siste ~3000 */
  meldinger(): Promise<Melding[]>;
  kanalLest(): Promise<Lest>;
  sendMelding(kanal: string, tekst: string, bilde?: File | null): Promise<void>;
  rettMelding(id: string, tekst: string): Promise<void>;
  slettMelding(id: string, bildeSti: string | null): Promise<void>;
  markerKanalLest(kanal: string): Promise<void>;
  /** Lytt på nye/endrede meldinger */
  abonnerMeldinger(cb: () => void): () => void;
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
  lastOppFdv(prosjektId: string, fil: File, svenn?: { svenn_id: number; opprettet: string }, kategori?: DokKategori): Promise<void>;
  /** Endre kategori på et prosjektdokument */
  settDokKategori(id: string, kategori: DokKategori): Promise<void>;
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
  /** Kurs/kompetansebevis: lagre (ny eller endret), med kopi av beviset (bilde/PDF) */
  lagreKompetanse(k: Partial<Kompetanse> & { ansatt_id: string; type: string }, fil?: File | null): Promise<void>;
  slettKompetanse(id: string, sti: string | null): Promise<void>;
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
  settOmsetningsmaal(belop: number | null): Promise<void>;
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
  /** Brukes fila av et annet kurs/bevis? (felles kompetansebevis for flere klasser) */
  const stiIBruk = async (sti: string) => ((await sb.from("kompetanse").select("id").eq("sti", sti).limit(1)).data ?? []).length > 0;
  const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
  /** Supabase gir maks 1000 rader per kall: hent side for side til alt er med */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alle = async (lag: () => any, maks = 50000): Promise<{ data: any[]; error: unknown }> => {
    const ut: unknown[] = [];
    for (let fra = 0; fra < maks; fra += 1000) {
      const r = await lag().range(fra, fra + 999);
      if (r.error) return { data: [], error: r.error };
      ut.push(...(r.data ?? []));
      if (!r.data || r.data.length < 1000) break;
    }
    return { data: ut, error: null };
  };
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
      const [avdelinger, ansatte, ferieaar, soknader, kunder, prosjekter, timer, avvik, bilder, dagbok, tillegg, bedrift, rapporter, lest, stempling, fravaer, ordrer, fakt, utstyr, kompetanse, omsetning, kampanjer, oppgaver, leveranser, materialer, sjekklister, sjaer, bestillinger] = await Promise.all([
        sb.from("avdelinger").select("*").order("rekkefolge"),
        sb.from("ansatte").select("*"),
        sb.from("ferieaar").select("*"),
        sb.from("soknader").select("*").order("fra"),
        sb.from("kunder").select("*").order("navn"),
        alle(() => sb.from("prosjekter").select("*").order("visma_nr", { ascending: false, nullsFirst: true }).order("id")),
        alle(() => sb.from("timer").select("*").gte("dato", fraDato).order("dato").order("fra").order("id")),
        alle(() => sb.from("avvik").select("*").order("opprettet", { ascending: false }).order("id"), 5000),
        alle(() => sb.from("bilder").select("*").order("opprettet", { ascending: false }).order("id"), 10000),
        alle(() => sb.from("dagbok").select("*").order("dato", { ascending: false }).order("opprettet", { ascending: false }).order("id"), 10000),
        sb.from("tillegg").select("*").order("opprettet", { ascending: false }).limit(2000),
        sb.from("bedrifter").select("*").limit(1),
        sb.from("rapporter").select("id, tittel, periode, ingress, lenke, sti, publisert, opprettet").order("periode", { ascending: false }).limit(200),
        alle(() => sb.from("rapport_lest").select("rapport_id, ansatt_id, lest").order("rapport_id").order("ansatt_id"), 10000),
        sb.from("stempling").select("ansatt_id, prosjekt_id, dato, fra, startet"),
        alle(() => sb.from("fravaer").select("id, ansatt_id, type, fra, til, grad, merknad, opprettet").order("fra", { ascending: false }).order("id"), 10000),
        alle(() => sb.from("prosjekt_ordre").select("visma_ordrenr, prosjekt_id, kunde_nr, transaksjonstype, ordretype, fakturert, kostnad, ordredato, ferdig").order("visma_ordrenr"), 20000),
        alle(() => sb.from("fakturerte_timer").select("visma_ordrenr, linjenr, ordredato, fakturadato, fakturanr, kunde_id, prosjekt_id, antall, fakturert, ikke_fakturert, pris").order("visma_ordrenr").order("linjenr"), 20000),
        alle(() => sb.from("utstyr").select("id, ansatt_id, kilde, visma_ordrenr, dato, varenr, nobb_nr, beskrivelse, antall, enhet, pris, kategori, kategori_manuell, serienr, bilde_sti, status, merknad, bytte_avklart").order("dato", { ascending: false }).order("id"), 20000),
        sb.from("kompetanse").select("*").order("gyldig_til", { ascending: true, nullsFirst: false }).limit(5000),
        sb.from("omsetning_mnd").select("aar, mnd, belop, oppdatert").order("aar").order("mnd"),
        sb.from("kampanjer").select("id, tittel, tekst, fra, til, lenke, sider, opprettet").order("fra", { ascending: false }).limit(100),
        alle(() => sb.from("oppgaver").select("id, prosjekt_id, tittel, beskrivelse, fra, til, ansatte, rekkefolge, status, opprettet_av, ferdig_tid").order("fra").order("id"), 20000),
        alle(() => sb.from("leveranser").select("id, prosjekt_id, navn, rekkefolge, dato, status, leverandor, notat").order("rekkefolge").order("id"), 20000),
        alle(() => sb.from("materialer").select("id, prosjekt_id, leveranse_id, rekkefolge, varenr, nobb_nr, beskrivelse, antall, enhet, notat, levert").order("rekkefolge").order("id"), 50000),
        alle(() => sb.from("sjekklister").select("*").order("opprettet").order("id"), 20000),
        alle(() => sb.from("sja").select("*").order("dato", { ascending: false }).order("id"), 20000),
        alle(() => sb.from("bestillinger").select("*").order("opprettet", { ascending: false }).order("id"), 20000),
      ]);
      const b0 = (bedrift.data as any[])?.[0] ?? {};
      return {
        avdelinger: ok(avdelinger), ansatte: ok(ansatte), ferieaar: ok(ferieaar), soknader: ok(soknader),
        // Prosjekter som er slått inn i et annet vises ikke
        kunder: ok(kunder), prosjekter: (ok(prosjekter) as Prosjekt[]).filter((p) => !p.slatt_sammen_med), avvik: ok(avvik), bilder: ok(bilder), dagbok: ok(dagbok),
        tillegg: (ok(tillegg) as Tillegg[]).map((t) => ({ ...t, timer: t.timer == null ? null : Number(t.timer), pris: t.pris == null ? null : Number(t.pris) })),
        rapporter: rapporter.error ? [] : rapporter.data, lest: lest.error ? [] : lest.data,
        fravaer: fravaer.error ? [] : fravaer.data,
        ordrer: ordrer.error ? [] : (ordrer.data as any[]).map((o) => ({ ...o, fakturert: Number(o.fakturert), kostnad: Number(o.kostnad), transaksjonstype: Number(o.transaksjonstype), ordretype: Number(o.ordretype), kunde_nr: o.kunde_nr == null ? null : Number(o.kunde_nr) })),
        egetKundenr: b0.eget_kundenr == null ? null : Number(b0.eget_kundenr),
        timepris: b0.timepris == null ? null : Number(b0.timepris),
        fakturerteTimer: fakt.error ? [] : (fakt.data as any[]).map((x) => ({ ...x, antall: Number(x.antall), fakturert: Number(x.fakturert), ikke_fakturert: Number(x.ikke_fakturert), pris: Number(x.pris) })),
        kompetanse: kompetanse.error ? [] : kompetanse.data,
        omsetning: omsetning.error ? [] : (omsetning.data as any[]).map((x) => ({ ...x, belop: Number(x.belop) })),
        maalOmsetning: b0.maal_omsetning_aar == null ? null : Number(b0.maal_omsetning_aar),
        kampanjer: kampanjer.error ? [] : kampanjer.data,
        // Tomme lister hvis databasen ikke har arbeidsplanen ennå
        oppgaver: oppgaver.error ? [] : oppgaver.data,
        leveranser: leveranser.error ? [] : leveranser.data,
        materialer: materialer.error ? [] : (materialer.data as any[]).map((m) => ({ ...m, antall: Number(m.antall) })),
        sjekklister: sjekklister.error ? [] : sjekklister.data,
        sja: sjaer.error ? [] : sjaer.data,
        bestillinger: bestillinger.error ? [] : bestillinger.data,
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
        .on("postgres_changes", { event: "*", schema: "public", table: "oppgaver" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "leveranser" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "materialer" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "sjekklister" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "sja" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "bestillinger" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "avvik" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "bilder" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "kampanjer" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "dagbok" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "tillegg" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "rapporter" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "rapport_lest" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "stempling" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "fravaer" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "utstyr" }, snart)
        .on("postgres_changes", { event: "*", schema: "public", table: "kompetanse" }, snart)
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
        ...(til.sjekkliste_id ? { sjekkliste_id: til.sjekkliste_id, sjekkliste_punkt: til.sjekkliste_punkt ?? null } : {}),
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
        sb.from("prosjekt_vare").select("varenr, beskrivelse, antall, enhet, sist_dato").eq("prosjekt_id", prosjektId).order("sist_dato", { ascending: false, nullsFirst: false }).order("beskrivelse"),
        sb.from("fdv_dok").select("*").eq("prosjekt_id", prosjektId).order("opprettet"),
      ]);
      const rader = ok(pv) as { varenr: string; beskrivelse: string; antall: number; enhet: string; sist_dato: string | null }[];
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
    async lastOppFdv(prosjektId, fil, svenn, kategori) {
      if (fil.size > 25 * 1024 * 1024) throw new Error("Filen er større enn 25 MB.");
      const ext = (fil.name.match(/\.(\w+)$/)?.[1] ?? "").toLowerCase();
      const typer: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel" };
      const type = typer[ext] ?? (Object.values(typer).includes(fil.type) ? fil.type : "");
      if (!type) throw new Error("Kan bare laste opp PDF, bilder (JPG/PNG), Word og Excel.");
      const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
      const sti = `${bedrift}/p-${prosjektId}/${crypto.randomUUID()}.${ext || "pdf"}`;
      ok(await sb.storage.from("dokumenter").upload(sti, fil, { contentType: type }));
      const r = await sb.from("fdv_dok").insert({ prosjekt_id: prosjektId, navn: fil.name, sti, storrelse: fil.size, ...(kategori ? { kategori } : {}), ...(svenn ?? {}) });
      if (r.error) { await sb.storage.from("dokumenter").remove([sti]); throw r.error; }
    },
    async settDokKategori(id, kategori) { ok(await sb.from("fdv_dok").update({ kategori }).eq("id", id)); },
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
    async lagreKompetanse(k, fil) {
      let sti: string | undefined; let filnavn: string | undefined;
      if (fil) {
        if (fil.size > 25 * 1024 * 1024) throw new Error("Filen er større enn 25 MB.");
        const ext = (fil.name.match(/\.(\w+)$/)?.[1] ?? "").toLowerCase();
        const type = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : /jpe?g/.test(ext) ? "image/jpeg" : fil.type;
        if (!/^(application\/pdf|image\/(jpeg|png))$/.test(type)) throw new Error("Last opp beviset som bilde (JPG/PNG) eller PDF.");
        const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
        const data = type.startsWith("image/") ? await komprimer(fil) : fil;
        sti = `${bedrift}/k-${k.ansatt_id}/${crypto.randomUUID()}.${type === "application/pdf" ? "pdf" : "jpg"}`;
        filnavn = fil.name;
        ok(await sb.storage.from("dokumenter").upload(sti, data, { contentType: type === "application/pdf" ? type : "image/jpeg" }));
      }
      const { id, opprettet: _o, ...rad } = k;
      const r = id ? await sb.from("kompetanse").update({ ...rad, ...(sti ? { sti, filnavn } : {}) }).eq("id", id)
        : await sb.from("kompetanse").insert({ ...rad, ...(sti ? { sti, filnavn } : {}) });
      if (r.error) { if (sti) await sb.storage.from("dokumenter").remove([sti]); throw r.error; }
      if (id && sti && k.sti && !(await stiIBruk(k.sti))) await sb.storage.from("dokumenter").remove([k.sti]);
    },
    async slettKompetanse(id, sti) {
      ok(await sb.from("kompetanse").delete().eq("id", id));
      // Et felles bevis (f.eks. ett kompetansebevis for flere kran-/truckklasser) slettes først når ingen bruker det
      if (sti && !(await stiIBruk(sti))) await sb.storage.from("dokumenter").remove([sti]);
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
        alle(() => sb.from("bilder").select("svenn_id").not("svenn_id", "is", null).order("svenn_id")),
        alle(() => sb.from("fdv_dok").select("svenn_id").not("svenn_id", "is", null).order("svenn_id"))]);
      return new Set([...(ok(b) as { svenn_id: number }[]), ...(ok(f) as { svenn_id: number }[])].map((x) => Number(x.svenn_id)));
    },
    async importerSvenn(koblinger, rader) { return ok(await sb.rpc("importer_svenn", { koblinger, rader })) as SvennResultat; },
    async settUtstyrGrenser(arbeidstoy, verktoy, sammeMnd) { ok(await sb.rpc("sett_utstyr_grenser", { arbeidstoy, verktoy, samme_mnd: sammeMnd })); },
    async markerLest(id) { ok(await sb.rpc("marker_lest", { rapport: id })); },
    async settMaal(aar) { ok(await sb.rpc("sett_maal", { aar })); },
    async settOmsetningsmaal(belop) { ok(await sb.rpc("sett_omsetningsmaal", { belop })); },
    async vismaStatus() {
      const r = await sb.from("visma_sync_logg").select("tid, ok, melding").order("id", { ascending: false }).limit(1);
      return r.data?.[0] ?? null;
    },
    async settMittSprak(sprak) { ok(await sb.rpc("sett_mitt_sprak", { sprak })); },
    async settMittTema(tema) { ok(await sb.rpc("sett_mitt_tema", { tema })); },
    async lagreOppgave(o) {
      const rad = { prosjekt_id: o.prosjekt_id, tittel: o.tittel.trim(), beskrivelse: o.beskrivelse.trim(), fra: o.fra, til: o.til, ansatte: o.ansatte, ...(o.rekkefolge != null ? { rekkefolge: o.rekkefolge } : {}) };
      ok(o.id ? await sb.from("oppgaver").update(rad).eq("id", o.id) : await sb.from("oppgaver").insert(rad));
    },
    async slettOppgave(id) { ok(await sb.from("oppgaver").delete().eq("id", id)); },
    async settOppgaveStatus(id, status) { ok(await sb.from("oppgaver").update({ status }).eq("id", id)); },
    async lagreLeveranse(l) {
      const rad = { prosjekt_id: l.prosjekt_id, navn: l.navn.trim(), dato: l.dato || null, leverandor: l.leverandor.trim(), notat: l.notat.trim(),
        ...(l.rekkefolge != null ? { rekkefolge: l.rekkefolge } : {}), ...(l.status ? { status: l.status } : {}) };
      ok(l.id ? await sb.from("leveranser").update(rad).eq("id", l.id) : await sb.from("leveranser").insert(rad));
    },
    async slettLeveranse(id) { ok(await sb.from("leveranser").delete().eq("id", id)); },
    async settLeveranseStatus(id, status) { ok(await sb.from("leveranser").update({ status }).eq("id", id)); },
    async lagreMaterialer(liste) {
      for (const m of liste) {
        const rad = { prosjekt_id: m.prosjekt_id, leveranse_id: m.leveranse_id, beskrivelse: m.beskrivelse.trim(), antall: m.antall, enhet: m.enhet.trim(),
          varenr: (m.varenr ?? "").trim(), nobb_nr: (m.nobb_nr ?? "").trim(), notat: (m.notat ?? "").trim(), ...(m.rekkefolge != null ? { rekkefolge: m.rekkefolge } : {}) };
        ok(m.id ? await sb.from("materialer").update(rad).eq("id", m.id) : await sb.from("materialer").insert(rad));
      }
    },
    async slettMateriale(id) { ok(await sb.from("materialer").delete().eq("id", id)); },
    async settMaterialeLevert(id, levert) { ok(await sb.from("materialer").update({ levert }).eq("id", id)); },
    async flyttMaterialer(ider, leveranseId) { if (ider.length) ok(await sb.from("materialer").update({ leveranse_id: leveranseId }).in("id", ider)); },
    async nySjekkliste(prosjekt_id, navn, mal, punkter) {
      const r = await sb.from("sjekklister").insert({ prosjekt_id, navn: navn.trim(), mal, punkter: punkter.map((tekst) => ({ tekst, svar: null, kommentar: "" })) }).select("id").single();
      return (ok(r) as { id: string }).id;
    },
    async lagreSjekkliste(id, x) { ok(await sb.from("sjekklister").update(x).eq("id", id)); },
    async slettSjekkliste(id) { ok(await sb.from("sjekklister").delete().eq("id", id)); },
    async lagreSja(x) {
      const { id, ...rad } = x;
      ok(id ? await sb.from("sja").update(rad).eq("id", id) : await sb.from("sja").insert(rad));
    },
    async kvitterSja(id) { ok(await sb.rpc("kvitter_sja", { sja_id: id })); },
    async slettSja(id) { ok(await sb.from("sja").delete().eq("id", id)); },
    async lagreMittHmsKort(nr, gyldig) { ok(await sb.rpc("lagre_mitt_hms_kort", { nr, gyldig })); },
    async bestill(x) {
      const { id, ...rad } = x;
      ok(id ? await sb.from("bestillinger").update(rad).eq("id", id) : await sb.from("bestillinger").insert(rad));
    },
    async settBestillingStatus(id, status, svar) { ok(await sb.from("bestillinger").update({ status, ...(svar != null ? { svar } : {}) }).eq("id", id)); },
    async slettBestilling(id) { ok(await sb.from("bestillinger").delete().eq("id", id)); },
    async bestillingTilLeveranse(b, navn) {
      const lev = ok(await sb.from("leveranser").insert({ prosjekt_id: b.prosjekt_id, navn, dato: b.onsket_dato, leverandor: "Eget lager", notat: b.merknad, status: "bestilt" }).select("id").single()) as { id: string };
      ok(await sb.from("materialer").insert(b.linjer.map((l, i) => ({ prosjekt_id: b.prosjekt_id, leveranse_id: lev.id, beskrivelse: l.beskrivelse, antall: l.antall, enhet: l.enhet, nobb_nr: l.nobb ?? "", varenr: l.nobb ?? "", rekkefolge: i }))));
      ok(await sb.from("bestillinger").update({ leveranse_id: lev.id, ...(b.status === "ny" ? { status: "plukkes" } : {}) }).eq("id", b.id));
    },
    async lagreKampanje(k, nyeSider = [], fjern = []) {
      const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
      const lastet: string[] = [];
      try {
        for (const b of nyeSider) {
          const sti = `${bedrift}/kampanjer/${crypto.randomUUID()}.jpg`;
          ok(await sb.storage.from("bilder").upload(sti, b, { contentType: b.type || "image/jpeg" }));
          lastet.push(sti);
        }
        const sider = [...(k.sider ?? []).filter((s) => !fjern.includes(s)), ...lastet];
        const rad = { tittel: k.tittel, tekst: k.tekst ?? "", fra: k.fra, til: k.til, lenke: k.lenke || null, sider };
        ok(k.id ? await sb.from("kampanjer").update(rad).eq("id", k.id) : await sb.from("kampanjer").insert(rad));
      } catch (e) {
        if (lastet.length) await sb.storage.from("bilder").remove(lastet);
        throw e;
      }
      if (fjern.length) await sb.storage.from("bilder").remove(fjern);
    },
    async slettKampanje(id, sider) {
      ok(await sb.from("kampanjer").delete().eq("id", id));
      if (sider.length) await sb.storage.from("bilder").remove(sider);
    },
    async settVisKampanjer(vis) { ok(await sb.rpc("sett_vis_kampanjer", { vis })); },
    async lagrePush(endpoint, p256dh, auth) { ok(await sb.rpc("lagre_push", { endpoint, p256dh, auth })); },
    async slettPush(endpoint) { ok(await sb.rpc("slett_push", { endpoint })); },
    async skjulKampanje(kampanje) { ok(await sb.rpc("skjul_kampanje", { kampanje })); },
    async meldinger() {
      const r = await sb.from("meldinger").select("id, ansatt_id, kanal, tekst, bilde_sti, opprettet, endret").order("opprettet", { ascending: false }).limit(3000);
      return r.error ? [] : (r.data as Melding[]).reverse();
    },
    async kanalLest() {
      const r = await sb.from("kanal_lest").select("kanal, lest");
      return r.error ? {} : Object.fromEntries((r.data as { kanal: string; lest: string }[]).map((x) => [x.kanal, x.lest]));
    },
    async sendMelding(kanal, tekst, bilde) {
      let bilde_sti: string | null = null;
      if (bilde) {
        const bedrift = (ok(await sb.rpc("min_bedrift")) as number) ?? 1;
        bilde_sti = `${bedrift}/chat/${crypto.randomUUID()}.jpg`;
        const data = await komprimer(bilde);
        ok(await sb.storage.from("bilder").upload(bilde_sti, data, { contentType: data.type || "image/jpeg" }));
      }
      const r = await sb.from("meldinger").insert({ kanal, tekst: tekst.trim(), bilde_sti });
      if (r.error && bilde_sti) await sb.storage.from("bilder").remove([bilde_sti]);
      ok(r);
    },
    async rettMelding(id, tekst) { ok(await sb.from("meldinger").update({ tekst: tekst.trim() }).eq("id", id)); },
    async slettMelding(id, bildeSti) {
      ok(await sb.from("meldinger").delete().eq("id", id));
      if (bildeSti) await sb.storage.from("bilder").remove([bildeSti]);
    },
    async markerKanalLest(kanal) { await sb.rpc("marker_kanal_lest", { k: kanal }); },
    abonnerMeldinger(cb) {
      const ch = sb.channel("meldinger").on("postgres_changes", { event: "*", schema: "public", table: "meldinger" }, () => cb()).subscribe();
      return () => { sb.removeChannel(ch); };
    },
    async settFakturertFull(id, full) { ok(await sb.from("prosjekter").update({ fakturert_full: full }).eq("id", id)); },
    async lagreEiendom(id, e) { ok(await sb.from("prosjekter").update(e).eq("id", id)); },
    async settFastpris(id, fastpris) { ok(await sb.from("prosjekter").update({ fastpris }).eq("id", id)); },
    async kobleProsjekt(fra, til) { ok(await sb.rpc("koble_prosjekt", { fra, til })); },
    async slaaSammenProsjekter(fra, til) { ok(await sb.rpc("slaa_sammen_prosjekter", { fra, til })); },
    async lagreProsjekt(p, nyKunde) {
      // Kunden røres bare hvis den er oppgitt (eller en ny kunde opprettes) – ellers beholdes den
      const kunde: { kunde_id?: string | null } = "kunde_id" in p ? { kunde_id: p.kunde_id ?? null } : {};
      if (nyKunde?.trim()) kunde.kunde_id = (ok(await sb.from("kunder").insert({ navn: nyKunde.trim() }).select("id").single()) as { id: string }).id;
      const { id, ...rad } = { ...p, ...kunde };
      ok(id ? await sb.from("prosjekter").update(rad).eq("id", id) : await sb.from("prosjekter").insert(rad));
    },
  };
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** «?demo» i adressen gir en prøveversjon med eksempeldata – ingenting lagres i den ekte databasen. «?demo=av» går tilbake. */
function demoValgt(): boolean {
  try {
    // Delbar demo-lenke /demo/<kode>: alltid demo, og adressen beholdes så den kan deles videre
    const m = location.pathname.match(/^\/demo\/([a-z0-9-]+)\/?$/i);
    if (m) { sessionStorage.setItem("bygglogg-demo", m[1]!.toLowerCase()); return true; }
    const q = new URLSearchParams(location.search);
    if (q.has("demo")) {
      if (q.get("demo") === "av") sessionStorage.removeItem("bygglogg-demo"); else sessionStorage.setItem("bygglogg-demo", q.get("demo") || "1");
      // På bygglogg.app beholdes «?demo», ellers viser en ny lasting hjemmesiden i stedet for demoen
      if (!/(^|\.)bygglogg\.app$/.test(location.hostname) || location.hostname.startsWith("austnes.")) history.replaceState(null, "", location.pathname + location.hash);
    }
    return !!sessionStorage.getItem("bygglogg-demo");
  } catch { return false; }
}

export const api: Api = url && key && !demoValgt() ? supabaseApi(createClient(url, key)) : demoApi();
export type { Soknad };
