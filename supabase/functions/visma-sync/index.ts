// Henter kunder og prosjekter fra Visma Business NXT inn i ByggLogg (bare lesing i Visma).
// Kjøres av pg_cron hvert kvarter. ?skjema=1 viser hvilke felt Visma tilbyr (for feilsøking).
// Publiseres uten JWT-sjekk. Trenger hemmeligheten VISMA_CLIENT_SECRET. (v9: feilsøking krever driftsnøkkel)
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

/**
 * Visma-prosjektnr → prosjekt i ByggLogg. Et prosjekt som er slått sammen med et annet i appen
 * peker på prosjektet det ble slått inn i, så ordre, varer og fakturerte timer havner der.
 */
async function prosjektKart(bedriftId: number) {
  let r = await sb.from("prosjekter").select("id, visma_nr, slatt_sammen_med").eq("bedrift_id", bedriftId).not("visma_nr", "is", null);
  // Eldre database uten sammenslåing
  if (r.error) r = await sb.from("prosjekter").select("id, visma_nr").eq("bedrift_id", bedriftId).not("visma_nr", "is", null) as typeof r;
  if (r.error) throw r.error;
  return new Map((r.data ?? []).map((x) => [Number(x.visma_nr), ((x as { slatt_sammen_med?: string | null }).slatt_sammen_med ?? x.id) as string]));
}

/** Feltene som finnes på en tabelltype, så vi bare spør etter felt som eksisterer. */
async function felt(tok: string, type: string) {
  const d = await gql(tok, `query($n: String!) { __type(name: $n) { fields { name } } }`, { n: type });
  return new Set<string>((d.__type?.fields ?? []).map((f: { name: string }) => f.name));
}
const velg = (finnes: Set<string>, ønsket: string[]) => ønsket.filter((f) => finnes.has(f));

/** Omsetning per måned fra hovedboken (kontoklasse 3, salgsinntekter), i år og i fjor. */
async function synkOmsetning(tok: string, b: { id: number; visma_firma_nr: number }) {
  const aar = new Date().getFullYear();
  const pb = await alle(tok, b.visma_firma_nr, "generalLedgerPeriodBalance", ["accountNo", "year", "period", "flowDomestic"],
    `{ accountNo: { _gte: 3000, _lt: 4000 }, year: { _gte: ${aar - 1}, _lte: ${aar} } }`);
  const sum = new Map<string, number>();
  for (const x of pb) {
    const p = Number(x.period);
    if (p < 1 || p > 12) continue;
    const k = `${x.year}-${p}`;
    sum.set(k, (sum.get(k) ?? 0) - Number(x.flowDomestic ?? 0));
  }
  const naa = new Date().toISOString();
  const rader = [...sum].map(([k, v]) => { const [a, m] = k.split("-").map(Number); return { bedrift_id: b.id, aar: a, mnd: m, belop: Math.round(v), oppdatert: naa }; });
  if (rader.length) {
    const { error } = await sb.from("omsetning_mnd").upsert(rader, { onConflict: "bedrift_id,aar,mnd" });
    if (error) throw new Error(error.message);
  }
  return rader.length;
}

/** Kategori for en ordrelinje ut fra teksten (samme regel som src/lib/dg.ts) */
type DgKategori = { id: string; navn: string; med: string[]; uten: string[] };
function kategoriFor(tekst: string, regler: DgKategori[]): string | null {
  const t = tekst.toLowerCase();
  for (const k of regler) {
    if (k.med.some((o) => o && t.includes(o.toLowerCase())) && !k.uten.some((o) => o && t.includes(o.toLowerCase()))) return k.id;
  }
  return null;
}

/**
 * Salg per kategori (vinduer, takplater …) og måned: fakturert beløp og dekningsbidrag fra ordrelinjene.
 * Linjene sorteres etter teksten, så også «Diverse»-varenummer kommer med. Første gang hentes i fjor og i år,
 * deretter forrige og denne måneden.
 */
