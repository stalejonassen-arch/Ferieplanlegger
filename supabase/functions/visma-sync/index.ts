// Henter kunder og prosjekter fra Visma Business NXT inn i ByggLogg (bare lesing i Visma).
// Kjøres av pg_cron hvert kvarter. ?skjema=1 viser hvilke felt Visma tilbyr (for feilsøking).
// Publiseres uten JWT-sjekk. Trenger hemmeligheten VISMA_CLIENT_SECRET. (v6: fakturakunde)
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

/** NOBB-nummer: fra vareens nettside (nobb.no/nobbnr/12345678) eller et varenummer på 7–8 siffer. */
export function finnNobb(varenr: string, nettside = "") {
  const m = nettside.match(/nobbnr\/(\d{6,9})/i);
  if (m) return m[1];
  return /^\d{7,8}$/.test(varenr) ? varenr : "";
}

async function synkVarer(tok: string, b: { id: number; visma_firma_nr: number }, klasseNr: number) {
  const lf = await felt(tok, "OrderLine");
  const pf = `orgUnit${klasseNr}`;
  const pFelt = await felt(tok, "Product");
  const pInfo = velg(pFelt, ["eanItemNo", "webPage"]);
  const linjeFelt = ["orderNo", "productNo", pf, ...velg(lf, ["description", "totalQuantity", "orderType"])];
  const ekstra = [lf.has("joinup_Product") && pInfo.length ? `joinup_Product { ${pInfo.join(" ")} }` : "", lf.has("joinup_Unit") ? "joinup_Unit { description }" : ""].filter(Boolean);
  let linjer: Record<string, unknown>[];
  try { linjer = await alle(tok, b.visma_firma_nr, "orderLine", [...linjeFelt, ...ekstra], `{ ${pf}: { _gt: 0 } }`); }
  catch { linjer = await alle(tok, b.visma_firma_nr, "orderLine", linjeFelt, `{ ${pf}: { _gt: 0 } }`); }

  const { data: pmap } = await sb.from("prosjekter").select("id, visma_nr").eq("bedrift_id", b.id).not("visma_nr", "is", null);
  const pid = new Map((pmap ?? []).map((x) => [x.visma_nr, x.id]));
  // Summer per prosjekt, vare og ordretype. Samme vare kan ligge både på innkjøp og salg; da brukes den største summen.
  const sum = new Map<string, number>();
  const per = new Map<string, { prosjekt_id: string; varenr: string; beskrivelse: string; antall: number; enhet: string }>();
  const varer = new Map<string, { varenr: string; beskrivelse: string; nobb_nr: string; ean: string }>();
  for (const l of linjer) {
    const vnr = s(l.productNo), p = pid.get(Number(l[pf]));
    if (!vnr || !p) continue;
    const pr = (l.joinup_Product ?? {}) as Record<string, unknown>;
    const nobb = finnNobb(vnr, s(pr.webPage));
    if (!nobb) continue; // fritekstlinjer (frakt, arbeid o.l.) har ikke FDV
    const key = `${p}|${vnr}`, tk = `${key}|${s(l.orderType)}`;
    sum.set(tk, (sum.get(tk) ?? 0) + (Number(l.totalQuantity) || 0));
    const r = per.get(key) ?? { prosjekt_id: p, varenr: vnr, beskrivelse: s(l.description), antall: 0, enhet: s((l.joinup_Unit as Record<string, unknown> | null)?.description) };
    r.antall = Math.max(r.antall, sum.get(tk)!);
    per.set(key, r);
    if (!varer.has(vnr)) varer.set(vnr, { varenr: vnr, beskrivelse: s(l.description), nobb_nr: nobb, ean: s(pr.eanItemNo) });
  }
  const naa = new Date().toISOString();
  // Varer: ikke overskriv det leder har rettet
  const { data: manuelle } = await sb.from("varer").select("varenr").eq("bedrift_id", b.id).eq("manuell", true);
  const låst = new Set((manuelle ?? []).map((x) => x.varenr));
  const vr = [...varer.values()].filter((v) => !låst.has(v.varenr)).map((v) => ({ ...v, bedrift_id: b.id, oppdatert: naa }));
  for (let i = 0; i < vr.length; i += 500) {
    const { error } = await sb.from("varer").upsert(vr.slice(i, i + 500), { onConflict: "bedrift_id,varenr" });
    if (error) throw error;
  }
  const rader = [...per.values()].filter((r) => r.antall > 0).map((r) => ({ ...r, antall: Math.round(r.antall * 1000) / 1000, bedrift_id: b.id, oppdatert: naa }));
  for (let i = 0; i < rader.length; i += 500) {
    const { error } = await sb.from("prosjekt_vare").upsert(rader.slice(i, i + 500), { onConflict: "prosjekt_id,varenr" });
    if (error) throw error;
  }
  await sb.from("prosjekt_vare").delete().eq("bedrift_id", b.id).lt("oppdatert", naa);
  return rader.length;
}

