// Kjører migreringen i en ekte Postgres (PGlite) og sjekker tilgangsreglene.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const STALE = "stale.jonassen@austnes.no";
const JIM = "jim@example.no";
const MADS = "mads@example.no";

// Kjør en spørring som en innlogget bruker med gitt e-post (eller anonym)
async function as<T = any>(email: string | null, sql: string, params: any[] = []) {
  const role = email ? "authenticated" : "anon";
  const claims = JSON.stringify(email ? { email, role } : { role });
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role ${role};`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.jwt() to anon, authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/0001_init.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0002_feriedager_man_fre.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0003_kalenderabonnement.sql", "utf8"));
  // 0004 uten utvidelsene (pg_net/pg_cron finnes ikke i testdatabasen): stubb net.http_post og hopp over cron
  await db.exec(`create schema net; create table net.kall (body jsonb);
    create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as
      $$ insert into net.kall values (body); select 1::bigint $$;
    grant usage on schema net to authenticated; grant insert on net.kall to authenticated;`);
  const v = readFileSync("supabase/migrations/0004_varsler.sql", "utf8")
    .replace(/create extension[^;]*;/g, "").replace(/select cron\.schedule\([\s\S]*$/, "");
  await db.exec(v);
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0005_bygglogg_timer.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0007_bilder_avvik.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0008_prosjektstyring.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0009_fdv.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0010_maal_aar.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0011_rapporter.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0012_timer_synlig.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0013_timerapport.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0014_ansattnr.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0015_stempling.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0016_fravaer.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0017_stempling_samme_prosjekt.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0018_utstyr.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0019_utstyr_kvoter.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0020_svenn_import.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0021_svenn_dokumentasjon.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0022_fakturerte_timer.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0023_faktura_kunde.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0024_fastpris.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0025_fastpris_beregning.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0026_fakturert_full.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0027_sprak.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0028_boligmappa.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0029_manuell_vare.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0030_dokumenter.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0031_kompetanse.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0032_tema.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0033_chat.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0034_tema_byggfag.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0035_tema_standard_byggfag.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0036_tema_bfportal.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0037_omsetning.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0038_kampanjer.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0039_push.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0040_stemplet_varsel.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0041_koble_prosjekt.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0042_ansatte_nytt_prosjekt.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0043_prosjekt_kontakt.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0044_prosjekt_vare_dato.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0045_prosjekt_selger_snekker.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0046_adresse_manuell.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0047_slaa_sammen_prosjekter.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0048_arbeidsplan_materiell.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0049_oppgave_push.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0050_kvalitet_hms_bestilling.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0051_moduler.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0052_reklamasjon.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0053_logo_drakt.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0054_tillegg_timer.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0055_oppgave_helg.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0056_personrapport.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0057_sikring_push_oversikt.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0058_stemple_uten_nett.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0059_reklamasjon_oppsett.sql", "utf8"));
  await db.exec("create table auth.users (email text, last_sign_in_at timestamptz)");
  await db.exec(readFileSync("supabase/migrations/0060_invitasjon.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0061_avdeling_salg.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0062_serviceoppdrag.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0063_sprak_engelsk_litauisk.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0064_tilbud.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0065_ukesjekk.sql", "utf8"));
  await db.exec(`
    update public.ansatte set epost='${JIM}' where navn='Jim Kato';
    update public.ansatte set epost='${MADS}' where navn='Mads Kjerstad';
  `);
});

const idOf = async (navn: string) =>
  (await db.query<{ id: string }>("select id from public.ansatte where navn=$1", [navn])).rows[0].id;

describe("tilgang", () => {
  it("anonyme og ukjente ser ingenting", async () => {
    await expect(as(null, "select * from public.ansatte")).rejects.toThrow();
    expect(await as("fremmed@example.no", "select * from public.ansatte")).toHaveLength(0);
    expect(await as("fremmed@example.no", "select * from public.soknader")).toHaveLength(0);
  });

  it("ansatt ser alle ansatte, men kan ikke endre dem", async () => {
    expect(await as(JIM, "select * from public.ansatte")).toHaveLength(9);
    const r = await as(JIM, "update public.ansatte set rolle='leder' where epost=$1 returning id", [JIM]);
    expect(r).toHaveLength(0);
  });

  it("ansatt kan søke for seg selv, ikke for andre, og kan ikke godkjenne selv", async () => {
    const jim = await idOf("Jim Kato");
    const mads = await idOf("Mads Kjerstad");
    const [s] = await as<any>(JIM,
      "insert into public.soknader (ansatt_id, fra, til, status) values ($1,'2027-07-05','2027-07-24','godkjent') returning *", [jim]);
    expect(s.status).toBe("venter");
    await expect(as(JIM,
      "insert into public.soknader (ansatt_id, fra, til) values ($1,'2027-08-02','2027-08-07')", [mads])).rejects.toThrow();
    const upd = await as<any>(JIM, "update public.soknader set status='godkjent' where id=$1 returning status", [s.id]);
    expect(upd[0].status).toBe("venter");
  });

  it("overlappende søknad for samme person avvises", async () => {
    const jim = await idOf("Jim Kato");
    await expect(as(JIM,
      "insert into public.soknader (ansatt_id, fra, til) values ($1,'2027-07-20','2027-07-30')", [jim])).rejects.toThrow(/overlapper/);
  });

  it("leder godkjenner, og ansatt kan da ikke trekke eller endre", async () => {
    const jim = await idOf("Jim Kato");
    const stale = await idOf("Ståle");
    const [s] = await as<any>(STALE,
      "update public.soknader set status='godkjent', kommentar='God ferie' where ansatt_id=$1 returning *", [jim]);
    expect(s.status).toBe("godkjent");
    expect(s.behandlet_av).toBe(stale);
    expect(await as(JIM, "delete from public.soknader where id=$1 returning id", [s.id])).toHaveLength(0);
    expect(await as(JIM, "update public.soknader set til='2027-07-31' where id=$1 returning id", [s.id])).toHaveLength(0);
    expect(await as(MADS, "select * from public.soknader")).toHaveLength(1); // kalenderen
  });

  it("overført ferie: egen rad synlig, andres skjult", async () => {
    const jim = await idOf("Jim Kato");
    const mads = await idOf("Mads Kjerstad");
    await as(STALE, "insert into public.ferieaar values ($1, 2027, 5), ($2, 2027, 3)", [jim, mads]);
    const rows = await as<any>(JIM, "select * from public.ferieaar");
    expect(rows).toHaveLength(1);
    expect(rows[0].ansatt_id).toBe(jim);
    await expect(as(JIM, "insert into public.ferieaar values ($1, 2028, 12)", [jim])).rejects.toThrow();
  });

  it("siste leder kan ikke fjernes", async () => {
    await expect(as(STALE, "update public.ansatte set rolle='ansatt' where epost=$1", [STALE])).rejects.toThrow(/leder/);
  });

  it("deaktivert ansatt mister tilgang", async () => {
    await as(STALE, "update public.ansatte set aktiv=false where epost=$1", [MADS]);
    expect(await as(MADS, "select * from public.soknader")).toHaveLength(0);
  });

  it("kalenderlenker er private og kan byttes", async () => {
    const [{ min_kalender_token: a }] = await as<any>(JIM, "select public.min_kalender_token()");
    const [{ min_kalender_token: a2 }] = await as<any>(JIM, "select public.min_kalender_token()");
    expect(a).toBe(a2);
    await expect(as(JIM, "select * from public.kalender_tokens")).rejects.toThrow();
    const [{ ny_kalender_token: b }] = await as<any>(JIM, "select public.ny_kalender_token()");
    expect(b).not.toBe(a);
    await expect(as("fremmed@example.no", "select public.min_kalender_token()")).rejects.toThrow(/ansatt/);
    await expect(as(null, "select public.min_kalender_token()")).rejects.toThrow();
  });

  it("varsler sendes når ansatt søker og når leder behandler, ikke når leder registrerer", async () => {
    await db.exec("delete from net.kall");
    const sv = await idOf("Snekker 2 (navn)");
    await db.exec("update public.ansatte set epost='svein@example.no' where navn='Snekker 2 (navn)'");
    const [s] = await as<any>("svein@example.no", "insert into public.soknader (ansatt_id, fra, til) values ($1,'2027-08-02','2027-08-06') returning id", [sv]);
    await as(STALE, "update public.soknader set status='godkjent' where id=$1", [s.id]);
    await as(STALE, "update public.soknader set kommentar='ok' where id=$1", [s.id]);
    await as(STALE, "insert into public.soknader (ansatt_id, fra, til) values ($1,'2027-09-06','2027-09-10')", [sv]);
    const kall = (await db.query<any>("select body from net.kall")).rows.map((r) => r.body.hendelse);
    expect(kall).toEqual(["ny", "behandlet"]);
  });
});

describe("timer og prosjekter", () => {
  const ny = (email: string, ansatt: string, prosjekt: string | null, dato: string, fra: string, til: string, lunsj = 0, extra = "") =>
    as<any>(email, `insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, lunsj_min${extra ? ", status" : ""}) values ($1,$2,$3,$4,$5,$6${extra ? ", '" + extra + "'" : ""}) returning *`,
      [ansatt, prosjekt, dato, fra, til, lunsj]);

  it("leder lager prosjekter, ansatte leser dem men kan ikke endre", async () => {
    const [k] = await as<any>(STALE, "insert into public.kunder (visma_nr, navn) values (1001, 'Merete Austnes') returning id");
    await as(STALE, "insert into public.prosjekter (visma_nr, navn, kunde_id, estimert_timer) values (5001, 'Skifte vindu', $1, 38)", [k.id]);
    expect(await as(JIM, "select navn from public.prosjekter")).toEqual([{ navn: "Skifte vindu" }]);
    await expect(as(JIM, "insert into public.prosjekter (visma_nr, navn) values (9999, 'Eget')")).rejects.toThrow();
    expect(await as("fremmed@example.no", "select * from public.prosjekter")).toHaveLength(0);
  });

  it("ansatt fører egne timer, regner arbeidstid uten lunsj og kan ikke godkjenne selv", async () => {
    const jim = await idOf("Jim Kato"), p = (await db.query<any>("select id from public.prosjekter")).rows[0].id;
    const [t] = await ny(JIM, jim, p, "2027-03-01", "07:00", "15:00", 30, "godkjent");
    expect(Number(t.timer)).toBe(7.5);
    expect(t.status).toBe("levert");
    await expect(ny(JIM, await idOf("Mads Kjerstad"), p, "2027-03-01", "07:00", "15:00")).rejects.toThrow();
    await expect(ny(JIM, jim, p, "2027-03-01", "14:00", "16:00")).rejects.toThrow(/overlapper/);
    // Kolleger ser timer på prosjekter (forbruk), men ikke interntid, og kan ikke endre dem
    const [intern] = await ny(JIM, jim, null, "2027-03-02", "07:00", "09:00");
    expect(await as(MADS, "select * from public.timer")).toHaveLength(0); // Mads er deaktivert: ser ingenting
    await as(STALE, "update public.ansatte set aktiv=true where epost=$1", [MADS]);
    const sett = await as<any>(MADS, "select id, prosjekt_id from public.timer");
    expect(sett).toHaveLength(1);
    expect(sett[0].id).toBe(t.id);
    expect(await as(MADS, "update public.timer set til='16:00' where id=$1 returning id", [t.id])).toHaveLength(0);
    expect(await as("fremmed@example.no", "select * from public.timer")).toHaveLength(0);
    await as(JIM, "delete from public.timer where id=$1", [intern.id]);
    await as(STALE, "update public.ansatte set aktiv=false where epost=$1", [MADS]);
  });

  it("leder godkjenner, og da er timene låst for den ansatte", async () => {
    const [t] = await as<any>(STALE, "select id from public.timer");
    await as(STALE, "update public.timer set status='godkjent', lunsj_unntak=true where id=$1", [t.id]);
    const [g] = await as<any>(STALE, "select status, godkjent_av, lunsj_unntak from public.timer where id=$1", [t.id]);
    expect(g.status).toBe("godkjent");
    expect(g.godkjent_av).toBe(await idOf("Ståle Jonassen").catch(() => idOf("Ståle")));
    await expect(as(JIM, "update public.timer set til='16:00' where id=$1", [t.id])).rejects.toThrow(/godkjent/);
    expect(await as(JIM, "delete from public.timer where id=$1 returning id", [t.id])).toHaveLength(0);
  });
});

describe("avvik og bilder", () => {
  beforeAll(async () => { await db.exec(`update public.ansatte set aktiv=true where epost='${MADS}'`); });
  it("ansatt melder avvik, kan ikke tildele seg ansvar eller lukke", async () => {
    const mads = await idOf("Mads Kjerstad");
    const [a] = await as<any>(MADS, "insert into public.avvik (tittel, type, status, ansvarlig_id, meldt_av) values ('Løs rekkverk', 'ruh', 'lukket', $1, $1) returning *", [mads]);
    expect(a.status).toBe("apen");
    expect(a.ansvarlig_id).toBeNull();
    expect(a.meldt_av).toBe(mads);
    expect(await as(JIM, "select id from public.avvik")).toHaveLength(1);   // alle ser avvik
    await as(MADS, "update public.avvik set beskrivelse='Trapp 2. etasje', status='lukket' where id=$1", [a.id]);
    const [b] = await as<any>(MADS, "select status, beskrivelse from public.avvik where id=$1", [a.id]);
    expect(b).toEqual({ status: "apen", beskrivelse: "Trapp 2. etasje" });
    expect(await as(JIM, "update public.avvik set tittel='x' where id=$1 returning id", [a.id])).toHaveLength(0);
  });

  it("leder tildeler ansvarlig, ansvarlig skriver tiltak og lukker", async () => {
    const jim = await idOf("Jim Kato");
    const [{ id }] = await as<any>(STALE, "select id from public.avvik");
    await as(STALE, "update public.avvik set ansvarlig_id=$1, frist='2027-01-10', status='under_arbeid' where id=$2", [jim, id]);
    await expect(as(MADS, "update public.avvik set beskrivelse='endret' where id=$1", [id])).rejects.toThrow(/under behandling/);
    await as(JIM, "update public.avvik set tiltak='Skrudd fast', status='lukket', frist='2030-01-01' where id=$1", [id]);
    const [c] = await as<any>(STALE, "select status, tiltak, frist::text, lukket_av from public.avvik where id=$1", [id]);
    expect(c.status).toBe("lukket");
    expect(c.tiltak).toBe("Skrudd fast");
    expect(c.frist).toBe("2027-01-10");
    expect(c.lukket_av).toBe(jim);
  });

  it("bilder knyttes til egen bedrift og eier", async () => {
    const [{ id: p }] = await db.query<any>("select id from public.prosjekter limit 1").then((r) => r.rows);
    const [bilde] = await as<any>(JIM, "insert into public.bilder (prosjekt_id, sti, ansatt_id) values ($1, '1/p/a.jpg', $2) returning *", [p, await idOf("Mads Kjerstad")]);
    expect(bilde.ansatt_id).toBe(await idOf("Jim Kato"));
    await expect(as(JIM, "insert into public.bilder (prosjekt_id, sti) values ($1, '2/p/b.jpg')", [p])).rejects.toThrow(/filsti/);
    expect(await as(MADS, "delete from public.bilder where id=$1 returning id", [bilde.id])).toHaveLength(0);
    expect(await as(JIM, "delete from public.bilder where id=$1 returning id", [bilde.id])).toHaveLength(1);
  });
});

describe("dagbok og tilleggsarbeid", () => {
  const SIG = "data:image/png;base64," + "A".repeat(200);
  const prosj = async () => (await db.query<any>("select id from public.prosjekter limit 1")).rows[0].id;

  it("ansatt skriver dagbok, kan ikke skrive i andres navn", async () => {
    const p = await prosj();
    const [d] = await as<any>(JIM, "insert into public.dagbok (prosjekt_id, tekst, vaer, ansatt_id) values ($1, 'Montert vinduer', 'Regn', $2) returning *", [p, await idOf("Mads Kjerstad")]);
    expect(d.ansatt_id).toBe(await idOf("Jim Kato"));
    expect(await as(MADS, "update public.dagbok set tekst='x' where id=$1 returning id", [d.id])).toHaveLength(0);
    expect(await as(STALE, "select id from public.dagbok")).toHaveLength(1);
  });

  it("tilleggsarbeid krever navn og signatur, og låses etter signering", async () => {
    const p = await prosj();
    const [t] = await as<any>(JIM, "insert into public.tillegg (prosjekt_id, tittel, timer, status) values ($1, 'Ekstra lekt på loft', 4, 'fakturert') returning *", [p]);
    expect(t.status).toBe("utkast");
    await expect(as(JIM, "update public.tillegg set status='signert' where id=$1", [t.id])).rejects.toThrow(/signere/);
    await as(JIM, "update public.tillegg set status='signert', signert_navn='Merete Austnes', signatur=$2 where id=$1", [t.id, SIG]);
    const [s] = await as<any>(JIM, "select status, signert_tid from public.tillegg where id=$1", [t.id]);
    expect(s.status).toBe("signert");
    expect(s.signert_tid).not.toBeNull();
    await expect(as(JIM, "update public.tillegg set timer=10 where id=$1", [t.id])).rejects.toThrow(/signert/);
    await as(STALE, "update public.tillegg set status='fakturert' where id=$1", [t.id]);
    expect((await as<any>(STALE, "select status from public.tillegg where id=$1", [t.id]))[0].status).toBe("fakturert");
  });

  it("bare leder kan sette plan på prosjektet", async () => {
    const p = await prosj();
    expect(await as(JIM, "update public.prosjekter set estimert_timer=99 where id=$1 returning id", [p])).toHaveLength(0);
    expect(await as(STALE, "update public.prosjekter set estimert_timer=99, planlagt_start='2027-01-04' where id=$1 returning id", [p])).toHaveLength(1);
  });

  it("bare leder kan endre målet for fakturerte timer", async () => {
    expect((await as<any>(STALE, "select maal_fakturert_aar from public.bedrifter"))[0].maal_fakturert_aar).toBe("7000.0");
    await expect(as(JIM, "select public.sett_maal(9000)")).rejects.toThrow(/leder/);
    await as(STALE, "select public.sett_maal(7500)");
    const [b] = await as<any>(STALE, "select maal_fakturert_aar, maal_fakturert_mnd from public.bedrifter");
    expect(Number(b.maal_fakturert_aar)).toBe(7500);
    expect(Number(b.maal_fakturert_mnd)).toBe(625);
  });

  it("månedsrapport: utkast bare for leder, publisert for alle, leder ser hvem som har lest", async () => {
    await expect(as(JIM, "insert into public.rapporter (tittel, periode, lenke) values ('x', '2026-09-01', 'https://a.no')")).rejects.toThrow();
    const [r] = await as<any>(STALE, "insert into public.rapporter (tittel, periode, lenke) values ('Månedsrapport september 2026', '2026-09-01', 'https://claude.ai/artifact/x') returning id");
    expect(await as(JIM, "select id from public.rapporter")).toHaveLength(0);
    await expect(as(JIM, "select public.marker_lest($1)", [r.id])).rejects.toThrow(/finnes ikke/);
    await as(STALE, "update public.rapporter set publisert = now() where id=$1", [r.id]);
    expect(await as(JIM, "select id from public.rapporter")).toHaveLength(1);
    await as(JIM, "select public.marker_lest($1)", [r.id]);
    await as(JIM, "select public.marker_lest($1)", [r.id]);
    expect(await as(MADS, "select * from public.rapport_lest")).toHaveLength(0);
    expect(await as(JIM, "select * from public.rapport_lest")).toHaveLength(1);
    const lest = await as<any>(STALE, "select ansatt_id from public.rapport_lest where rapport_id=$1", [r.id]);
    expect(lest.map((x: any) => x.ansatt_id)).toEqual([await idOf("Jim Kato")]);
    await expect(as(JIM, "insert into public.rapport_lest (rapport_id, ansatt_id) values ($1, $2)", [r.id, await idOf("Mads Kjerstad")])).rejects.toThrow();
    // Publisert kan ikke gjøres om til utkast
    await as(STALE, "update public.rapporter set publisert = null where id=$1", [r.id]);
    expect(await as(JIM, "select id from public.rapporter")).toHaveLength(1);
  });

  it("stempling: inn, bytt prosjekt og ut gir timer i sanntid; manuell føring merkes", async () => {
    const p = await prosj();
    const jim = await idOf("Jim Kato");
    await db.query("delete from public.timer where ansatt_id=$1", [jim]);
    // Flytt «nå» tilbake så vi får hele kvarter mellom stemplingene
    await as(JIM, "select public.stemple('inn', $1)", [p]);
    await expect(as(JIM, "select public.stemple('inn', $1)", [p])).rejects.toThrow(/allerede/);
    await db.query("update public.stempling set fra='00:00', dato=(now() at time zone 'Europe/Oslo')::date where ansatt_id=$1", [jim]);
    expect(await as(MADS, "select * from public.stempling")).toHaveLength(0);
    expect(await as(STALE, "select * from public.stempling")).toHaveLength(1);
    await as(JIM, "select public.stemple('ut', null, 'Montert vinduer', 0)");
    const t = await as<any>(JIM, "select fra, kilde, beskrivelse, lunsj_min, prosjekt_id from public.timer where ansatt_id=$1", [jim]);
    if (t.length) { // tom hvis testen kjøres rett etter midnatt (ut før 07:00)
      expect(t[0].kilde).toBe("stempel");
      expect(t[0].beskrivelse).toBe("Montert vinduer");
      expect(t[0].prosjekt_id).toBe(p);
      await as(JIM, "update public.timer set beskrivelse='x', til=til where ansatt_id=$1", [jim]); await as(JIM, "update public.timer set fra=fra + interval '1 minute' where ansatt_id=$1 and til > fra + interval '1 minute'", [jim]);
      expect((await as<any>(JIM, "select kilde from public.timer where ansatt_id=$1", [jim]))[0].kilde).toBe("endret");
    }
    expect(await as(JIM, "select * from public.stempling")).toHaveLength(0);
    // Glemt å stemple ut i går: må oppgi sluttid
    await as(JIM, "select public.stemple('inn', null)");
    await db.query("update public.stempling set dato=dato-1, fra='08:00' where ansatt_id=$1", [jim]);
    await expect(as(JIM, "select public.stemple('ut')")).rejects.toThrow(/sluttet/);
    await as(JIM, "select public.stemple('ut', null, '', 0, '16:00')");
    const g = await as<any>(JIM, "select kilde, til from public.timer where ansatt_id=$1 and dato < (now() at time zone 'Europe/Oslo')::date", [jim]);
    expect(g[0].til.slice(0, 5)).toBe("16:00");
    // Manuell føring
    const [m] = await as<any>(JIM, "insert into public.timer (ansatt_id, dato, fra, til, kilde) values ($1, '2027-05-03', '07:00', '08:00', 'stempel') returning kilde", [jim]);
    expect(m.kilde).toBe("manuell");
    await db.query("delete from public.timer where ansatt_id=$1", [jim]);
  });

  it("sykefravær: egen registrering, maks 3 dager egenmelding, bare leder ser andres", async () => {
    const jim = await idOf("Jim Kato");
    await as(JIM, "insert into public.fravaer (ansatt_id, type, fra, til) values ($1, 'egenmelding', '2027-01-04', '2027-01-06')", [jim]);
    await expect(as(JIM, "insert into public.fravaer (ansatt_id, type, fra, til) values ($1, 'egenmelding', '2027-02-01', '2027-02-04')", [jim])).rejects.toThrow(/høyst 3/);
    await expect(as(JIM, "insert into public.fravaer (ansatt_id, type, fra, til) values ($1, 'sykt_barn', '2027-01-05', '2027-01-05')", [jim])).rejects.toThrow(/overlapper/);
    await expect(as(JIM, "insert into public.fravaer (ansatt_id, type, fra, til) values ($1, 'egenmelding', '2027-03-01', '2027-03-01')", [await idOf("Ståle Jonassen").catch(() => idOf("Ståle"))])).rejects.toThrow(/deg selv/);
    await as(STALE, "insert into public.fravaer (ansatt_id, type, fra, til, grad) values ($1, 'sykmelding', '2027-02-01', '2027-02-20', 50)", [jim]);
    expect(await as(JIM, "select * from public.fravaer")).toHaveLength(2);
    expect(await as(STALE, "select * from public.fravaer")).toHaveLength(2);
    await as(STALE, "update public.ansatte set aktiv=true where epost=$1", [MADS]);
    expect(await as(MADS, "select * from public.fravaer")).toHaveLength(0);
    await as(STALE, "update public.ansatte set aktiv=false where epost=$1", [MADS]);
  });

  it("stempling: kolleger ser hverandre bare når de er inne på samme prosjekt", async () => {
    const p = await prosj();
    const [p2] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Annet prosjekt') returning id");
    await as(STALE, "update public.ansatte set aktiv=true where epost=$1", [MADS]);
    await db.query("delete from public.stempling");
    await as(JIM, "select public.stemple('inn', $1)", [p]);
    expect(await as(MADS, "select * from public.stempling")).toHaveLength(0); // Mads er ikke inne
    await as(MADS, "select public.stemple('inn', $1)", [p2.id]);
    expect(await as(MADS, "select * from public.stempling")).toHaveLength(1); // bare seg selv, annet prosjekt
    await as(MADS, "select public.stemple('bytt', $1)", [p]);
    expect(await as(MADS, "select * from public.stempling")).toHaveLength(2); // samme prosjekt: ser Jim
    expect(await as(JIM, "select * from public.stempling")).toHaveLength(2);
    await as(MADS, "select public.stemple('bytt', null)"); // internt: ser ikke andre
    expect(await as(MADS, "select * from public.stempling")).toHaveLength(1);
    await db.query("delete from public.stempling"); await db.query("delete from public.timer where ansatt_id in (select id from public.ansatte where epost in ($1, $2))", [JIM, MADS]);
    await as(STALE, "update public.ansatte set aktiv=false where epost=$1", [MADS]);
  });

  it("utstyr: sorteres automatisk, hentes til riktig ansatt, og den ansatte kan bare legge til bilde, serienr og status", async () => {
    const kat = async (b: string) => (await db.query<any>("select public.utstyr_kategori($1) k", [b])).rows[0].k;
    expect(await kat("SLAGSKRUTREKKER WHP18DA KM")).toBe("verktoy");
    expect(await kat("VATER 466 800MM 3 LIBELLER")).toBe("verktoy");
    expect(await kat("BUKSE 6241 HL SORT 56")).toBe("arbeidstoy");
    expect(await kat("Diverse – regnkle")).toBe("arbeidstoy");
    expect(await kat("HANSKE MONTERING 11 VINTER BLÅ")).toBe("verneutstyr");
    expect(await kat("VERNESKO S3 STR 43")).toBe("verneutstyr");
    expect(await kat("STØVMASKE 8810C FFP2 UTEN VENTIL")).toBe("verneutstyr");
    expect(await kat("KRAFTBITS TX20")).toBe("forbruk");
    expect(await kat("SAGBLAD 160X20 54 T WZ")).toBe("forbruk");
    expect(await kat("HAMMERBOR V-PLUS 24X250MM")).toBe("forbruk");

    const jim = await idOf("Jim Kato");
    const [konto] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn) values (188, 'Jim Kato - utstyr') returning id");
    await as(STALE, "update public.ansatte set utstyr_prosjekt_id=$1 where id=$2", [konto.id, jim]);
    // Hentingen fra Visma (uten innlogget bruker)
    const system = () => db.exec("select set_config('request.jwt.claims', '', false)");
    await system();
    await db.query(`insert into public.utstyr (kilde, visma_ordrenr, linjenr, prosjekt_id, dato, varenr, nobb_nr, beskrivelse, antall, pris)
      values ('visma', 6001, 1, $1, '2026-10-01', '57935432', '57935432', 'SLAGSKRUTREKKER WHP18DA KM', 1, 2490),
             ('visma', 6001, 2, $1, '2026-10-01', '1000', '', 'Diverse – regnkle', 1, 520)`, [konto.id]);
    const rader = await as<any>(JIM, "select beskrivelse, kategori, ansatt_id from public.utstyr order by linjenr");
    expect(rader.map((r: any) => [r.kategori, r.ansatt_id])).toEqual([["verktoy", jim], ["arbeidstoy", jim]]);
    await as(STALE, "update public.ansatte set aktiv=true where epost=$1", [MADS]);
    expect(await as(MADS, "select * from public.utstyr")).toHaveLength(0);
    await as(STALE, "update public.ansatte set aktiv=false where epost=$1", [MADS]);

    // Jim legger inn serienr og status, men kan ikke endre pris eller kategori
    await as(JIM, "update public.utstyr set serienr='SN123', status='service', pris=1, kategori='forbruk' where linjenr=1");
    expect((await db.query<any>("select serienr, status, pris::int, kategori from public.utstyr where linjenr=1")).rows[0]).toEqual({ serienr: "SN123", status: "service", pris: 2490, kategori: "verktoy" });
    // Leder retter kategorien; den holder seg ved neste henting
    await as(STALE, "update public.utstyr set kategori='forbruk' where linjenr=2");
    await system();
    await db.query("update public.utstyr set beskrivelse='Diverse – regnjakke' where linjenr=2");
    expect((await db.query<any>("select kategori, kategori_manuell from public.utstyr where linjenr=2")).rows[0]).toEqual({ kategori: "forbruk", kategori_manuell: true });

    // Eget verktøy som ikke er fra Visma: registreres på seg selv, kan slettes. Visma-linjer kan ikke slettes.
    const [egen] = await as<any>(JIM, "insert into public.utstyr (beskrivelse, nobb_nr, ansatt_id) values ('Laser vater', '12345678', $1) returning id, ansatt_id, kilde, kategori", [await idOf("Ståle Jonassen").catch(() => idOf("Ståle"))]);
    expect([egen.ansatt_id, egen.kilde, egen.kategori]).toEqual([jim, "manuell", "verktoy"]);
    expect(await as(JIM, "delete from public.utstyr where kilde='visma' returning id")).toHaveLength(0);
    expect(await as(JIM, "delete from public.utstyr where id=$1 returning id", [egen.id])).toHaveLength(1);

    // Grenser: bare leder
    await expect(as(JIM, "select public.sett_utstyr_grenser(1000, 5000, 6)")).rejects.toThrow(/Bare leder/);
    await as(STALE, "select public.sett_utstyr_grenser(4000, 0, 6)");
    expect((await db.query<any>("select utstyr_grense_arbeidstoy::int a, utstyr_grense_verktoy v from public.bedrifter limit 1")).rows[0]).toEqual({ a: 4000, v: null });
    // Kvoter på antall: standard ved oppstart, bare leder kan endre, og de må være gyldige
    expect((await db.query<any>("select utstyr_kvoter->'bukse' b from public.bedrifter limit 1")).rows[0].b).toEqual({ antall: 2, aar: 1 });
    await expect(as(JIM, `select public.sett_utstyr_kvoter('{"bukse":{"antall":9,"aar":1}}')`)).rejects.toThrow(/Bare leder/);
    await expect(as(STALE, `select public.sett_utstyr_kvoter('{"bukse":{"antall":-1,"aar":1}}')`)).rejects.toThrow(/Ugyldig/);
    await as(STALE, `select public.sett_utstyr_kvoter('{"bukse":{"antall":3,"aar":1},"vinter":{"antall":2,"aar":2}}')`);
    expect((await db.query<any>("select utstyr_kvoter->'bukse'->>'antall' n from public.bedrifter limit 1")).rows[0].n).toBe("3");
    // Ansatt kan merke en ny vare som avklart (nytt mot gammelt)
    expect(await as(JIM, "update public.utstyr set bytte_avklart=true where linjenr=1 returning id")).toHaveLength(1);
  });

  it("svenn-import: bare leder, nye prosjekter, overlapp tillatt, ny import erstatter, koblinger huskes", async () => {
    await db.exec(`update public.ansatte set ansattnr='3' where navn='Jim Kato'`);
    const jim = await idOf("Jim Kato");
    const rader = JSON.stringify([
      { d: "2026-03-02", a: "3", f: "08:00", t: "16:30", l: 30, k: "Ny jobb#10900", c: "" },
      { d: "2026-03-02", a: "3", f: "16:00", t: "17:00", l: 0, k: "Interntid#4", c: "overlapp" },
      { d: "2026-03-03", a: "99", f: "08:00", t: "12:00", l: 0, k: "Ny jobb#10900", c: "" },
    ]);
    const kob = JSON.stringify([
      { nokkel: "Ny jobb#10900", prosjekt_id: null, ny_navn: "Ny jobb – Kari", fakturerbar: true },
      { nokkel: "Interntid#4", prosjekt_id: null, ny_navn: null, fakturerbar: true },
    ]);
    await expect(as(JIM, "select public.importer_svenn($1::jsonb, $2::jsonb)", [kob, rader])).rejects.toThrow(/Bare leder/);
    const [{ importer_svenn: r }] = await as<any>(STALE, "select public.importer_svenn($1::jsonb, $2::jsonb)", [kob, rader]);
    expect([r.importert, Number(r.timer), Number(r.fakturerbart), Number(r.internt), r.nye_prosjekter, r.ukjente_ansattnr]).toEqual([2, 9, 8, 1, 1, ["99"]]);
    const t = (await db.query<any>("select kilde, status, fakturerbar, p.navn, p.aktiv, p.fra_svenn from public.timer t left join public.prosjekter p on p.id = t.prosjekt_id where t.ansatt_id=$1 and t.kilde='svenn' order by fra", [jim])).rows;
    expect(t.map((x: any) => [x.kilde, x.status, x.fakturerbar, x.navn, x.aktiv, x.fra_svenn])).toEqual([
      ["svenn", "godkjent", true, "Ny jobb – Kari", false, true], ["svenn", "godkjent", false, null, null, null]]);
    // Ny import av samme periode erstatter; samme navn gir ikke nytt prosjekt; koblingen er husket
    const [{ importer_svenn: r2 }] = await as<any>(STALE, "select public.importer_svenn($1::jsonb, $2::jsonb)", [kob, rader]);
    expect([r2.importert, r2.nye_prosjekter]).toEqual([2, 0]);
    expect((await as<any>(STALE, "select count(*)::int n from public.svenn_kobling where prosjekt_id is not null"))[0].n).toBeGreaterThan(0);
    expect(await as(JIM, "select * from public.svenn_kobling")).toHaveLength(0);
    // Vanlig føring kan fortsatt ikke overlappe, og appen kan ikke sette kilde «svenn»
    await expect(as(JIM, "insert into public.timer (ansatt_id, dato, fra, til) values ($1, '2026-03-02', '09:00', '10:00')", [jim])).rejects.toThrow(/overlapper/);
    const [ny] = await as<any>(JIM, "insert into public.timer (ansatt_id, dato, fra, til, kilde) values ($1, '2026-03-05', '09:00', '10:00', 'svenn') returning kilde", [jim]);
    expect(ny.kilde).toBe("manuell");
  });

  it("svenn-dokumentasjon: koble prosjekter (bare leder), og samme Svenn-fil kan ikke legges inn to ganger", async () => {
    const kob = JSON.stringify([{ nokkel: "Runar Helgesen#8", prosjekt_id: null, ny_navn: "Runar Helgesen" }, { nokkel: "Hopp#1", prosjekt_id: null, ny_navn: null }]);
    await expect(as(JIM, "select public.svenn_prosjekter($1::jsonb)", [kob])).rejects.toThrow(/Bare leder/);
    const [{ svenn_prosjekter: m }] = await as<any>(STALE, "select public.svenn_prosjekter($1::jsonb)", [kob]);
    expect(Object.keys(m)).toEqual(["Runar Helgesen#8"]);
    const [{ svenn_prosjekter: m2 }] = await as<any>(STALE, "select public.svenn_prosjekter($1::jsonb)", [kob]);
    expect(m2["Runar Helgesen#8"]).toBe(m["Runar Helgesen#8"]);
    const pid = m["Runar Helgesen#8"];
    await as(STALE, "insert into public.bilder (sti, prosjekt_id, svenn_id, opprettet) values ('1/p-x/a.jpg', $1, 777, '2026-02-10T10:22:34Z')", [pid]);
    expect((await db.query<any>("select to_char(opprettet at time zone 'UTC', 'YYYY-MM-DD') d from public.bilder where svenn_id=777")).rows[0].d).toBe("2026-02-10");
    await expect(as(STALE, "insert into public.bilder (sti, prosjekt_id, svenn_id) values ('1/p-x/b.jpg', $1, 777)", [pid])).rejects.toThrow();
  });
});

describe("kompetanse", () => {
  it("ansatt legger inn egne bevis, leder for alle; alle ser, bare eier/leder sletter", async () => {
    const [jim] = await as(STALE, "select id from public.ansatte where epost = $1", [JIM]);
    const [mads] = await as(STALE, "select id from public.ansatte where epost = $1", [MADS]);
    // Jim prøver å legge inn på Mads – havner på Jim selv
    const [r1] = await as(JIM, "insert into public.kompetanse (ansatt_id, type, navn, gyldig_til) values ($1, 'stillas', 'Stillaskurs', '2030-01-01') returning ansatt_id", [mads.id]);
    expect(r1.ansatt_id).toBe(jim.id);
    // Leder legger inn for Mads
    const [r2] = await as(STALE, "insert into public.kompetanse (ansatt_id, type, navn) values ($1, 'hoyde', 'Arbeid i høyden') returning id, ansatt_id", [mads.id]);
    expect(r2.ansatt_id).toBe(mads.id);
    // Jim ser begge, men kan ikke slette Mads sitt
    expect((await as(JIM, "select id from public.kompetanse")).length).toBe(2);
    await as(JIM, "delete from public.kompetanse where id = $1", [r2.id]);
    expect((await as(STALE, "select id from public.kompetanse")).length).toBe(2);
    expect((await as(null, "select id from public.kompetanse").catch(() => []))).toEqual([]);
  });
});


describe("meldinger", () => {
  beforeAll(async () => { await db.exec(`update public.ansatte set aktiv=true where epost='${MADS}'`); });
  it("felles ser alle; privat bare de to; ingen kan skrive i andres navn", async () => {
    const [jim] = await as(STALE, "select id from public.ansatte where epost = $1", [JIM]);
    const [mads] = await as(STALE, "select id from public.ansatte where epost = $1", [MADS]);
    const [stale] = await as(STALE, "select id from public.ansatte where epost = $1", [STALE]);
    const dm = jim.id < mads.id ? `dm:${jim.id}:${mads.id}` : `dm:${mads.id}:${jim.id}`;
    const [f] = await as(JIM, "insert into public.meldinger (kanal, tekst, ansatt_id) values ('felles', 'Hei alle', $1) returning ansatt_id", [mads.id]);
    expect(f.ansatt_id).toBe(jim.id);
    await as(JIM, "insert into public.meldinger (kanal, tekst) values ($1, 'Hei Mads')", [dm]);
    expect(await as(MADS, "select id from public.meldinger")).toHaveLength(2);
    // Leder ser ikke private samtaler mellom andre, og kan ikke skrive i dem
    expect(await as(STALE, "select id from public.meldinger")).toHaveLength(1);
    await expect(as(STALE, "insert into public.meldinger (kanal, tekst) values ($1, 'snik')", [dm])).rejects.toThrow();
    // Kan ikke starte samtale med seg selv / feil rekkefølge
    await expect(as(JIM, "insert into public.meldinger (kanal, tekst) values ($1, 'x')", [`dm:${jim.id}:${jim.id}`])).rejects.toThrow();
    // Lest-markering
    await as(MADS, "select public.marker_kanal_lest('felles')");
    expect(await as(MADS, "select kanal from public.kanal_lest")).toHaveLength(1);
    expect(await as(JIM, "select kanal from public.kanal_lest")).toHaveLength(0);
    expect(stale.id).toBeTruthy();
  });
});

describe("kampanjer", () => {
  it("bare leder legger inn; alle ser; hver ansatt skjuler for seg selv", async () => {
    await expect(as(JIM, "insert into public.kampanjer (tittel, fra, til) values ('DM', '2026-10-01', '2026-10-20')")).rejects.toThrow();
    const [k] = await as(STALE, "insert into public.kampanjer (tittel, fra, til, sider) values ('DM 9', '2026-10-01', '2026-10-20', '{1/kampanjer/a.jpg}') returning id");
    expect(await as(JIM, "select id from public.kampanjer")).toHaveLength(1);
    await as(JIM, "update public.kampanjer set tittel = 'hack' where id = $1", [k.id]);
    expect((await as(STALE, "select tittel from public.kampanjer"))[0].tittel).toBe("DM 9");
    await expect(as(STALE, "insert into public.kampanjer (tittel, fra, til) values ('Feil', '2026-10-20', '2026-10-01')")).rejects.toThrow();
    await as(JIM, "select public.skjul_kampanje($1)", [k.id]);
    await as(JIM, "select public.skjul_kampanje($1)", [k.id]);
    await as(MADS, "select public.sett_vis_kampanjer(false)");
    const rader = await as(STALE, "select epost, vis_kampanjer, skjulte_kampanjer from public.ansatte where epost in ($1, $2, $3) order by epost", [JIM, MADS, STALE]);
    const p = (e: string) => rader.find((r: any) => r.epost === e);
    expect(p(JIM).skjulte_kampanjer).toEqual([k.id]);
    expect(p(MADS).vis_kampanjer).toBe(false);
    expect(p(STALE).vis_kampanjer).toBe(true);
    await as(JIM, "delete from public.kampanjer where id = $1", [k.id]);
    expect(await as(STALE, "select id from public.kampanjer")).toHaveLength(1);
    await as(STALE, "delete from public.kampanjer where id = $1", [k.id]);
    expect(await as(JIM, "select id from public.kampanjer")).toHaveLength(0);
  });
});

describe("push-varsler", () => {
  it("hver ansatt melder på sin egen enhet; ingen kan lese abonnementer eller nøkler", async () => {
    await as(JIM, "select public.lagre_push('https://push.example/abc', 'p', 'a')");
    await as(MADS, "select public.lagre_push('https://push.example/def', 'p', 'a')");
    await expect(as(JIM, "select * from public.push_abonnement")).rejects.toThrow();
    await expect(as(JIM, "select * from public.push_noekler")).rejects.toThrow();
    await expect(as(JIM, "select public.lagre_push('http://usikker', 'p', 'a')")).rejects.toThrow();
    // Jim kan ikke melde av Mads sin enhet
    await as(JIM, "select public.slett_push('https://push.example/def')");
    const r = await db.query("select endpoint from public.push_abonnement order by endpoint");
    expect(r.rows.map((x: any) => x.endpoint)).toEqual(["https://push.example/abc", "https://push.example/def"]);
    // Ny melding fyrer utløseren uten feil (pg_net finnes ikke i testen)
    await as(JIM, "insert into public.meldinger (kanal, tekst) values ('felles', 'Test varsel')");
  });
});

describe("varsel når noen fortsatt er stemplet inn", () => {
  it("finner den som har passert grensen, én gang per dag, og bare tjenesten kan spørre", async () => {
    const jim = await idOf("Jim Kato");
    await db.query("delete from public.stempling where ansatt_id = $1", [jim]);
    // Stemplet inn for 9 timer siden (norsk tid)
    await db.query(`insert into public.stempling (ansatt_id, dato, fra)
      select $1, ((now() at time zone 'Europe/Oslo') - interval '9 hours')::date, ((now() at time zone 'Europe/Oslo') - interval '9 hours')::time`, [jim]);
    const finn = async () => (await db.query<any>("select * from public.stemplet_lenge() where ansatt_id = $1", [jim])).rows;
    const [r] = await finn();
    expect(r.minutter).toBeGreaterThanOrEqual(539);
    await expect(as(JIM, "select * from public.stemplet_lenge()")).rejects.toThrow();

    // Polske ansatte: 9 t 15 min er ikke passert ennå
    await db.query("update public.ansatte set varsel_stemplet_min = 555 where id = $1", [jim]);
    expect(await finn()).toHaveLength(0);
    await db.query("update public.ansatte set varsel_stemplet_min = 495 where id = $1", [jim]);

    // Allerede varslet i dag
    await db.query("insert into public.push_logg (type, id) values ('stemplet:' || $2, $1)", [jim, r.dato.toISOString?.().slice(0, 10) ?? r.dato]);
    expect(await finn()).toHaveLength(0);
    await db.query("delete from public.push_logg where id = $1", [jim]);

    // Slått av
    await db.query("update public.ansatte set varsel_stemplet_min = null where id = $1", [jim]);
    expect(await finn()).toHaveLength(0);
    await db.query("update public.ansatte set varsel_stemplet_min = 495 where id = $1", [jim]);
    await db.query("delete from public.stempling where ansatt_id = $1", [jim]);
  });

  it("de polske får 9 t 15 min som standard", async () => {
    const r = await db.query<any>("select navn, varsel_stemplet_min from public.ansatte where sprak = 'pl'");
    for (const a of r.rows) expect(a.varsel_stemplet_min).toBe(555);
  });
});

describe("koble app-prosjekt til Visma-prosjekt", () => {
  it("flytter timer, dagbok, avvik og chat, tar med opplysninger og sletter app-prosjektet", async () => {
    const jim = await idOf("Jim Kato");
    const [app] = await as<any>(STALE, "insert into public.prosjekter (navn, adresse, estimert_timer, notat) values ('Nytt bad (app)', 'Gate 1, 6290 Haramsøy', 40, 'Fliser fra butikken') returning id");
    const [vis] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn) values (7001, 'Bad Hansen') returning id");
    await as(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, lunsj_min) values ($1, $2, '2027-09-06', '07:00', '15:00', 30)", [jim, app.id]);
    await as(STALE, "update public.timer set status = 'godkjent' where prosjekt_id = $1", [app.id]);
    await as(JIM, "insert into public.dagbok (prosjekt_id, tekst, vaer, ansatt_id) values ($1, 'Revet bad', 'Sol', $2)", [app.id, jim]);
    await as(JIM, "insert into public.meldinger (kanal, tekst) values ($1, 'Fliser kommer i morgen')", ["p:" + app.id]);
    await as(JIM, "select public.marker_kanal_lest($1)", ["p:" + app.id]);

    // Bare leder, og bare fra app-prosjekt til Visma-prosjekt
    await expect(as(JIM, "select public.koble_prosjekt($1, $2)", [app.id, vis.id])).rejects.toThrow(/leder/);
    await expect(as(STALE, "select public.koble_prosjekt($1, $2)", [vis.id, app.id])).rejects.toThrow(/allerede fra Visma/);

    const [r] = await as<any>(STALE, "select public.koble_prosjekt($1, $2) as n", [app.id, vis.id]);
    expect(r.n).toBeGreaterThanOrEqual(3);
    const q = async (sql: string, p: any[]) => (await db.query<any>(sql, p)).rows;
    expect(await q("select * from public.prosjekter where id = $1", [app.id])).toHaveLength(0);
    const [t] = await q("select status, timer from public.timer where prosjekt_id = $1", [vis.id]);
    expect(t.status).toBe("godkjent");
    expect(await q("select * from public.dagbok where prosjekt_id = $1", [vis.id])).toHaveLength(1);
    const [m] = await q("select tekst, endret from public.meldinger where kanal = $1", ["p:" + vis.id]);
    expect(m.tekst).toBe("Fliser kommer i morgen");
    expect(m.endret).toBeNull();
    expect(await q("select * from public.kanal_lest where kanal = $1", ["p:" + vis.id])).toHaveLength(1);
    expect(await q("select * from public.kanal_lest where kanal = $1", ["p:" + app.id])).toHaveLength(0);
    const [v] = await q("select adresse, estimert_timer, notat, visma_nr, navn from public.prosjekter where id = $1", [vis.id]);
    expect(v).toMatchObject({ adresse: "Gate 1, 6290 Haramsøy", notat: "Fliser fra butikken", visma_nr: 7001, navn: "Bad Hansen" });
    expect(Number(v.estimert_timer)).toBe(40);
  });
});

describe("slå sammen prosjekter", () => {
  const q = async (sql: string, p: any[] = []) => (await db.query<any>(sql, p)).rows;
  it("to Visma-prosjekter: alt flyttes, det ene blir skjult og forblir skjult når Visma oppdaterer det", async () => {
    const jim = await idOf("Jim Kato");
    const [k] = await as<any>(STALE, "insert into public.kunder (navn) values ('Hansen') returning id");
    const [a] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn, kunde_id, adresse) values (8001, 'Bad Hansen', $1, 'Vegen 2') returning id", [k.id]);
    const [b] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn, estimert_timer) values (8002, 'Hansen bad og vaskerom', 30) returning id");
    await as(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, lunsj_min) values ($1, $2, '2027-10-04', '07:00', '15:00', 30)", [jim, a.id]);
    await as(JIM, "insert into public.dagbok (prosjekt_id, tekst, vaer, ansatt_id) values ($1, 'Membran', 'Regn', $2)", [a.id, jim]);
    await db.query("insert into public.prosjekt_vare (prosjekt_id, varenr, antall) values ($1, 'V1', 2), ($1, 'V2', 1), ($2, 'V1', 5)", [a.id, b.id]);

    await expect(as(JIM, "select public.slaa_sammen_prosjekter($1, $2)", [a.id, b.id])).rejects.toThrow(/Bare leder/);
    await expect(as(STALE, "select public.slaa_sammen_prosjekter($1, $1)", [a.id])).rejects.toThrow(/annet prosjekt/);
    await expect(as(STALE, "update public.prosjekter set slatt_sammen_med = $2 where id = $1 returning slatt_sammen_med", [a.id, b.id]))
      .resolves.toEqual([{ slatt_sammen_med: null }]);

    await as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [a.id, b.id]);
    expect(await q("select * from public.timer where prosjekt_id = $1", [b.id])).toHaveLength(1);
    expect(await q("select * from public.dagbok where prosjekt_id = $1", [b.id])).toHaveLength(1);
    expect((await q("select varenr, antall from public.prosjekt_vare where prosjekt_id = $1 order by varenr", [b.id])).map((x) => [x.varenr, Number(x.antall)]))
      .toEqual([["V1", 5], ["V2", 1]]);
    const [gammel] = await q("select aktiv, slatt_sammen_med from public.prosjekter where id = $1", [a.id]);
    expect(gammel).toEqual({ aktiv: false, slatt_sammen_med: b.id });
    const [ny] = await q("select kunde_id, adresse, estimert_timer, navn from public.prosjekter where id = $1", [b.id]);
    expect(ny).toMatchObject({ kunde_id: k.id, adresse: "Vegen 2", navn: "Hansen bad og vaskerom" });

    // Visma-hentingen oppdaterer det skjulte prosjektet: det forblir skjult og inaktivt
    await db.exec(`update public.prosjekter set aktiv = true, navn = 'Bad Hansen (Visma)', slatt_sammen_med = null where visma_nr = 8001`);
    expect((await q("select aktiv, slatt_sammen_med from public.prosjekter where id = $1", [a.id]))[0]).toEqual({ aktiv: false, slatt_sammen_med: b.id });
    // Kan ikke slås sammen på nytt
    await expect(as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [a.id, b.id])).rejects.toThrow(/allerede slått sammen/);
  });
  it("app-prosjekt slås inn i et annet app-prosjekt og slettes; tidligere sammenslåtte peker videre", async () => {
    const [x] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Garasje Olsen') returning id");
    const [y] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Olsen garasje tak') returning id");
    const [v] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn) values (8003, 'Olsen') returning id");
    await as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [v.id, x.id]);
    await as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [x.id, y.id]);
    expect(await q("select * from public.prosjekter where id = $1", [x.id])).toHaveLength(0);
    expect((await q("select slatt_sammen_med from public.prosjekter where id = $1", [v.id]))[0].slatt_sammen_med).toBe(y.id);
  });
  it("utstyrskontoer kan ikke slås sammen", async () => {
    const [u] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn) values (8004, 'Utstyr Jim') returning id");
    const [z] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Noe annet') returning id");
    await db.query("update public.ansatte set utstyr_prosjekt_id = $1 where navn = 'Jim Kato'", [u.id]);
    await expect(as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [z.id, u.id])).rejects.toThrow(/Utstyrskontoer/);
    await db.query("update public.ansatte set utstyr_prosjekt_id = null where navn = 'Jim Kato'");
  });
});

describe("ansatte oppretter prosjekt", () => {
  it("ansatt kan lage prosjekt og kunde uten Visma-nr, men ikke endre eller slette", async () => {
    const [k] = await as<any>(JIM, "insert into public.kunder (navn) values ('Kunde fra Jim') returning id");
    const [p] = await as<any>(JIM, "insert into public.prosjekter (navn, kunde_id) values ('Jims prosjekt', $1) returning id, navn", [k.id]);
    expect(p.navn).toBe("Jims prosjekt");
    await expect(as(JIM, "insert into public.prosjekter (navn, fastpris) values ('Fastpris', true)")).rejects.toThrow();
    await expect(as(JIM, "insert into public.kunder (visma_nr, navn) values (4242, 'Falsk')")).rejects.toThrow();
    expect(await as(JIM, "update public.prosjekter set navn = 'Endret' where id = $1 returning id", [p.id])).toHaveLength(0);
    expect(await as(JIM, "delete from public.prosjekter where id = $1 returning id", [p.id])).toHaveLength(0);
    await expect(as("fremmed@example.no", "insert into public.prosjekter (navn) values ('Fremmed')")).rejects.toThrow();
    await db.query("delete from public.prosjekter where id = $1", [p.id]);
    await db.query("delete from public.kunder where id = $1", [k.id]);
  });
});

describe("adresse lagt inn i appen", () => {
  it("overskrives ikke av Visma-synken, men leder kan endre den", async () => {
    await db.exec("create role service_role nologin; grant all on public.prosjekter to service_role;").catch(() => {});
    const [p] = await as<any>(STALE, "insert into public.prosjekter (visma_nr, navn, adresse) values (7777, 'Adressetest', 'Fra Visma 1') returning id");
    await as(STALE, "update public.prosjekter set adresse = 'Riktig vei 2', adresse_manuell = true where id = $1", [p.id]);
    await db.exec(`set role service_role; update public.prosjekter set adresse = 'Fra Visma 1' where visma_nr = 7777; reset role;`);
    expect((await db.query<any>("select adresse from public.prosjekter where id = $1", [p.id])).rows[0].adresse).toBe("Riktig vei 2");
    await as(STALE, "update public.prosjekter set adresse = 'Ny vei 3' where id = $1", [p.id]);
    expect((await db.query<any>("select adresse from public.prosjekter where id = $1", [p.id])).rows[0].adresse).toBe("Ny vei 3");
    await db.query("delete from public.prosjekter where id = $1", [p.id]);
  });
});

describe("arbeidsplan og materialliste", () => {
  const q = async (sql: string, p: any[] = []) => (await db.query<any>(sql, p)).rows;
  it("leder deler ut arbeid; den som har fått det kan bare endre status, andre ingenting", async () => {
    const jim = await idOf("Jim Kato"), svein = await idOf("Snekker 2 (navn)");
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Plan-prosjekt') returning id");
    await expect(as(JIM, "insert into public.oppgaver (prosjekt_id, tittel, fra, til) values ($1, 'Riving', '2027-01-04', '2027-01-05')", [p.id])).rejects.toThrow();
    await expect(as(STALE, "insert into public.oppgaver (prosjekt_id, tittel, fra, til) values ($1, 'Feil', '2027-01-05', '2027-01-04')", [p.id])).rejects.toThrow();
    const [o] = await as<any>(STALE, "insert into public.oppgaver (prosjekt_id, tittel, fra, til, ansatte) values ($1, 'Riving', '2027-01-04', '2027-01-05', array[$2::uuid, $2::uuid, gen_random_uuid()]) returning id, ansatte, bedrift_id", [p.id, jim]);
    expect(o.ansatte).toEqual([jim]);
    const [o2] = await as<any>(STALE, "insert into public.oppgaver (prosjekt_id, tittel, fra, til, ansatte) values ($1, 'Membran', '2027-01-06', '2027-01-08', array[$2::uuid]) returning id", [p.id, svein]);
    expect(await as(JIM, "select id from public.oppgaver where prosjekt_id = $1", [p.id])).toHaveLength(2);
    await as(JIM, "update public.oppgaver set status = 'ferdig', tittel = 'Endret', til = '2027-02-01' where id = $1", [o.id]);
    const [etter] = await q("select status, tittel, til::text, ferdig_tid from public.oppgaver where id = $1", [o.id]);
    expect(etter).toMatchObject({ status: "ferdig", tittel: "Riving", til: "2027-01-05" });
    expect(etter.ferdig_tid).not.toBeNull();
    expect(await as(JIM, "update public.oppgaver set status = 'ferdig' where id = $1 returning id", [o2.id])).toHaveLength(0);
    expect(await as(JIM, "delete from public.oppgaver where id = $1 returning id", [o.id])).toHaveLength(0);
    await as(STALE, "update public.oppgaver set status = 'planlagt' where id = $1", [o.id]);
    expect((await q("select ferdig_tid from public.oppgaver where id = $1", [o.id]))[0].ferdig_tid).toBeNull();
  });
  it("materialliste i leveranser: ansatte kan bare hake av, og sammenslåing tar alt med", async () => {
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Materiell-prosjekt') returning id");
    const [p2] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Annet prosjekt') returning id");
    const [l1] = await as<any>(STALE, "insert into public.leveranser (prosjekt_id, navn, rekkefolge, dato) values ($1, 'Bjelkelag', 1, '2027-01-04') returning id", [p.id]);
    await expect(as(JIM, "insert into public.leveranser (prosjekt_id, navn) values ($1, 'Jim')", [p.id])).rejects.toThrow(/Bare leder/);
    const [m] = await as<any>(STALE, "insert into public.materialer (prosjekt_id, leveranse_id, beskrivelse, antall, enhet) values ($1, $2, 'Konstruksjonsvirke 48x198', 24, 'stk') returning id", [p.id, l1.id]);
    await expect(as(STALE, "insert into public.materialer (prosjekt_id, leveranse_id, beskrivelse) values ($1, $2, 'Feil')", [p2.id, l1.id])).rejects.toThrow(/annet prosjekt/);
    await as(JIM, "update public.materialer set levert = true, antall = 1 where id = $1", [m.id]);
    expect((await q("select levert, antall from public.materialer where id = $1", [m.id]))[0]).toMatchObject({ levert: true });
    expect(Number((await q("select antall from public.materialer where id = $1", [m.id]))[0].antall)).toBe(24);
    await as(JIM, "update public.leveranser set status = 'levert', navn = 'X' where id = $1", [l1.id]);
    expect((await q("select status, navn from public.leveranser where id = $1", [l1.id]))[0]).toEqual({ status: "levert", navn: "Bjelkelag" });
    await as(JIM, "update public.leveranser set status = 'planlagt' where id = $1", [l1.id]);
    expect((await q("select status from public.leveranser where id = $1", [l1.id]))[0].status).toBe("levert");
    const jim = await idOf("Jim Kato");
    await as(STALE, "insert into public.oppgaver (prosjekt_id, tittel, fra, til, ansatte) values ($1, 'Bjelkelag', '2027-01-04', '2027-01-05', array[$2::uuid])", [p.id, jim]);
    await as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [p.id, p2.id]);
    expect(await q("select id from public.leveranser where prosjekt_id = $1", [p2.id])).toHaveLength(1);
    expect((await q("select leveranse_id from public.materialer where prosjekt_id = $1", [p2.id]))[0].leveranse_id).toBe(l1.id);
    expect(await q("select id from public.oppgaver where prosjekt_id = $1", [p2.id])).toHaveLength(1);
  });
  it("prosjektleder kan planlegge og styre materiell, men ikke sette seg selv som prosjektleder", async () => {
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Prosjektleder-test') returning id");
    await expect(as(JIM, "update public.ansatte set prosjektleder = true where epost = $1 returning id", [JIM])).resolves.toHaveLength(0);
    await as(STALE, "update public.ansatte set prosjektleder = true where epost = $1", [JIM]);
    await as(JIM, "insert into public.oppgaver (prosjekt_id, tittel, fra, til) values ($1, 'Fra prosjektleder', '2027-02-01', '2027-02-02')", [p.id]);
    await as(JIM, "insert into public.leveranser (prosjekt_id, navn) values ($1, 'Leveranse fra butikk')", [p.id]);
    expect((await as<any>(JIM, "select public.er_planlegger() as x"))[0].x).toBe(true);
    expect((await as<any>(JIM, "select public.er_leder() as x"))[0].x).toBe(false);
    await as(STALE, "update public.ansatte set prosjektleder = false where epost = $1", [JIM]);
    await expect(as(JIM, "insert into public.leveranser (prosjekt_id, navn) values ($1, 'Igjen')", [p.id])).rejects.toThrow();
  });
});

describe("sjekklister, SJA, HMS-kort og bestillinger", () => {
  const q = async (sql: string, p: any[] = []) => (await db.query<any>(sql, p)).rows;
  it("sjekkliste: alle punkter må besvares, signert er låst for ansatte, leder kan åpne igjen", async () => {
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Sjekkliste-prosjekt') returning id");
    const punkter = JSON.stringify([{ tekst: "Membran rundt sluk" }, { tekst: "Tykkelse målt" }]);
    const [s] = await as<any>(JIM, "insert into public.sjekklister (prosjekt_id, navn, punkter, status) values ($1, 'Våtrom', $2::jsonb, 'signert') returning id, status, opprettet_av", [p.id, punkter]);
    expect(s.status).toBe("pagaar");
    await expect(as(JIM, "update public.sjekklister set status = 'signert' where id = $1", [s.id])).rejects.toThrow(/besvares/);
    const svar = JSON.stringify([{ tekst: "Membran rundt sluk", svar: "ok" }, { tekst: "Tykkelse målt", svar: "avvik", kommentar: "0,8 mm, smurt på nytt" }]);
    await as(JIM, "update public.sjekklister set punkter = $2::jsonb, status = 'signert' where id = $1", [s.id, svar]);
    const [etter] = await q("select status, signert_av, signert_tid from public.sjekklister where id = $1", [s.id]);
    expect(etter.status).toBe("signert");
    expect(etter.signert_av).toBe(await idOf("Jim Kato"));
    await expect(as(JIM, "update public.sjekklister set navn = 'Endret' where id = $1", [s.id])).rejects.toThrow(/signert/);
    expect(await as(JIM, "delete from public.sjekklister where id = $1 returning id", [s.id])).toHaveLength(0);
    await as(STALE, "update public.sjekklister set status = 'pagaar' where id = $1", [s.id]);
    expect((await q("select signert_av from public.sjekklister where id = $1", [s.id]))[0].signert_av).toBeNull();
  });
  it("SJA: bare deltakere kvitterer, og endret innhold krever ny kvittering", async () => {
    const jim = await idOf("Jim Kato"), mads = await idOf("Mads Kjerstad");
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('SJA-prosjekt') returning id");
    const risiko = JSON.stringify([{ fare: "Fall fra tak", tiltak: "Sele og stillas med rekkverk" }]);
    const [s] = await as<any>(STALE, "insert into public.sja (prosjekt_id, arbeid, risikoer, deltakere) values ($1, 'Legge takstein', $2::jsonb, array[$3::uuid]) returning id", [p.id, risiko, jim]);
    await expect(as(MADS, "select public.kvitter_sja($1)", [s.id])).rejects.toThrow(/deltaker/);
    await as(JIM, "select public.kvitter_sja($1)", [s.id]);
    expect(Object.keys((await q("select kvittert from public.sja where id = $1", [s.id]))[0].kvittert)).toEqual([jim]);
    await expect(as(JIM, "update public.sja set kvittert = '{}'::jsonb, arbeid = 'Jim endret' where id = $1", [s.id])).rejects.toThrow(/Bare den som laget/);
    await as(STALE, "update public.sja set deltakere = array[$2::uuid, $3::uuid] where id = $1", [s.id, jim, mads]);
    expect(Object.keys((await q("select kvittert from public.sja where id = $1", [s.id]))[0].kvittert)).toEqual([jim]);
    await as(STALE, "update public.sja set arbeid = 'Legge takstein og beslag' where id = $1", [s.id]);
    expect((await q("select kvittert from public.sja where id = $1", [s.id]))[0].kvittert).toEqual({});
  });
  it("HMS-kort: hver ansatt kan lagre sitt eget", async () => {
    await as(JIM, "select public.lagre_mitt_hms_kort(' AB123456 ', '2028-05-01')");
    const [a] = await q("select hms_kort_nr, hms_kort_gyldig::text g from public.ansatte where epost = $1", [JIM]);
    expect(a).toEqual({ hms_kort_nr: "AB123456", g: "2028-05-01" });
  });
  it("bestilling: snekkeren bestiller og retter til butikken tar i mot; butikken styrer status", async () => {
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Bestilling-prosjekt') returning id");
    const linjer = JSON.stringify([{ beskrivelse: "Skruer 5x50", antall: 2, enhet: "pk" }]);
    await expect(as(JIM, "insert into public.bestillinger (prosjekt_id, linjer) values ($1, '[]'::jsonb)", [p.id])).rejects.toThrow();
    const [b] = await as<any>(JIM, "insert into public.bestillinger (prosjekt_id, linjer, status) values ($1, $2::jsonb, 'levert') returning id, status", [p.id, linjer]);
    expect(b.status).toBe("ny");
    await as(JIM, "update public.bestillinger set merknad = 'Haster' where id = $1", [b.id]);
    await as(JIM, "update public.bestillinger set status = 'levert' where id = $1", [b.id]);
    expect((await q("select status, merknad from public.bestillinger where id = $1", [b.id]))[0]).toEqual({ status: "ny", merknad: "Haster" });
    await expect(as(MADS, "update public.bestillinger set merknad = 'X' where id = $1", [b.id])).rejects.toThrow(/tatt i mot/);
    await as(STALE, "update public.bestillinger set status = 'plukkes' where id = $1", [b.id]);
    await expect(as(JIM, "update public.bestillinger set merknad = 'Etterpå' where id = $1", [b.id])).rejects.toThrow(/tatt i mot/);
    expect((await q("select behandlet_av from public.bestillinger where id = $1", [b.id]))[0].behandlet_av).toBe((await q("select id from public.ansatte where epost = $1", [STALE]))[0].id);
  });
});

describe("deler av appen", () => {
  it("bare leder slår av og på, og bare gyldige navn lagres", async () => {
    await expect(as(JIM, "select public.lagre_moduler(array['chat'])")).rejects.toThrow(/Bare leder/);
    await as(STALE, "select public.lagre_moduler(array['chat', 'vaer', 'chat', 'Ugyldig!', 'x'])");
    expect((await db.query<any>("select moduler_av from public.bedrifter where id = 1")).rows[0].moduler_av).toEqual(["chat", "vaer"]);
    await as(STALE, "select public.lagre_moduler(array[]::text[])");
    expect((await db.query<any>("select moduler_av from public.bedrifter where id = 1")).rows[0].moduler_av).toEqual([]);
  });
});

describe("tilleggsarbeid som underprosjekt", () => {
  it("timer føres på tillegget, bare på riktig prosjekt, og følger med fra stemplingen", async () => {
    const jim = await idOf("Jim Kato");
    await db.query("delete from public.timer where ansatt_id=$1", [jim]);
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Takjobb') returning id");
    const [p2] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Annen jobb') returning id");
    const [t] = await as<any>(JIM, "insert into public.tillegg (prosjekt_id, tittel, timer) values ($1, 'Råteskade tak', 6) returning id", [p.id]);
    const [x] = await as<any>(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, tillegg_id) values ($1, $2, '2027-05-03', '07:00', '11:00', $3) returning tillegg_id", [jim, p.id, t.id]);
    expect(x.tillegg_id).toBe(t.id);
    await expect(as(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, tillegg_id) values ($1, $2, '2027-05-04', '07:00', '11:00', $3)", [jim, p2.id, t.id])).rejects.toThrow(/hører ikke til/);
    await as(STALE, "update public.tillegg set status = 'avvist' where id = $1", [t.id]);
    await expect(as(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, tillegg_id) values ($1, $2, '2027-05-05', '07:00', '11:00', $3)", [jim, p.id, t.id])).rejects.toThrow(/avvist/);
    // Allerede førte timer kan fortsatt endres
    await as(JIM, "update public.timer set beskrivelse = 'Sviller' where tillegg_id = $1", [t.id]);
    await as(STALE, "update public.tillegg set status = 'utkast' where id = $1", [t.id]);
    // Stempling: velg tillegget mens du er inne, timene merkes ved utlogging
    await as(JIM, "select public.stemple('inn', $1)", [p.id]);
    await expect(as(JIM, "select public.stemple_tillegg($1)", [(await as<any>(STALE, "insert into public.tillegg (prosjekt_id, tittel) values ($1, 'Feil') returning id", [p2.id]))[0].id])).rejects.toThrow(/hører ikke til/);
    await as(JIM, "select public.stemple_tillegg($1)", [t.id]);
    expect((await db.query<any>("select tillegg_id from public.stempling where ansatt_id = $1", [jim])).rows[0].tillegg_id).toBe(t.id);
    await db.query("update public.stempling set fra='00:00', dato=(now() at time zone 'Europe/Oslo')::date where ansatt_id=$1", [jim]);
    await as(JIM, "select public.stemple('ut', null, 'Skiftet sviller', 0)");
    const r = await as<any>(JIM, "select tillegg_id from public.timer where ansatt_id=$1 and kilde = 'stempel'", [jim]);
    if (r.length) expect(r[0].tillegg_id).toBe(t.id);
    await db.query("delete from public.timer where ansatt_id=$1", [jim]);
  });
});

describe("personlige månedsrapporter og DG", () => {
  it("leder lager og publiserer, den ansatte ser bare sin egen og markerer lest", async () => {
    const jim = await idOf("Jim Kato"), mads = await idOf("Mads Kjerstad");
    await expect(as(JIM, "insert into public.personrapporter (ansatt_id, periode) values ($1, '2026-09-01')", [jim])).rejects.toThrow();
    const [r] = await as<any>(STALE, "insert into public.personrapporter (ansatt_id, periode, innhold) values ($1, '2026-09-01', '{\"timer\": 1}') returning id", [jim]);
    await as(STALE, "insert into public.personrapporter (ansatt_id, periode, publisert) values ($1, '2026-09-01', now())", [mads]);
    expect(await as(JIM, "select * from public.personrapporter")).toHaveLength(0); // utkast
    await as(STALE, "update public.personrapporter set publisert = now(), lest = now() where id = $1", [r.id]);
    const egne = await as<any>(JIM, "select id, lest from public.personrapporter");
    expect(egne).toHaveLength(1);
    expect(egne[0].lest).toBeNull(); // leder kan ikke sette lest
    await as(MADS, "select public.marker_personrapport_lest($1)", [r.id]); // ikke hans
    await as(JIM, "select public.marker_personrapport_lest($1)", [r.id]);
    expect((await as<any>(JIM, "select lest from public.personrapporter"))[0].lest).not.toBeNull();
    await as(STALE, "update public.personrapporter set publisert = null where id = $1", [r.id]);
    expect(await as(JIM, "select * from public.personrapporter")).toHaveLength(1);
  });
  it("DG-kategorier: bare leder endrer, og salgstallene leses bare av leder/prosjektleder", async () => {
    await expect(as(JIM, "select public.lagre_dg_kategorier('[]')")).rejects.toThrow(/Bare leder/);
    await expect(as(STALE, "select public.lagre_dg_kategorier('[{\"id\": \"X Y\", \"navn\": \"\", \"med\": [], \"uten\": []}]')")).rejects.toThrow(/Ugyldige/);
    const std = (await db.query<any>("select dg_kategorier from public.bedrifter where id = 1")).rows[0].dg_kategorier;
    expect(std.map((k: any) => k.id)).toEqual(["vinduer", "tak"]);
    await db.query("insert into public.salg_kategori_mnd (bedrift_id, aar, mnd, kategori, omsetning, db) values (1, 2026, 9, 'tak', 1000, 200)");
    expect(await as(JIM, "select * from public.salg_kategori_mnd")).toHaveLength(0);
    expect(await as(STALE, "select * from public.salg_kategori_mnd")).toHaveLength(1);
    await as(STALE, "select public.lagre_dg_kategorier($1)", [JSON.stringify(std)]);
    expect(await as(STALE, "select * from public.salg_kategori_mnd")).toHaveLength(0);
  });
});

describe("stempling uten nett", () => {
  it("køet stempling bruker tidspunktet da den ble trykket, og for gamle avvises", async () => {
    const jim = await idOf("Jim Kato");
    await db.query("delete from public.timer where ansatt_id=$1", [jim]);
    await db.query("delete from public.stempling where ansatt_id=$1", [jim]);
    const inn = (await db.query<any>("select (date_trunc('day', now() at time zone 'Europe/Oslo') + interval '1 minute') at time zone 'Europe/Oslo' t")).rows[0].t;
    const ut = (await db.query<any>("select now() - interval '1 minute' t")).rows[0].t;
    await as(JIM, "select public.stemple('inn', null, '', 0, null, $1)", [inn]);
    expect((await db.query<any>("select fra from public.stempling where ansatt_id=$1", [jim])).rows[0].fra).toBe("00:00:00");
    await as(JIM, "select public.stemple('ut', null, 'Uten nett', 0, null, $1)", [ut]);
    const t = await as<any>(JIM, "select fra, beskrivelse from public.timer where ansatt_id=$1", [jim]);
    if (t.length) expect(t[0]).toMatchObject({ fra: "00:00:00", beskrivelse: "Uten nett" });
    await expect(as(JIM, "select public.stemple('inn', null, '', 0, null, now() - interval '4 days')")).rejects.toThrow(/for gammel/);
    await db.query("delete from public.timer where ansatt_id=$1", [jim]);
  });
});

describe("reklamasjon satt opp per bedrift", () => {
  it("ansvarlig og frist settes automatisk, og timene føres der bedriften har valgt", async () => {
    const jim = await idOf("Jim Kato"), mads = await idOf("Mads Kjerstad");
    await expect(as(JIM, "select public.lagre_reklamasjon_oppsett('jobben', 'snekker', 14, null)")).rejects.toThrow(/Bare leder/);
    await expect(as(STALE, "select public.lagre_reklamasjon_oppsett('prosjekt', 'snekker', 14, null)")).rejects.toThrow(/Velg reklamasjonsprosjektet/);
    await as(STALE, "select public.lagre_reklamasjon_oppsett('jobben', 'snekker', 10, null)");
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn, snekker_id, selger_id) values ('Takjobb ferdig', $1, $2) returning id", [mads, jim]);
    const [r] = await as<any>(JIM, "insert into public.reklamasjoner (prosjekt_id, tittel, meldt_dato) values ($1, 'Lekkasje', current_date - 2) returning id, ansvarlig_id, frist::text frist, (current_date + 8)::text forventet", [p.id]);
    expect(r.ansvarlig_id).toBe(mads);
    expect(r.frist).toBe(r.forventet);
    // Timer på originaljobben
    const [t1] = await as<any>(MADS, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, reklamasjon_id) values ($1, null, '2027-06-01', '07:00', '09:00', $2) returning prosjekt_id, fakturerbar", [mads, r.id]);
    expect(t1).toEqual({ prosjekt_id: p.id, fakturerbar: false });
    // Interntid
    await as(STALE, "select public.lagre_reklamasjon_oppsett('intern', 'selger', 0, null)");
    const [t2] = await as<any>(MADS, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, reklamasjon_id) values ($1, $2, '2027-06-02', '07:00', '09:00', $3) returning prosjekt_id, fakturerbar", [mads, p.id, r.id]);
    expect(t2).toEqual({ prosjekt_id: null, fakturerbar: false });
    const [r2] = await as<any>(JIM, "insert into public.reklamasjoner (prosjekt_id, tittel) values ($1, 'Riss') returning ansvarlig_id, frist::text frist", [p.id]);
    expect(r2).toEqual({ ansvarlig_id: jim, frist: null });
    await db.query("delete from public.timer where ansatt_id = $1 and dato >= '2027-06-01'", [mads]);
    await as(STALE, "select public.lagre_reklamasjon_oppsett('jobben', 'snekker', 14, null)");
  });
});

describe("skjulte kampanjer", () => {
  it("bare leder ser hvem som har push, og driftsnøkkelen kan ikke leses", async () => {
    await db.query("insert into public.push_abonnement (endpoint, ansatt_id, p256dh, auth) values ($1, $2, $3, $4)", ["https://x/1", await idOf("Jim Kato"), "a", "b"]);
    expect((await as<any>(STALE, "select * from public.ansatte_med_push()")).map((x: any) => x.ansatte_med_push)).toContain(await idOf("Jim Kato"));
    expect(await as(JIM, "select * from public.ansatte_med_push()")).toHaveLength(0);
    await expect(as(STALE, "select verdi from public.drift_noekkel")).rejects.toThrow();
    expect((await db.query<any>("select length(verdi) n from public.drift_noekkel")).rows[0].n).toBe(64);
  });
  it("ansatt kan vise en skjult kampanje igjen", async () => {
    const [k] = await as<any>(STALE, "insert into public.kampanjer (tittel, fra, til, sider) values ('DM10', current_date, current_date + 7, array['a.png']) returning id");
    await as(JIM, "select public.skjul_kampanje($1)", [k.id]);
    await as(JIM, "select public.sett_vis_kampanjer(false)");
    expect((await db.query<any>("select skjulte_kampanjer, vis_kampanjer from public.ansatte where epost = $1", [JIM])).rows[0]).toEqual({ skjulte_kampanjer: [k.id], vis_kampanjer: false });
    await as(JIM, "select public.vis_kampanje($1)", [k.id]);
    expect((await db.query<any>("select skjulte_kampanjer, vis_kampanjer from public.ansatte where epost = $1", [JIM])).rows[0]).toEqual({ skjulte_kampanjer: [], vis_kampanjer: true });
  });
});

describe("logo og firmafarger", () => {
  const LOGO = "data:image/png;base64,iVBORw0KGgo=";
  it("bare leder lagrer, fargene kontrolleres, og fjernet drakt gir ByggLogg-blå", async () => {
    await expect(as(JIM, "select public.lagre_drakt($1, null, '{\"hoved\":\"#0a1ebe\",\"aksent\":\"#ffcd00\"}')", [LOGO])).rejects.toThrow(/Bare leder/);
    await expect(as(STALE, "select public.lagre_drakt($1, null, '{\"hoved\":\"blå\",\"aksent\":\"#ffcd00\"}')", [LOGO])).rejects.toThrow(/RRGGBB/);
    await expect(as(STALE, "select public.lagre_drakt('javascript:alert(1)', null, null)")).rejects.toThrow();
    await as(STALE, "select public.lagre_drakt($1, null, '{\"hoved\":\"#0a1ebe\",\"aksent\":\"#ffcd00\",\"x\":1}')", [LOGO]);
    const b = (await db.query<any>("select logo, drakt from public.bedrifter where id = 1")).rows[0];
    expect(b).toEqual({ logo: LOGO, drakt: { hoved: "#0A1EBE", aksent: "#FFCD00" } });
    await as(JIM, "select public.sett_mitt_tema('egen')");
    expect((await db.query<any>("select tema from public.ansatte where epost = $1", [JIM])).rows[0].tema).toBe("egen");
    await as(STALE, "select public.lagre_drakt(null, null, null)");
    expect((await db.query<any>("select tema from public.ansatte where epost = $1", [JIM])).rows[0].tema).toBe("byggfag");
    expect((await db.query<any>("select logo, drakt from public.bedrifter where id = 1")).rows[0]).toEqual({ logo: null, drakt: null });
    await as(STALE, "select public.lagre_drakt($1, null, '{\"hoved\":\"#0a1ebe\",\"aksent\":\"#ffcd00\"}', true)", [LOGO]);
    expect((await db.query<any>("select count(*)::int n from public.ansatte where tema <> 'egen' and bedrift_id = 1")).rows[0].n).toBe(0);
    await as(STALE, "select public.lagre_drakt(null, null, null)");
  });
});

describe("reklamasjon", () => {
  const q2 = async (sql: string, p: any[] = []) => (await db.query<any>(sql, p)).rows;
  it("ansatt registrerer, leder vurderer, ansvarlig melder utbedret og kunden kvitterer", async () => {
    const jim = await idOf("Jim Kato");
    const [p] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Ferdig bad') returning id");
    const [r] = await as<any>(JIM, "insert into public.reklamasjoner (prosjekt_id, tittel, status, vurdering) values ($1, 'Fuge sprukket', 'godkjent', 'Ja') returning id, status, vurdering, meldt_av", [p.id]);
    expect(r).toMatchObject({ status: "ny", vurdering: "", meldt_av: jim });
    await as(JIM, "update public.reklamasjoner set beskrivelse = 'Ved dusjhjørnet' where id = $1", [r.id]);
    await expect(as(MADS, "update public.reklamasjoner set status = 'avvist' where id = $1 returning id", [r.id])).resolves.toHaveLength(0);
    await as(JIM, "update public.reklamasjoner set status = 'godkjent' where id = $1", [r.id]);
    expect((await q2("select status from public.reklamasjoner where id = $1", [r.id]))[0].status).toBe("ny");
    await as(STALE, "update public.reklamasjoner set status = 'godkjent', vurdering = 'Vi fuger på nytt', ansvarlig_id = $2 where id = $1", [r.id, jim]);
    await expect(as(JIM, "update public.reklamasjoner set signatur = 'data:x', signert_navn = 'Kunde' where id = $1", [r.id])).rejects.toThrow(/utbedret/);
    await as(JIM, "update public.reklamasjoner set status = 'utbedret', vurdering = 'Endret av Jim' where id = $1", [r.id]);
    await as(JIM, "update public.reklamasjoner set signatur = 'data:x', signert_navn = 'Ola Kunde' where id = $1", [r.id]);
    const [e] = await q2("select status, vurdering, utbedret_av, signert_navn, signert_tid from public.reklamasjoner where id = $1", [r.id]);
    expect(e).toMatchObject({ status: "utbedret", vurdering: "Vi fuger på nytt", utbedret_av: jim, signert_navn: "Ola Kunde" });
    expect(e.signert_tid).not.toBeNull();
    expect(await as(JIM, "delete from public.reklamasjoner where id = $1 returning id", [r.id])).toHaveLength(0);
  });

  it("timer på reklamasjon føres på reklamasjonsprosjektet og faktureres ikke, også fra stempling", async () => {
    const jim = await idOf("Jim Kato");
    const [orig] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Gammel jobb') returning id");
    const [rp] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Reklamasjon internt') returning id");
    await expect(as(JIM, "select public.lagre_reklamasjonsprosjekt($1)", [rp.id])).rejects.toThrow(/Bare leder/);
    await as(STALE, "select public.lagre_reklamasjonsprosjekt($1)", [rp.id]);
    const [r] = await as<any>(JIM, "insert into public.reklamasjoner (prosjekt_id, tittel) values ($1, 'Dør går tregt') returning id", [orig.id]);
    const [t] = await as<any>(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, reklamasjon_id) values ($1, $2, '2027-03-01', '08:00', '10:00', $3) returning prosjekt_id, fakturerbar", [jim, orig.id, r.id]);
    expect(t).toEqual({ prosjekt_id: rp.id, fakturerbar: false });
    const [t2] = await as<any>(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til) values ($1, $2, '2027-03-01', '10:00', '11:00') returning fakturerbar, reklamasjon_id", [jim, rp.id]);
    expect(t2).toEqual({ fakturerbar: false, reklamasjon_id: null });
    // Stempling: reklamasjonen følger med når timene lages
    await db.exec(`delete from public.stempling where ansatt_id = '${jim}'`);
    await db.query("insert into public.stempling (ansatt_id, bedrift_id, prosjekt_id, dato, fra) values ($1, 1, $2, '2027-03-01', '12:00')", [jim, rp.id]);
    await as(JIM, "select public.stemple_reklamasjon($1)", [r.id]);
    await db.exec("select set_config('bygglogg.stempel', '1', false)");
    await db.query("insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til) values ($1, $2, '2027-03-01', '12:00', '14:00')", [jim, rp.id]);
    await db.exec("select set_config('bygglogg.stempel', '0', false)");
    expect((await q2("select sum(timer)::float t from public.timer where reklamasjon_id = $1", [r.id]))[0].t).toBeGreaterThan(3);
    await db.exec(`delete from public.stempling where ansatt_id = '${jim}'`);
    await as(STALE, "select public.lagre_reklamasjonsprosjekt(null)");
  });

  it("reklamasjonen flyttes med når prosjekter slås sammen", async () => {
    const [a] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Dobbel A') returning id");
    const [b] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Dobbel B') returning id");
    const [r] = await as<any>(JIM, "insert into public.reklamasjoner (prosjekt_id, tittel) values ($1, 'Lekker') returning id", [a.id]);
    await as(STALE, "select public.slaa_sammen_prosjekter($1, $2)", [a.id, b.id]);
    expect((await q2("select prosjekt_id from public.reklamasjoner where id = $1", [r.id]))[0].prosjekt_id).toBe(b.id);
  });
});

describe("invitasjon til appen", () => {
  const q2 = async (sql: string, p: any[] = []) => (await db.query<any>(sql, p)).rows;
  it("bare leder kan invitere, med e-post, og ikke flere ganger i minuttet", async () => {
    const jim = await idOf("Jim Kato");
    await expect(as(JIM, "select public.send_invitasjon($1)", [jim])).rejects.toThrow(/Bare leder/);
    await db.exec("delete from net.kall");
    await as(STALE, "select public.send_invitasjon($1)", [jim]);
    const [k] = await q2("select body from net.kall");
    expect(k.body.hendelse).toBe("invitasjon");
    const [i] = await q2("select id, epost, levert from public.invitasjoner where ansatt_id = $1", [jim]);
    expect(i).toMatchObject({ id: k.body.id, epost: JIM, levert: null });
    await expect(as(STALE, "select public.send_invitasjon($1)", [jim])).rejects.toThrow(/nettopp sendt/);
    const [uten] = await as<any>(STALE, "insert into public.ansatte (navn, avdeling_id) select 'Uten Epost', min(id) from public.avdelinger returning id");
    await expect(as(STALE, "select public.send_invitasjon($1)", [uten.id])).rejects.toThrow(/e-post/);
    // Ansatte ser ikke invitasjonene; leder ser status
    expect(await as(JIM, "select * from public.invitasjoner")).toHaveLength(0);
    expect(await as(JIM, "select * from public.ansatte_innlogging()")).toHaveLength(0);
    await db.query("insert into auth.users values ($1, now())", [JIM.toUpperCase()]);
    const rader = await as<any>(STALE, "select * from public.ansatte_innlogging()");
    const r = rader.find((x: any) => x.ansatt_id === jim);
    expect(r.invitert).not.toBeNull();
    expect(r.innlogget).not.toBeNull();
    expect(rader.find((x: any) => x.ansatt_id === uten.id).innlogget).toBeNull();
  });
});

describe("avdelingsrapport", () => {
  it("leder ser alle avdelinger, ansatte bare sin egen (navnet matcher Visma-avdelingen)", async () => {
    await db.exec(`insert into public.visma_avdelinger values (1, 1, 'Butikk'), (1, 3, 'Kjøkken & Interiør') on conflict do nothing;
      insert into public.avdeling_salg (bedrift_id, visma_ordrenr, avdeling_nr, fakturadato, kunde, omsetning, db, kostnad)
      values (1, 1, 3, '2026-03-01', 'A', 100, 25, 75), (1, 2, 1, '2026-03-01', 'B', 100, 30, 70) on conflict do nothing`);
    expect(await as(STALE, "select visma_ordrenr from public.avdeling_salg")).toHaveLength(2);
    expect(await as(JIM, "select visma_ordrenr from public.avdeling_salg")).toHaveLength(0);
    const ki = (await db.query<any>("select id from public.avdelinger where navn = 'Kjøkken og Interiør'")).rows[0].id;
    const tidl = (await db.query<any>("select avdeling_id from public.ansatte where epost = $1", [JIM])).rows[0].avdeling_id;
    await db.query("update public.ansatte set avdeling_id = $1 where epost = $2", [ki, JIM]);
    const r = await as<any>(JIM, "select visma_ordrenr from public.avdeling_salg");
    expect(r.map((x: any) => x.visma_ordrenr)).toEqual([1]);
    expect(await as(JIM, "select nr from public.visma_avdelinger")).toEqual([{ nr: 3 }]);
    await db.query("update public.ansatte set avdeling_id = $1 where epost = $2", [tidl, JIM]);
  });
});

describe("tilbudsoppfølging", () => {
  it("leder ser alle tilbud, selgeren bare sine egne, og oppfølging logges", async () => {
    const jimNavn = (await db.query<any>("select navn from public.ansatte where epost = $1", [JIM])).rows[0].navn;
    await db.query(`insert into public.tilbud (bedrift_id, visma_ordrenr, dato, kunde, belop, selger_navn)
      values (1, 9001, current_date - 10, 'Kari Tilbud', 50000, $1), (1, 9002, current_date - 10, 'Per Tilbud', 80000, 'Annen Selger')`, [jimNavn]);
    expect(await as(STALE, "select visma_ordrenr from public.tilbud")).toHaveLength(2);
    const egne = await as<any>(JIM, "select id, visma_ordrenr from public.tilbud");
    expect(egne.map((x: any) => x.visma_ordrenr)).toEqual([9001]);
    const andre = (await db.query<any>("select id from public.tilbud where visma_ordrenr = 9002")).rows[0].id;
    await expect(as(JIM, "select public.folg_opp_tilbud($1, 'ringt')", [andre])).rejects.toThrow(/Fant ikke/);
    await expect(as(JIM, "select public.folg_opp_tilbud($1, 'slett')", [egne[0].id])).rejects.toThrow(/Ukjent/);
    await expect(as(JIM, "select public.folg_opp_tilbud($1, 'ringt', '', current_date - 1)", [egne[0].id])).rejects.toThrow(/Ugyldig/);
    await as(JIM, "select public.folg_opp_tilbud($1, 'ringt', 'Venter på banken')", [egne[0].id]);
    let [t] = await as<any>(JIM, "select sist_kontakt, neste_kontakt - sist_kontakt as dager, notat, jsonb_array_length(logg) n, utfall from public.tilbud where id = $1", [egne[0].id]);
    expect(t.dager).toBe(7); expect(t.notat).toBe("Venter på banken"); expect(t.n).toBe(1); expect(t.utfall).toBeNull();
    await as(JIM, "select public.folg_opp_tilbud($1, 'tapt', 'Valgte en annen')", [egne[0].id]);
    [t] = await as<any>(JIM, "select neste_kontakt, utfall, jsonb_array_length(logg) n from public.tilbud where id = $1", [egne[0].id]);
    expect(t.utfall).toBe("tapt"); expect(t.neste_kontakt).toBeNull(); expect(t.n).toBe(2);
    // Ingen kan endre tilbudet direkte (bare via oppfølgingen)
    await expect(as(STALE, "update public.tilbud set belop = 1 where id = $1", [andre])).rejects.toThrow();
    await as(STALE, "select public.folg_opp_tilbud($1, 'utsett', '', current_date + 3)", [andre]);
    expect((await db.query<any>("select neste_kontakt - current_date as d from public.tilbud where id = $1", [andre])).rows[0].d).toBe(3);
    await db.query("delete from public.tilbud where visma_ordrenr in (9001, 9002)");
  });
});

describe("ukesjekk", () => {
  it("teller det som venter på leder, og hopper over moduler som er slått av", async () => {
    await db.query(`insert into public.tilbud (bedrift_id, visma_ordrenr, dato, kunde, belop, selger_navn)
      values (1, 9101, current_date - 10, 'A', 50000, ''), (1, 9102, current_date - 2, 'B', 50000, ''), (1, 9103, current_date - 10, 'C', 1000, '')`);
    const t = (await db.query<any>("select public.ukesjekk_tall(1::smallint) j")).rows[0].j;
    expect(t.tilbud).toBe(1);
    expect(typeof t.soknader).toBe("number");
    await expect(as(STALE, "select public.ukesjekk_tall(1::smallint)")).rejects.toThrow();
    await db.query("update public.bedrifter set moduler_av = '{tilbud}' where id = 1");
    expect((await db.query<any>("select public.ukesjekk_tall(1::smallint) j")).rows[0].j.tilbud).toBeUndefined();
    await db.query("update public.bedrifter set moduler_av = '{}' where id = 1");
    await db.query("delete from public.tilbud where visma_ordrenr between 9101 and 9103");
  });
});

describe("serviceoppdrag", () => {
  const q4 = async (sql: string, p: any[] = []) => (await db.query<any>(sql, p)).rows;
  it("må være på en kunde, snekker kan registrere og ta det selv, leder deler ut", async () => {
    const jim = await idOf("Jim Kato");
    const [k] = await q4("insert into public.kunder (bedrift_id, navn, telefon) values (1, 'Kari Service', '+47 912 34 567') returning id");
    await expect(as(STALE, "insert into public.serviceoppdrag (tittel) values ('Uten kunde')")).rejects.toThrow(/kunde/);
    // Snekker kan ikke dele ut til andre
    const mads = await idOf("Mads Kjerstad");
    const [a] = await as<any>(JIM, "insert into public.serviceoppdrag (kunde_id, tittel, ansvarlig_id, status, dato) values ($1, 'Skifte lås', $2, 'planlagt', '2027-01-04') returning status, ansvarlig_id", [k.id, mads]);
    expect(a).toEqual({ status: "ny", ansvarlig_id: null });
    const [b] = await as<any>(JIM, "insert into public.serviceoppdrag (kunde_id, tittel, ansvarlig_id, status, dato) values ($1, 'Lekk takrenne', $2, 'planlagt', '2027-01-04') returning id, status", [k.id, jim]);
    expect(b.status).toBe("planlagt");
    // Leder planlegger: krever ansvarlig og dato, maks 2 dager
    const [c] = await as<any>(STALE, "insert into public.serviceoppdrag (kunde_id, tittel, prioritet) values ($1, 'Dør henger', 'haster') returning id", [k.id]);
    await expect(as(STALE, "update public.serviceoppdrag set status = 'planlagt' where id = $1", [c.id])).rejects.toThrow(/hvem/);
    await expect(as(STALE, "update public.serviceoppdrag set dager = 3 where id = $1", [c.id])).rejects.toThrow();
    await as(STALE, "update public.serviceoppdrag set status = 'planlagt', ansvarlig_id = $2, dato = '2027-01-05', dager = 2 where id = $1", [c.id, jim]);
    // Ansvarlig melder ferdig, men kan ikke merke fakturert
    await as(JIM, "update public.serviceoppdrag set status = 'fakturert' where id = $1", [c.id]);
    expect((await q4("select status from public.serviceoppdrag where id = $1", [c.id]))[0].status).toBe("planlagt");
    await as(JIM, "update public.serviceoppdrag set status = 'ferdig', materiell = $2 where id = $1", [c.id, JSON.stringify([{ beskrivelse: "Hengsel", antall: 2, enhet: "stk" }])]);
    const [f] = await q4("select status, ferdig_av, ferdig_tid from public.serviceoppdrag where id = $1", [c.id]);
    expect(f.status).toBe("ferdig"); expect(f.ferdig_av).toBe(jim);
    await as(STALE, "update public.serviceoppdrag set status = 'fakturert', visma_ordrenr = '12345' where id = $1", [c.id]);
    expect((await q4("select fakturert_tid from public.serviceoppdrag where id = $1", [c.id]))[0].fakturert_tid).not.toBeNull();
    await expect(as(MADS, "update public.serviceoppdrag set tittel = 'x' where id = $1", [b.id])).rejects.toThrow(/Bare leder/);
  });

  it("timer føres på serviceprosjektet og er fakturerbare", async () => {
    const jim = await idOf("Jim Kato");
    const [sp] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Service 2027') returning id");
    const [annet] = await as<any>(STALE, "insert into public.prosjekter (navn) values ('Annen jobb') returning id");
    const [o] = await q4("select id from public.serviceoppdrag where tittel = 'Lekk takrenne'");
    await expect(as(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, service_id) values ($1, $2, '2027-01-04', '08:00', '10:00', $3)", [jim, annet.id, o.id])).rejects.toThrow(/serviceprosjekt/);
    await expect(as(JIM, "select public.lagre_serviceprosjekt($1)", [sp.id])).rejects.toThrow(/Bare leder/);
    await as(STALE, "select public.lagre_serviceprosjekt($1)", [sp.id]);
    const [t] = await as<any>(JIM, "insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, service_id, fakturerbar) values ($1, $2, '2027-01-04', '08:00', '10:00', $3, false) returning prosjekt_id, fakturerbar", [jim, annet.id, o.id]);
    expect(t).toEqual({ prosjekt_id: sp.id, fakturerbar: true });
  });

  it("kunden kan melde fra via skjema uten innlogging, med sperre mot misbruk", async () => {
    const [{ k }] = await q4("select service_skjema_nokkel k from public.bedrifter where id = 1");
    expect(k.length).toBeGreaterThanOrEqual(20);
    expect((await as<any>(null, "select public.service_skjema_info($1) i", [k]))[0].i.navn).toBeTruthy();
    expect((await as<any>(null, "select public.service_skjema_info('feil-nokkel-som-er-lang-nok') i"))[0].i).toBeNull();
    await expect(as(null, "select public.meld_service('feil-nokkel-som-er-lang-nok', 'Ola', '91234567', '', '', 'Tett sluk på bad')")).rejects.toThrow(/ikke i bruk/);
    await as(null, "select public.meld_service($1, 'Kari Service', '912 34 567', 'kari@example.no', 'Vegen 1', 'Dør går tregt\nMå høvles', true)", [k]);
    const [r] = await q4("select kilde, status, prioritet, tittel, kunde_id is not null kjent from public.serviceoppdrag where kilde = 'skjema'");
    expect(r).toEqual({ kilde: "skjema", status: "ny", prioritet: "haster", tittel: "Dør går tregt", kjent: true });
    await as(null, "select public.meld_service($1, 'Robot', '99999999', '', '', 'Spam spam spam', false, 'http://x')", [k]);
    expect(await q4("select 1 from public.serviceoppdrag where kunde_navn = 'Robot'")).toHaveLength(0);
    await expect(as(null, "select * from public.serviceoppdrag")).rejects.toThrow();
  });
});

describe("språk", () => {
  it("ansatte kan velge norsk, polsk, engelsk eller litauisk", async () => {
    for (const s of ["en", "lt", "pl", "nb"]) {
      await as(JIM, "select public.sett_mitt_sprak($1)", [s]);
      expect((await db.query<any>("select sprak from public.ansatte where epost = $1", [JIM])).rows[0].sprak).toBe(s);
    }
    await expect(as(JIM, "select public.sett_mitt_sprak('de')")).rejects.toThrow(/Ukjent/);
  });
});