async function synkSalgKategorier(tok: string, b: { id: number; visma_firma_nr: number }) {
  const { data: bd } = await sb.from("bedrifter").select("dg_kategorier").eq("id", b.id).maybeSingle();
  const regler = ((bd?.dg_kategorier ?? []) as DgKategori[]).filter((k) => Array.isArray(k.med) && Array.isArray(k.uten));
  if (!regler.length) return "ingen kategorier";
  const { count } = await sb.from("salg_kategori_mnd").select("aar", { count: "exact", head: true }).eq("bedrift_id", b.id);
  const naa = new Date();
  const fra = count ? new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth() - 1, 1)) : new Date(Date.UTC(naa.getUTCFullYear() - 1, 0, 1));
  const fraTall = fra.getUTCFullYear() * 10000 + (fra.getUTCMonth() + 1) * 100 + 1;
  const linjer = await alle(tok, b.visma_firma_nr, "orderLine",
    ["description", "finishDate", "invoicedAmountTotalDomestic", "grossProfitTotalDomestic"],
    `{ _and: [{ finishDate: { _gte: ${fraTall} } }, { transactionType: { _eq: 1 } }] }`);
  type Sum = { omsetning: number; db: number; linjer: number; eks: Map<string, { omsetning: number; db: number }> };
  const per = new Map<string, Sum>();
  for (const l of linjer) {
    const d = s(l.finishDate);
    if (!/^\d{8}$/.test(d) || d === "00000000") continue;
    const oms = Number(l.invoicedAmountTotalDomestic) || 0, db = Number(l.grossProfitTotalDomestic) || 0;
    if (!oms && !db) continue;
    const k = kategoriFor(s(l.description), regler);
    if (!k) continue;
    const nokkel = `${d.slice(0, 4)}-${Number(d.slice(4, 6))}-${k}`;
    const x = per.get(nokkel) ?? { omsetning: 0, db: 0, linjer: 0, eks: new Map() };
    x.omsetning += oms; x.db += db; x.linjer++;
    const tekst = s(l.description).slice(0, 60);
    const e = x.eks.get(tekst) ?? { omsetning: 0, db: 0 }; e.omsetning += oms; e.db += db; x.eks.set(tekst, e);
    per.set(nokkel, x);
  }
  const tid = new Date().toISOString();
  const rader = [...per].map(([n, x]) => {
    const [aar, mnd, kategori] = n.split("-");
    const eksempler = [...x.eks].sort((a, b) => Math.abs(b[1].omsetning) - Math.abs(a[1].omsetning)).slice(0, 15)
      .map(([tekst, v]) => ({ tekst, omsetning: Math.round(v.omsetning), db: Math.round(v.db) }));
    return { bedrift_id: b.id, aar: Number(aar), mnd: Number(mnd), kategori, omsetning: Math.round(x.omsetning * 100) / 100, db: Math.round(x.db * 100) / 100, linjer: x.linjer, eksempler, oppdatert: tid };
  });
  // Månedene som er hentet på nytt erstattes helt (en kategori kan ha falt bort)
  const del = await sb.from("salg_kategori_mnd").delete().eq("bedrift_id", b.id)
    .or(`aar.gt.${fra.getUTCFullYear()},and(aar.eq.${fra.getUTCFullYear()},mnd.gte.${fra.getUTCMonth() + 1})`);
  if (del.error) throw new Error(del.error.message);
  for (let i = 0; i < rader.length; i += 500) {
    const { error } = await sb.from("salg_kategori_mnd").upsert(rader.slice(i, i + 500), { onConflict: "bedrift_id,aar,mnd,kategori" });
    if (error) throw new Error(error.message);
  }
  return `${linjer.length} linjer, ${rader.length} måneder/kategorier`;
}

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
  const linjeFelt = ["orderNo", "productNo", pf, ...velg(lf, ["description", "totalQuantity", "orderType", "createdDate"])];
  const ekstra = [lf.has("joinup_Product") && pInfo.length ? `joinup_Product { ${pInfo.join(" ")} }` : "", lf.has("joinup_Unit") ? "joinup_Unit { description }" : "", lf.has("joinup_Order") ? "joinup_Order { orderDate }" : ""].filter(Boolean);
  let linjer: Record<string, unknown>[];
  try { linjer = await alle(tok, b.visma_firma_nr, "orderLine", [...linjeFelt, ...ekstra], `{ ${pf}: { _gt: 0 } }`); }
  catch { linjer = await alle(tok, b.visma_firma_nr, "orderLine", linjeFelt, `{ ${pf}: { _gt: 0 } }`); }

  const pid = await prosjektKart(b.id);
  // Summer per prosjekt, vare og ordretype. Samme vare kan ligge både på innkjøp og salg; da brukes den største summen.
  const sum = new Map<string, number>();
  const per = new Map<string, { prosjekt_id: string; varenr: string; beskrivelse: string; antall: number; enhet: string; sist_dato: string | null }>();
  // Dato på ordrelinjen (ordredato, ellers når linjen ble laget), som «ÅÅÅÅ-MM-DD»
  const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
  const varer = new Map<string, { varenr: string; beskrivelse: string; nobb_nr: string; ean: string }>();
  for (const l of linjer) {
    const vnr = s(l.productNo), p = pid.get(Number(l[pf]));
    if (!vnr || !p) continue;
    const pr = (l.joinup_Product ?? {}) as Record<string, unknown>;
    const nobb = finnNobb(vnr, s(pr.webPage));
    if (!nobb) continue; // fritekstlinjer (frakt, arbeid o.l.) har ikke FDV
    const key = `${p}|${vnr}`, tk = `${key}|${s(l.orderType)}`;
    sum.set(tk, (sum.get(tk) ?? 0) + (Number(l.totalQuantity) || 0));
    const r = per.get(key) ?? { prosjekt_id: p, varenr: vnr, beskrivelse: s(l.description), antall: 0, enhet: s((l.joinup_Unit as Record<string, unknown> | null)?.description), sist_dato: null };
    r.antall = Math.max(r.antall, sum.get(tk)!);
    const d = dato((l.joinup_Order as Record<string, unknown> | null)?.orderDate) ?? dato(l.createdDate);
    if (d && (!r.sist_dato || d > r.sist_dato)) r.sist_dato = d;
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
  await sb.from("prosjekt_vare").delete().eq("bedrift_id", b.id).eq("manuell", false).lt("oppdatert", naa);
  return rader.length;
}

