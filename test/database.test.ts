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
    await expect(as(JIM, "insert into public.prosjekter (navn) values ('Eget')")).rejects.toThrow();
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
    await as(JIM, "select public.stemple('ut', null, 'Montert vinduer', 30)");
    const t = await as<any>(JIM, "select fra, kilde, beskrivelse, lunsj_min, prosjekt_id from public.timer where ansatt_id=$1", [jim]);
    if (t.length) { // tom hvis testen kjøres rett etter midnatt (ut før 07:00)
      expect(t[0].kilde).toBe("stempel");
      expect(t[0].beskrivelse).toBe("Montert vinduer");
      expect(t[0].prosjekt_id).toBe(p);
      await as(JIM, "update public.timer set beskrivelse='x', til=til where ansatt_id=$1", [jim]); await as(JIM, "update public.timer set fra='00:15' where ansatt_id=$1", [jim]);
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
});