/** Utstyrskontoene (verktøy, arbeidstøy og forbruk per ansatt): alle linjer med dato og pris.
 *  Fritekstlinjer («T») etter en diverse-linje legges til beskrivelsen, f.eks. «Diverse – regnkle». */
async function synkUtstyr(tok: string, b: { id: number; visma_firma_nr: number }, klasseNr: number) {
  const { data: kontoer } = await sb.from("ansatte").select("utstyr_prosjekt_id").eq("bedrift_id", b.id).not("utstyr_prosjekt_id", "is", null);
  const pids = (kontoer ?? []).map((k) => k.utstyr_prosjekt_id as string);
  if (!pids.length) return 0;
  const { data: pr } = await sb.from("prosjekter").select("id, visma_nr").in("id", pids).not("visma_nr", "is", null);
  const pid = new Map((pr ?? []).map((x) => [Number(x.visma_nr), x.id as string]));
  if (!pid.size) return 0;
  const pf = `orgUnit${klasseNr}`;
  const linjer = await alle(tok, b.visma_firma_nr, "orderLine",
    ["orderNo", "lineNo", "productNo", "description", "totalQuantity", "priceInCurrency", "createdDate", pf, "joinup_Order { orderDate }", "joinup_Product { webPage }", "joinup_Unit { description }"],
    `{ ${pf}: { _in: [${[...pid.keys()].join(",")}] } }`);
  linjer.sort((a, z) => Number(a.orderNo) - Number(z.orderNo) || Number(a.lineNo) - Number(z.lineNo));
  const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
  const rader: Record<string, unknown>[] = [];
  for (const l of linjer) {
    const vnr = s(l.productNo), antall = Number(l.totalQuantity) || 0, tekst = s(l.description);
    const forrige = rader[rader.length - 1];
    // Ren tekstlinje: beskriver linjen over (samme ordre)
    if (antall === 0) {
      if (forrige && forrige.visma_ordrenr === Number(l.orderNo) && tekst && !/^\d{7,8}$/.test(String(forrige.varenr))) forrige.beskrivelse = `${forrige.beskrivelse} – ${tekst}`;
      continue;
    }
    const p = pid.get(Number(l[pf]));
    if (!p || !tekst) continue;
    rader.push({
      bedrift_id: b.id, kilde: "visma", visma_ordrenr: Number(l.orderNo), linjenr: Number(l.lineNo), prosjekt_id: p,
      dato: dato((l.joinup_Order as Record<string, unknown> | null)?.orderDate) ?? dato(l.createdDate) ?? new Date().toISOString().slice(0, 10),
      varenr: vnr, nobb_nr: finnNobb(vnr, s((l.joinup_Product as Record<string, unknown> | null)?.webPage)), beskrivelse: tekst,
      antall: Math.round(antall * 1000) / 1000, enhet: s((l.joinup_Unit as Record<string, unknown> | null)?.description),
      pris: Math.round((Number(l.priceInCurrency) || 0) * 100) / 100,
    });
  }
  const naa = new Date().toISOString();
  for (let i = 0; i < rader.length; i += 500) {
    const { error } = await sb.from("utstyr").upsert(rader.slice(i, i + 500), { onConflict: "bedrift_id,visma_ordrenr,linjenr" });
    if (error) throw error;
  }
  // Linjer som er slettet i Visma fjernes, men ikke hvis noen har lagt inn bilde eller serienummer
  await sb.from("utstyr").delete().eq("bedrift_id", b.id).eq("kilde", "visma").lt("oppdatert", naa).in("prosjekt_id", [...pid.values()]).eq("serienr", "").is("bilde_sti", null);
  return rader.length;
}