/** Nye ansatte uten utstyrskonto: koble automatisk til Visma-prosjektet med navnet deres
 *  (f.eks. «Utstyr Mats Lausund»). Kobler bare når det finnes nøyaktig ett ledig prosjekt som passer. */
async function kobleUtstyrskontoer(b: { id: number }) {
  const { data: ansatte } = await sb.from("ansatte").select("id, navn, utstyr_prosjekt_id").eq("bedrift_id", b.id).eq("aktiv", true);
  const uten = (ansatte ?? []).filter((a) => !a.utstyr_prosjekt_id);
  if (!uten.length) return 0;
  const brukt = new Set((ansatte ?? []).map((a) => a.utstyr_prosjekt_id).filter(Boolean));
  const { data: pr } = await sb.from("prosjekter").select("id, navn").eq("bedrift_id", b.id);
  const ledige = (pr ?? []).filter((p) => !brukt.has(p.id) && /utstyr|verkt|arbeidskl|arbeidst/i.test(p.navn ?? ""));
  const ord = (s: string) => s.toLowerCase().normalize("NFC").split(/[^\p{L}]+/u).filter(Boolean);
  let antall = 0;
  for (const a of uten) {
    const navn = ord(a.navn);
    if (!navn.length) continue;
    const har = (p: { navn: string }, deler: string[]) => { const w = new Set(ord(p.navn)); return deler.every((d) => w.has(d)); };
    // Fornavn må stemme; finnes flere, må også etternavnet stemme (to Lausund-er)
    let treff = ledige.filter((p) => har(p, [navn[0]]));
    if (treff.length > 1 && navn.length > 1) treff = treff.filter((p) => har(p, [navn[0], navn[navn.length - 1]]));
    if (treff.length !== 1) continue;
    const { error } = await sb.from("ansatte").update({ utstyr_prosjekt_id: treff[0].id }).eq("id", a.id).is("utstyr_prosjekt_id", null);
    if (!error) { antall++; ledige.splice(ledige.indexOf(treff[0]), 1); }
  }
  return antall;
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
  const pid = await prosjektKart(b.id);
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

/**
 * Salg per avdeling (organisatorisk enhet 1 «Avdeling», f.eks. Kjøkken & Interiør): én rad per salgsordre
 * som er ført på en avdeling, fra og med i fjor. Brukes til avdelingsrapporten (antall salg, omsetning, DB, DG).
 */
async function synkAvdelingSalg(tok: string, b: { id: number; visma_firma_nr: number }) {
  const avd = await alle(tok, b.visma_firma_nr, "orgUnit1", ["orgUnit1No", "name"]);
  const avdRader = avd.filter((a) => Number(a.orgUnit1No) > 0).map((a) => ({ bedrift_id: b.id, nr: Number(a.orgUnit1No), navn: s(a.name) || `Avdeling ${a.orgUnit1No}` }));
  if (avdRader.length) {
    const { error } = await sb.from("visma_avdelinger").upsert(avdRader, { onConflict: "bedrift_id,nr" });
    if (error) throw new Error(error.message);
  }
  const fraAar = new Date().getUTCFullYear() - 1;
  const oFelt = await felt(tok, "Order");
  const ordrer = await alle(tok, b.visma_firma_nr, "order",
    ["orderNo", "orgUnit1", ...velg(oFelt, ["orderDate", "orderType", "transactionType", "name", "sellerOrBuyer", "orderSumNetDomestic", "invoicedAmountTotalDomestic", "grossProfitTotalDomestic", "incurredCostTotalDomestic", "finishDate"])],
    `{ _and: [{ orgUnit1: { _gt: 0 } }, { orderDate: { _gte: ${fraAar}0101 } }] }`);
  const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
  const n = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
  const naa = new Date().toISOString();
  const rader = ordrer
    // Bare salg (transaksjonstype 1), ikke tilbud (ordretype 5)
    .filter((o) => Number(o.transactionType) === 1 && Number(o.orderType) !== 5)
    .map((o) => ({
      bedrift_id: b.id, visma_ordrenr: Number(o.orderNo), avdeling_nr: Number(o.orgUnit1), ordredato: dato(o.orderDate),
      fakturadato: n(o.invoicedAmountTotalDomestic) !== 0 ? dato(o.finishDate) : null, kunde: s(o.name).slice(0, 120),
      selger_nr: Number(o.sellerOrBuyer) || null, ordresum: n(o.orderSumNetDomestic), omsetning: n(o.invoicedAmountTotalDomestic),
      db: n(o.grossProfitTotalDomestic), kostnad: n(o.incurredCostTotalDomestic), oppdatert: naa,
    }));
  for (let i = 0; i < rader.length; i += 500) {
    const { error } = await sb.from("avdeling_salg").upsert(rader.slice(i, i + 500), { onConflict: "bedrift_id,visma_ordrenr" });
    if (error) throw new Error(error.message);
  }
  // Ordre som er flyttet til en annen avdeling, slettet eller gjort om til tilbud
  await sb.from("avdeling_salg").delete().eq("bedrift_id", b.id).lt("oppdatert", naa);
  return `${rader.length} ordre på ${avdRader.length} avdelinger`;
}

/** Feilsøking og tvungen henting krever driftsnøkkelen (tabellen drift_noekkel), ellers kan hvem som helst lese Visma-data */
/**
 * Nye kunder: når kunden har godkjent ByggLogg i Visma, dukker firmaet opp i availableCompanies.
 * Firmaet kobles til bedriften med samme org.nr. (bare hvis nøyaktig én bedrift har det nummeret
 * og ingen annen bedrift allerede bruker firmaet).
 */
async function finnNyeFirmaer(tok: string) {
  const { data: uten } = await sb.from("bedrifter").select("id, orgnr, tripletex_aktiv").is("visma_firma_nr", null).neq("orgnr", "");
  const kandidater = (uten ?? []).filter((b) => /^\d{9}$/.test(String(b.orgnr ?? "")) && !b.tripletex_aktiv);
  if (!kandidater.length) return 0;
  const d = await gql(tok, `{ availableCompanies { items { name vismaNetCompanyId organizationNo } } }`);
  const firmaer = (d.availableCompanies?.items ?? []) as { name: string; vismaNetCompanyId: number; organizationNo: string }[];
  const { data: alleB } = await sb.from("bedrifter").select("id, orgnr, visma_firma_nr");
  let n = 0;
  for (const b of kandidater) {
    const treff = firmaer.filter((f) => String(f.organizationNo ?? "").replace(/\D/g, "") === b.orgnr);
    const sammeOrgnr = (alleB ?? []).filter((x) => x.orgnr === b.orgnr).length;
    if (treff.length !== 1 || sammeOrgnr !== 1) {
      await sb.from("bedrifter").update({
        visma_status: treff.length > 1 || sammeOrgnr > 1 ? "Fant flere firmaer med samme org.nr. Kontakt ByggLogg." : "Finner ikke firmaet i Visma ennå. Har dere godkjent ByggLogg i Visma?",
      }).eq("id", b.id);
      continue;
    }
    const f = treff[0];
    if ((alleB ?? []).some((x) => x.visma_firma_nr === f.vismaNetCompanyId)) continue;
    const { error } = await sb.from("bedrifter").update({ visma_firma_nr: f.vismaNetCompanyId, visma_navn: f.name ?? "", visma_status: "Funnet i Visma. Henter kunder og prosjekter …" })
      .eq("id", b.id).is("visma_firma_nr", null);
    if (!error) n++;
  }
  return n;
}

/** Ansatte i Visma (aktører med ansattnummer) som forslag til ansatte i ByggLogg */
async function synkAnsattForslag(tok: string, b: { id: number; visma_firma_nr: number }, aFelt: Set<string>) {
  if (!aFelt.has("employeeNo")) return 0;
  const r = await alle(tok, b.visma_firma_nr, "associate", velg(aFelt, ["associateNo", "employeeNo", "name", "emailAddress"]), "{ employeeNo: { _gt: 0 } }");
  const rader = r.filter((x) => s(x.name) && !/^(admin|kasse|test|lager|butikk)\b/i.test(s(x.name))).map((x) => {
    const e = s(x.emailAddress).toLowerCase();
    return { bedrift_id: b.id, kilde: "visma", ekstern_id: String(x.employeeNo), navn: s(x.name), epost: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) ? e : null, ansattnr: String(x.employeeNo), sett: new Date().toISOString() };
  });
  if (rader.length) {
    const { error } = await sb.from("ansatt_forslag").upsert(rader, { onConflict: "bedrift_id,kilde,ekstern_id", ignoreDuplicates: false });
    if (error) throw error;
  }
  return rader.length;
}

