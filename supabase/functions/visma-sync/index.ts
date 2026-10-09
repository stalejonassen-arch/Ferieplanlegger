// Henter kunder og prosjekter fra Visma Business NXT inn i ByggLogg (bare lesing i Visma).
// Kjøres av pg_cron hvert kvarter. ?skjema=1 viser hvilke felt Visma tilbyr (for feilsøking).
// Publiseres uten JWT-sjekk. Trenger hemmeligheten VISMA_CLIENT_SECRET. (v2)
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLIENT_ID = Deno.env.get("VISMA_CLIENT_ID") ?? "isv_bygglogg";
const SCOPE = "business-graphql-service-api:access-group-based-readonly";
const GQL = "https://business.visma.net/api/graphql-service";

async function token() {
  const secret = Deno.env.get("VISMA_CLIENT_SECRET");
  if (!secret) throw new Error("VISMA_CLIENT_SECRET mangler");
  const res = await fetch("https://connect.visma.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${CLIENT_ID}:${secret}`) },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Visma Connect svarte ${res.status}: ${j.error ?? ""} ${j.error_description ?? ""}`);
  return j.access_token as string;
}

async function gql(tok: string, query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(GQL, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (!res.ok || j.errors?.length) throw new Error(`Business NXT: ${res.status} ${JSON.stringify(j.errors ?? j).slice(0, 500)}`);
  return j.data;
}

/** Feltene som finnes på en tabelltype, så vi bare spør etter felt som eksisterer. */
async function felt(tok: string, type: string) {
  const d = await gql(tok, `query($n: String!) { __type(name: $n) { fields { name } } }`, { n: type });
  return new Set<string>((d.__type?.fields ?? []).map((f: { name: string }) => f.name));
}
const velg = (finnes: Set<string>, ønsket: string[]) => ønsket.filter((f) => finnes.has(f));

/** Henter alle rader fra en tabell med sidevisning. */
async function alle(tok: string, firma: number, tabell: string, felter: string[], filter?: string) {
  const ut: Record<string, unknown>[] = [];
  let etter: string | null = null;
  for (let side = 0; side < 200; side++) {
    const d = await gql(tok, `query($etter: String) { useCompany(no: ${firma}) { ${tabell}(first: 500, after: $etter${filter ? `, filter: ${filter}` : ""}) {
      pageInfo { hasNextPage endCursor } items { ${felter.join(" ")} } } } }`, { etter });
    const t = d.useCompany[tabell];
    ut.push(...(t?.items ?? []));
    if (!t?.pageInfo?.hasNextPage) break;
    etter = t.pageInfo.endCursor;
  }
  return ut;
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    const { data: bedrifter } = await sb.from("bedrifter").select("id, visma_firma_nr").not("visma_firma_nr", "is", null);
    const tok = await token();
    if (url.searchParams.get("typer")) {
      const re = new RegExp(url.searchParams.get("typer")!, "i");
      const d = await gql(tok, `{ __schema { types { name } } }`);
      return Response.json(d.__schema.types.map((t: { name: string }) => t.name).filter((n: string) => re.test(n)));
    }
    if (url.searchParams.get("firmaer")) {
      const q = await gql(tok, `{ __type(name: "Query") { fields { name type { name kind ofType { name } } } } }`);
      const f = q.__type.fields.find((x: { name: string }) => x.name === "availableCompanies");
      const tn = f.type.name ?? f.type.ofType?.name;
      const t = await gql(tok, `query($n: String!) { __type(name: $n) { fields { name type { name kind ofType { name kind ofType { name } } } } } }`, { n: tn });
      const items = t.__type.fields.find((x: { name: string }) => x.name === "items");
      const itn = items?.type.ofType?.ofType?.name ?? items?.type.ofType?.name ?? items?.type.name;
      const ft = await felt(tok, itn);
      const d = await gql(tok, `{ availableCompanies { items { ${[...ft].join(" ")} } } }`);
      return Response.json(d);
    }
    if (url.searchParams.get("type")) {
      return Response.json([...(await felt(tok, url.searchParams.get("type")!))].sort());
    }
    const aFelt = await felt(tok, "Associate");
    const kundeFelt = velg(aFelt, ["associateNo", "customerNo", "name", "addressLine1", "postCode", "postalArea", "phone", "mobilePhone", "emailAddress"]);
    const rapport: Record<string, unknown> = {};

    for (const b of bedrifter ?? []) {
      // I Business NXT er prosjekter en «organisatorisk enhet» (orgUnit1–12). Finn klassen som heter Prosjekt.
      const navnFelt = Array.from({ length: 12 }, (_, i) => `orgUnit${i + 1}Name`);
      const ci = await gql(tok, `{ useCompany(no: ${b.visma_firma_nr}) { companyInformation { items { ${navnFelt.join(" ")} } } } }`);
      const info = ci.useCompany.companyInformation.items?.[0] ?? {};
      const klasser = navnFelt.map((f, i) => ({ nr: i + 1, navn: s(info[f]) }));
      const klasse = klasser.find((k) => /prosjekt|project/i.test(k.navn));
      if (url.searchParams.get("skjema") === "1") {
        return Response.json({ klasser, Associate: [...aFelt].sort(), prosjektFelt: klasse ? [...(await felt(tok, `OrgUnit${klasse.nr}`))].filter((f) => !/^join|AsDate$|AsTime$|AsEnum$|Flags$/.test(f)).sort() : null });
      }

      // Kunder: alle aktører med kundenummer
      const kunder = (await alle(tok, b.visma_firma_nr, "associate", kundeFelt, "{ customerNo: { _gt: 0 } }"))
        .map((k) => ({
          bedrift_id: b.id, visma_nr: Number(k.customerNo), navn: s(k.name) || `Kunde ${k.customerNo}`,
          adresse: s(k.addressLine1), postnr: s(k.postCode), poststed: s(k.postalArea),
          telefon: s(k.mobilePhone) || s(k.phone), epost: s(k.emailAddress), oppdatert: new Date().toISOString(),
        }));
      for (let i = 0; i < kunder.length; i += 500) {
        const { error } = await sb.from("kunder").upsert(kunder.slice(i, i + 500), { onConflict: "bedrift_id,visma_nr" });
        if (error) throw error;
      }
      const { data: kmap } = await sb.from("kunder").select("id, visma_nr").eq("bedrift_id", b.id).not("visma_nr", "is", null);
      const kundeId = new Map((kmap ?? []).map((k) => [k.visma_nr, k.id]));

      // Bruk den første prosjektklassen som faktisk har prosjekter (f.eks. «Prosjekt» eller «Kundeprosjekt»)
      const kandidater = klasser.filter((k) => /prosjekt|project/i.test(k.navn));
      if (!kandidater.length) throw new Error(`Fant ingen organisatorisk enhet som heter Prosjekt (${klasser.map((k) => k.navn).filter(Boolean).join(", ")})`);
      let pk = kandidater[0], nrFelt = `orgUnit${pk.nr}No`, rader: Record<string, unknown>[] = [];
      for (const k of kandidater) {
        const pf = await felt(tok, `OrgUnit${k.nr}`);
        const nf = [`orgUnit${k.nr}No`, "orgUnitNo", "no"].find((f) => pf.has(f)) ?? `orgUnit${k.nr}No`;
        const r = await alle(tok, b.visma_firma_nr, `orgUnit${k.nr}`, [nf, ...velg(pf, ["name", "customerNo", "addressLine1", "postalArea", "actualStartDate", "actualEndDate", "inactive", "blocked", "finished", "closed"])]);
        if (r.some((p) => Number(p[nf]) > 0)) { pk = k; nrFelt = nf; rader = r; break; }
      }
      const prosjekter = rader
        .filter((p) => Number(p[nrFelt]) > 0)
        .map((p) => {
          const rad: Record<string, unknown> = {
            bedrift_id: b.id, visma_nr: Number(p[nrFelt]), navn: s(p.name) || `Prosjekt ${p[nrFelt]}`,
            kunde_id: kundeId.get(Number(p.customerNo)) ?? null, adresse: [s(p.addressLine1), s(p.postalArea)].filter(Boolean).join(", "),
            oppdatert: new Date().toISOString(),
          };
          // Datoer i Business NXT er heltall som 20261001; 0 betyr ikke satt
          const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
          if ("actualStartDate" in p) rad.start = dato(p.actualStartDate);
          if ("actualEndDate" in p) rad.slutt = dato(p.actualEndDate);
          const ferdig = p.inactive ?? p.blocked ?? p.finished ?? p.closed;
          if (ferdig !== undefined) rad.aktiv = !(ferdig === true || Number(ferdig) > 0);
          return rad;
        });
      for (let i = 0; i < prosjekter.length; i += 500) {
        const { error } = await sb.from("prosjekter").upsert(prosjekter.slice(i, i + 500), { onConflict: "bedrift_id,visma_nr" });
        if (error) throw error;
      }
      rapport[`bedrift ${b.id}`] = { kunder: kunder.length, prosjekter: prosjekter.length, prosjektklasse: `${pk.nr} ${pk.navn}` };
    }
    await sb.from("visma_sync_logg").insert({ ok: true, melding: JSON.stringify(rapport) });
    return Response.json(rapport);
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e);
    await sb.from("visma_sync_logg").insert({ ok: false, melding: melding.slice(0, 2000) });
    return new Response(melding, { status: 500 });
  }
});