/** Fakturerte timer: ordrelinjer med produktet «Arbeid» på salgsordrer (ikke tilbud). */
async function synkArbeid(tok: string, b: { id: number; visma_firma_nr: number }, klasseNr: number) {
  const { data: bf } = await sb.from("bedrifter").select("arbeid_varenr").eq("id", b.id).single();
  const varenr: string[] = (bf?.arbeid_varenr as string[] | null)?.filter(Boolean) ?? [];
  if (!varenr.length) return 0;
  const pf = `orgUnit${klasseNr}`;
  const linjer = await alle(tok, b.visma_firma_nr, "orderLine",
    ["orderNo", "lineNo", "productNo", pf, "totalQuantity", "finished", "unrealisedQuantity", "priceInCurrency", "finishDate", "invoiceNo",
      `joinup_Order { orderDate customerNo transactionType orderType ${pf} }`],
    `{ productNo: { _in: [${varenr.map((v) => JSON.stringify(v)).join(",")}] } }`);
  const { data: pmap } = await sb.from("prosjekter").select("id, visma_nr").eq("bedrift_id", b.id).not("visma_nr", "is", null);
  const pid = new Map((pmap ?? []).map((x) => [Number(x.visma_nr), x.id as string]));
  const { data: kmap } = await sb.from("kunder").select("id, visma_nr").eq("bedrift_id", b.id).not("visma_nr", "is", null);
  const kid = new Map((kmap ?? []).map((x) => [Number(x.visma_nr), x.id as string]));
  const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
  const n = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
  const naa = new Date().toISOString();
  const rader = linjer.flatMap((l) => {
    const o = (l.joinup_Order ?? {}) as Record<string, unknown>;
    // Bare salgsordrer (transaksjonstype 1); tilbud (ordretype 5) telles ikke
    if (Number(o.transactionType) !== 1 || Number(o.orderType) === 5) return [];
    return [{
      bedrift_id: b.id, visma_ordrenr: Number(l.orderNo), linjenr: Number(l.lineNo), ordredato: dato(o.orderDate), fakturadato: dato(l.finishDate),
      fakturanr: s(l.invoiceNo), kunde_id: kid.get(Number(o.customerNo)) ?? null,
      prosjekt_id: pid.get(Number(l[pf])) ?? pid.get(Number(o[pf])) ?? null, varenr: s(l.productNo),
      antall: n(l.totalQuantity), fakturert: n(l.finished), ikke_fakturert: n(l.unrealisedQuantity), pris: n(l.priceInCurrency), oppdatert: naa,
    }];
  });
  for (let i = 0; i < rader.length; i += 500) {
    const { error } = await sb.from("fakturerte_timer").upsert(rader.slice(i, i + 500), { onConflict: "bedrift_id,visma_ordrenr,linjenr" });
    if (error) throw error;
  }
  await sb.from("fakturerte_timer").delete().eq("bedrift_id", b.id).lt("oppdatert", naa);
  return rader.length;
}

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
    if (url.searchParams.get("prove")) {
      // Feilsøking: ?prove=orderLine&felt=productNo,description&filter={...}&n=10
      const f = url.searchParams.get("filter");
      const d = await gql(tok, `{ useCompany(no: ${bedrifter?.[0]?.visma_firma_nr}) { ${url.searchParams.get("prove")}(first: ${Number(url.searchParams.get("n")) || 10}${f ? `, filter: ${f}` : ""}) { items { ${(url.searchParams.get("felt") ?? "").split(",").join(" ")} } } } }`);
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
      // Ordrer knyttet til prosjektene (materiell, salg og dekningsbidrag). Krever lesetilgang til ordretabellen.
      let ordreAntall: number | string = 0;
      try {
        const oFelt = await felt(tok, "Order");
        const pf = `orgUnit${pk.nr}`;
        const ofelter = ["orderNo", pf, ...velg(oFelt, ["orderDate", "orderType", "transactionType", "name", "customerNo", "orderSumNetDomestic", "incurredCostTotalDomestic", "grossProfitTotalDomestic", "invoicedAmountTotalDomestic", "finishDate"])];
        const ordrer = await alle(tok, b.visma_firma_nr, "order", ofelter, `{ ${pf}: { _gt: 0 } }`);
        const { data: pmap } = await sb.from("prosjekter").select("id, visma_nr").eq("bedrift_id", b.id).not("visma_nr", "is", null);
        const pid = new Map((pmap ?? []).map((x) => [x.visma_nr, x.id]));
        const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
        const n = (v: unknown) => Number(v) || 0;
        const rader2 = ordrer.filter((o) => pid.has(Number(o[pf]))).map((o) => ({
          bedrift_id: b.id, visma_ordrenr: n(o.orderNo), prosjekt_id: pid.get(Number(o[pf])), ordredato: dato(o.orderDate),
          ordretype: n(o.orderType), transaksjonstype: n(o.transactionType), navn: s(o.name),
          sum_netto: n(o.orderSumNetDomestic), kostnad: n(o.incurredCostTotalDomestic), dekningsbidrag: n(o.grossProfitTotalDomestic),
          fakturert: n(o.invoicedAmountTotalDomestic), ferdig: dato(o.finishDate), oppdatert: new Date().toISOString(),
        }));
        for (let i = 0; i < rader2.length; i += 500) {
          const { error } = await sb.from("prosjekt_ordre").upsert(rader2.slice(i, i + 500), { onConflict: "bedrift_id,visma_ordrenr" });
          if (error) throw error;
        }
        ordreAntall = rader2.length;
        // Kunden som faktisk faktureres: den vanligste kunden på prosjektets salgsordrer (ikke tilbud)
        const tell = new Map<string, Map<number, number>>();
        for (const o of ordrer) {
          const p = pid.get(Number(o[pf])), k = Number(o.customerNo);
          if (!p || !k || Number(o.transactionType) !== 1 || Number(o.orderType) === 5) continue;
          const m = tell.get(p) ?? new Map<number, number>(); m.set(k, (m.get(k) ?? 0) + 1); tell.set(p, m);
        }
        const { data: uten } = await sb.from("prosjekter").select("id").eq("bedrift_id", b.id).is("faktura_kunde_id", null);
        for (const { id } of uten ?? []) {
          const m = tell.get(id);
          const k = m && [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
          if (k && kundeId.get(k)) await sb.from("prosjekter").update({ faktura_kunde_id: kundeId.get(k) }).eq("id", id);
        }
      } catch (e) {
        ordreAntall = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`;
      }
      // Varer brukt på prosjektene (ordrelinjer) til FDV. Én gang i timen, eller med ?varer=1.
      let vareAntall: number | string = "hoppet over";
      if (url.searchParams.get("varer") || new Date().getUTCMinutes() < 15) {
        try { vareAntall = await synkVarer(tok, b, pk.nr); }
        catch (e) { vareAntall = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      }
      let utstyrAntall: number | string = "hoppet over";
      if (url.searchParams.get("varer") || url.searchParams.get("utstyr") || new Date().getUTCMinutes() < 15) {
        try { utstyrAntall = await synkUtstyr(tok, b, pk.nr); }
        catch (e) { utstyrAntall = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      }
      let arbeidAntall: number | string = 0;
      try { arbeidAntall = await synkArbeid(tok, b, pk.nr); }
      catch (e) { arbeidAntall = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      rapport[`bedrift ${b.id}`] = { kunder: kunder.length, prosjekter: prosjekter.length, ordrer: ordreAntall, varer: vareAntall, utstyr: utstyrAntall, arbeid: arbeidAntall, prosjektklasse: `${pk.nr} ${pk.navn}` };
    }
    await sb.from("visma_sync_logg").insert({ ok: true, melding: JSON.stringify(rapport) });
    return Response.json(rapport);
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e);
    await sb.from("visma_sync_logg").insert({ ok: false, melding: melding.slice(0, 2000) });
    return new Response(melding, { status: 500 });
  }
});