const BESKYTTET = ["typer", "firmaer", "prove", "type", "skjema", "varer", "utstyr", "salg", "avdeling"];
async function harNoekkel(req: Request) {
  const gitt = req.headers.get("x-bygglogg-noekkel") ?? "";
  if (gitt.length < 32) return false;
  const { data } = await sb.from("drift_noekkel").select("verdi").eq("id", 1).maybeSingle();
  if (!data?.verdi || data.verdi.length !== gitt.length) return false;
  let ulik = 0;
  for (let i = 0; i < gitt.length; i++) ulik |= gitt.charCodeAt(i) ^ data.verdi.charCodeAt(i);
  return ulik === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (BESKYTTET.some((p) => url.searchParams.has(p)) && !(await harNoekkel(req))) return new Response("ikke tilgang", { status: 403 });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) as { bedrift?: number } : {};
  try {
    const tok = await token();
    let nyeFirmaer = 0;
    try { nyeFirmaer = await finnNyeFirmaer(tok); } catch (e) { console.error("Nye firmaer", e); }
    let bq = sb.from("bedrifter").select("id, visma_firma_nr").not("visma_firma_nr", "is", null);
    if (Number.isInteger(body.bedrift)) bq = bq.eq("id", body.bedrift!);
    const { data: bedrifter } = await bq;
    if (Number.isInteger(body.bedrift) && !bedrifter?.length) return Response.json({ nyeFirmaer, melding: "ikke koblet" });
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
     try {
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
        const pid = await prosjektKart(b.id);
        const dato = (v: unknown) => { const x = s(v); return /^\d{8}$/.test(x) && x !== "00000000" ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null; };
        const n = (v: unknown) => Number(v) || 0;
        const rader2 = ordrer.filter((o) => pid.has(Number(o[pf]))).map((o) => ({
          bedrift_id: b.id, visma_ordrenr: n(o.orderNo), prosjekt_id: pid.get(Number(o[pf])), ordredato: dato(o.orderDate),
          ordretype: n(o.orderType), transaksjonstype: n(o.transactionType), navn: s(o.name), kunde_nr: n(o.customerNo) || null,
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
      let nyeKontoer = 0;
      try { nyeKontoer = await kobleUtstyrskontoer(b); } catch (e) { console.error("Utstyrskonto", e); }
      if (nyeKontoer || url.searchParams.get("varer") || url.searchParams.get("utstyr") || new Date().getUTCMinutes() < 15) {
        try { utstyrAntall = await synkUtstyr(tok, b, pk.nr); }
        catch (e) { utstyrAntall = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      }
      let arbeidAntall: number | string = 0;
      try { arbeidAntall = await synkArbeid(tok, b, pk.nr); }
      catch (e) { arbeidAntall = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      let omsetning: number | string = 0;
      try { omsetning = await synkOmsetning(tok, b); }
      catch (e) { omsetning = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      // Salg per kategori (DG på vinduer, takplater …). Én gang i timen, eller med ?salg=1.
      let salg: string = "hoppet over";
      if (url.searchParams.get("salg") || new Date().getUTCMinutes() < 15) {
        try { salg = await synkSalgKategorier(tok, b); }
        catch (e) { salg = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      }
      let avdeling: string = "hoppet over";
      if (url.searchParams.get("salg") || url.searchParams.get("avdeling") || new Date().getUTCMinutes() < 15) {
        try { avdeling = await synkAvdelingSalg(tok, b); }
        catch (e) { avdeling = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      }
      let forslag: number | string = 0;
      try { forslag = await synkAnsattForslag(tok, b, aFelt); }
      catch (e) { forslag = `ikke hentet: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`; }
      rapport[`bedrift ${b.id}`] = { kunder: kunder.length, prosjekter: prosjekter.length, ordrer: ordreAntall, varer: vareAntall, utstyr: utstyrAntall, nye_utstyrskontoer: nyeKontoer, arbeid: arbeidAntall, omsetning, salg, ansatte_i_visma: forslag, avdeling, prosjektklasse: `${pk.nr} ${pk.navn}` };
      await sb.from("bedrifter").update({ visma_status: `Hentet ${kunder.length} kunder og ${prosjekter.length} prosjekter.`, visma_sist: new Date().toISOString() }).eq("id", b.id);
     } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      rapport[`bedrift ${b.id}`] = { feil: m };
      await sb.from("bedrifter").update({ visma_status: `Feil ved henting: ${m}`, visma_sist: new Date().toISOString() }).eq("id", b.id);
     }
    }
    if (nyeFirmaer) rapport.nye_firmaer = nyeFirmaer;
    await sb.from("visma_sync_logg").insert({ ok: true, melding: JSON.stringify(rapport) });
    return Response.json(rapport);
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e);
    await sb.from("visma_sync_logg").insert({ ok: false, melding: melding.slice(0, 2000) });
    if (Number.isInteger(body.bedrift)) {
      await sb.from("bedrifter").update({ visma_status: /VISMA_CLIENT_SECRET|Visma Connect/.test(melding) ? "ByggLogg får ikke kontakt med Visma akkurat nå. Prøv igjen senere." : `Feil: ${melding.slice(0, 200)}` }).eq("id", body.bedrift!);
    }
    return new Response(melding, { status: 500 });
  }
});
