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
});
