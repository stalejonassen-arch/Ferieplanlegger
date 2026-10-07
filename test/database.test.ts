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
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
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
});
