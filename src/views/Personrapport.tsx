import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { isoOf } from "../lib/ferie";
import { periodeNavn } from "../lib/rapport";
import { lagInnhold, rapportType, type DgDel, type Innhold } from "../lib/personrapport";
import { kategoriFor, type DgKategori } from "../lib/dg";
import { t2 } from "../lib/timer";

const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
const pst = (n: number | null) => (n == null ? "–" : `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`);
const kl = (iso: string) => new Date(iso).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const forrigeMnd = (idag: string) => isoOf(new Date(Number(idag.slice(0, 4)), Number(idag.slice(5, 7)) - 2, 1));

/** Pil og tekst for endring: for interntid er ned bra, for DG er opp bra */
function Endring({ fra, til, lavErBra, enhet = " %-poeng" }: { fra: number | null; til: number | null; lavErBra?: boolean; enhet?: string }) {
  if (fra == null || til == null) return null;
  const d = Math.round((til - fra) * 10) / 10;
  if (Math.abs(d) < 0.1) return <span className="small muted">som forrige måned</span>;
  const bra = lavErBra ? d < 0 : d > 0;
  return <span className="small" style={{ color: bra ? "var(--approved)" : "var(--warn)", fontWeight: 700 }}>{`${d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("nb-NO")}${enhet} fra forrige måned`}</span>;
}

/** Selve rapporten (samme visning for den ansatte og for leder) */
export function PersonrapportKort({ innhold, kommentar, egen }: { innhold: Innhold; kommentar?: string; egen?: boolean }) {
  const t = innhold.timer;
  return (
    <div className="prapport">
      <div className="prapport-topp">
        <div className="small muted">{egen ? "Din månedsrapport" : "Månedsrapport"}</div>
        <h3 style={{ margin: 0 }}>{egen ? periodeNavn(innhold.periode) : `${innhold.navn} – ${periodeNavn(innhold.periode)}`}</h3>
      </div>
      {t && (
        <div className="prapport-del">
          <h4>Timer på kunde og interntid</h4>
          {t.sum === 0 ? <p className="small muted">Ingen timer ført denne måneden.</p> : (
            <>
              <div className="prapport-tall">
                <div><span className="label">På kunde</span><b>{t2(t.kunde)} t</b></div>
                <div><span className="label">Interntid</span><b>{t2(t.intern)} t</b></div>
                <div className={t.snittAndelIntern != null && t.andelIntern <= t.snittAndelIntern ? "bra" : ""}><span className="label">Andel interntid</span><b>{pst(t.andelIntern)}</b></div>
              </div>
              <div className="prapport-stolpe" aria-hidden="true">
                <span style={{ flex: t.kunde, background: "var(--approved)" }} />
                {t.ikkeFakturerbart > 0 && <span style={{ flex: t.ikkeFakturerbart, background: "var(--pending)" }} />}
                <span style={{ flex: t.intern, background: "var(--info)" }} />
              </div>
              <div className="small muted">{`${t2(t.sum)} timer i alt`}{t.ikkeFakturerbart ? <span>{` · ${t2(t.ikkeFakturerbart)} t på prosjekt som ikke faktureres`}</span> : null}</div>
              <ul className="prapport-punkt">
                {t.forrige && <li>Forrige måned: {pst(t.forrige.andelIntern)} interntid. <Endring fra={t.forrige.andelIntern} til={t.andelIntern} lavErBra /></li>}
                <li>Hittil i år: {pst(t.hittil.andelIntern)} interntid av {t2(t.hittil.sum)} timer.</li>
                {t.snittAndelIntern != null && <li>Snitt for snekkerne denne måneden: {pst(t.snittAndelIntern)}.{" "}
                  {t.andelIntern <= t.snittAndelIntern ? <b style={{ color: "var(--approved)" }}>Du ligger bedre enn snittet – bra jobba!</b> : "Lavere interntid betyr flere timer som kan faktureres."}</li>}
              </ul>
            </>
          )}
        </div>
      )}
      {innhold.dg && innhold.dg.map((k) => <DgBlokk key={k.id} k={k} />)}
      {innhold.dg && <p className="small muted" style={{ margin: 0 }}>DG = dekningsbidrag delt på fakturert salg (eks. mva), fra ordrelinjene i Visma.</p>}
      {kommentar?.trim() && <div className="prapport-kommentar"><span className="label">Fra leder</span><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{kommentar}</p></div>}
    </div>
  );
}

function DgBlokk({ k }: { k: DgDel }) {
  return (
    <div className="prapport-del">
      <h4>DG {k.navn.toLowerCase()}</h4>
      {k.mnd.omsetning === 0 && k.hittil.omsetning === 0 ? <p className="small muted">Ikke noe salg registrert.</p> : (
        <>
          <div className="prapport-tall">
            <div className="stor"><span className="label">DG denne måneden</span><b>{pst(k.mnd.dg)}</b></div>
            <div><span className="label">Salg</span><b>{kr(k.mnd.omsetning)}</b></div>
            <div><span className="label">Dekningsbidrag</span><b>{kr(k.mnd.db)}</b></div>
          </div>
          <ul className="prapport-punkt">
            <li>Forrige måned: {pst(k.forrige.dg)} DG på {kr(k.forrige.omsetning)}. <Endring fra={k.forrige.dg} til={k.mnd.dg} /></li>
            <li>Hittil i år: <b>{pst(k.hittil.dg)}</b> DG på {kr(k.hittil.omsetning)}.</li>
            {k.ifjor.omsetning > 0 && <li>Samme måned i fjor: {pst(k.ifjor.dg)} DG på {kr(k.ifjor.omsetning)}.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

/** Den ansattes egne rapporter. Åpner og merker den nyeste som lest. */
export function MinePersonrapporter() {
  const { d, meg, kjor } = useApp();
  const mine = (d.personrapporter ?? []).filter((r) => r.ansatt_id === meg.id && r.publisert).sort((a, b) => b.periode.localeCompare(a.periode));
  const [apen, setApen] = useState<string | null>(mine[0]?.id ?? null);
  useEffect(() => {
    const r = mine.find((x) => x.id === apen);
    if (r && !r.lest) kjor(() => api.markerPersonrapportLest(r.id));
  }, [apen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mine.length) return null;
  return (
    <section className="panel" id="min-rapport">
      <h2 style={{ margin: 0 }}>Din rapport</h2>
      {mine.length > 1 && (
        <div className="hurtig" aria-label="Velg måned">
          {mine.slice(0, 12).map((r) => <button key={r.id} type="button" aria-pressed={apen === r.id} onClick={() => setApen(r.id)}>{periodeNavn(r.periode)}{!r.lest ? " •" : ""}</button>)}
        </div>
      )}
      {mine.filter((r) => r.id === apen).map((r) => <PersonrapportKort key={r.id} innhold={r.innhold} kommentar={r.kommentar} egen />)}
    </section>
  );
}

/** Leder: lag og publiser personlige rapporter for en måned */
export function PersonrapporterLeder() {
  const { d, meg, idag, kjor } = useApp();
  const [periode, setPeriode] = useState(forrigeMnd(idag));
  const kandidater = d.ansatte.filter((a) => a.aktiv && a.id !== meg.id && a.rolle !== "leder" && (rapportType(a).timer || rapportType(a).dg))
    .sort((a, b) => Number(!!b.prosjektleder) - Number(!!a.prosjektleder) || a.navn.localeCompare(b.navn, "nb"));
  const finnes = (id: string) => (d.personrapporter ?? []).find((r) => r.ansatt_id === id && r.periode === periode);
  const [valgt, setValgt] = useState<Set<string>>(new Set());
  const [kommentar, setKommentar] = useState<Record<string, string>>({});
  const [vis, setVis] = useState<string | null>(null);
  useEffect(() => {
    // Forhåndsvalgt: de som har noe å vise og ikke har fått rapporten ennå
    setValgt(new Set(kandidater.filter((a) => { const i = lagInnhold(a, d, periode); return !finnes(a.id)?.publisert && ((i.timer?.sum ?? 0) > 0 || (i.dg ?? []).some((k) => k.mnd.omsetning || k.hittil.omsetning)); }).map((a) => a.id)));
    setKommentar(Object.fromEntries(kandidater.map((a) => [a.id, finnes(a.id)?.kommentar ?? ""])));
  }, [periode, d.personrapporter?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const innhold = useMemo(() => new Map(kandidater.map((a) => [a.id, lagInnhold(a, d, periode)])), [periode, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const salgOppdatert = (d.salgKategorier ?? []).reduce((m, x) => (x.oppdatert && x.oppdatert > m ? x.oppdatert : m), "");

  const publiser = async () => {
    const liste = kandidater.filter((a) => valgt.has(a.id));
    if (!liste.length || !window.confirm(`Publisere ${liste.length} personlige rapporter for ${periodeNavn(periode)}? Hver ansatt får varsel og ser bare sin egen.`)) return;
    await kjor(() => api.lagrePersonrapporter(liste.map((a) => ({ ansatt_id: a.id, periode, innhold: innhold.get(a.id)!, kommentar: kommentar[a.id] ?? "", publiser: true }))), `${liste.length} rapporter er publisert`);
  };

  return (
    <section className="panel" id="personrapporter">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h2 style={{ margin: 0 }}>Personlige rapporter</h2>
        <label className="field kort"><span className="label">Måned</span>
          <input type="month" value={periode.slice(0, 7)} max={idag.slice(0, 7)} onChange={(e) => e.target.value && setPeriode(`${e.target.value}-01`)} /></label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Hver ansatt får sin egen rapport og ser bare den. Snekkerne får timer på kunde mot interntid (lav interntid er bra). Butikk/prosjektleder får DG på salg av vinduer og takplater fra Visma{salgOppdatert ? ` (oppdatert ${kl(salgOppdatert)})` : ""}. Skriv gjerne et par ord til hver før du publiserer.</p>
      <div className="list">
        {kandidater.map((a) => {
          const f = finnes(a.id), i = innhold.get(a.id)!;
          const kort = i.dg ? i.dg.map((k) => `${k.navn}: ${pst(k.mnd.dg)}`).join(" · ") : i.timer ? (i.timer.sum ? `${t2(i.timer.kunde)} t på kunde · ${pst(i.timer.andelIntern)} interntid` : "Ingen timer denne måneden") : "";
          return (
            <div key={a.id} className="item" style={{ flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0, flex: "1 1 240px" }}>
                <input type="checkbox" style={{ width: "auto", flex: "none", marginTop: 4 }} checked={valgt.has(a.id)} disabled={!!f?.publisert}
                  onChange={(e) => { const n = new Set(valgt); if (e.target.checked) n.add(a.id); else n.delete(a.id); setValgt(n); }} />
                <div style={{ minWidth: 0 }}>
                  <div className="t">{a.navn} <span className="small muted">{i.dg ? "· DG vinduer og tak" : "· timer"}</span></div>
                  <div className="s">{kort}</div>
                  {f?.publisert && <div className="s">Publisert {kl(f.publisert)} · {f.lest ? `lest ${kl(f.lest)}` : "ikke lest ennå"}</div>}
                </div>
              </label>
              <div className="acts"><button type="button" className="btn sm" onClick={() => setVis(vis === a.id ? null : a.id)}>{vis === a.id ? "Skjul" : "Vis"}</button></div>
              {!f?.publisert && valgt.has(a.id) && (
                <div className="full"><input type="text" placeholder={`Et par ord til ${a.navn.split(" ")[0]} (valgfritt)`} value={kommentar[a.id] ?? ""} maxLength={4000}
                  onChange={(e) => setKommentar({ ...kommentar, [a.id]: e.target.value })} aria-label={`Kommentar til ${a.navn}`} /></div>
              )}
              {vis === a.id && <div className="full"><PersonrapportKort innhold={f?.publisert ? f.innhold : i} kommentar={f?.publisert ? f.kommentar : kommentar[a.id]} /></div>}
            </div>
          );
        })}
      </div>
      <div className="row">
        <button className="btn primary" disabled={!kandidater.some((a) => valgt.has(a.id))} onClick={publiser}>Publiser for {kandidater.filter((a) => valgt.has(a.id)).length} valgte</button>
      </div>
      <DgRegler />
    </section>
  );
}

/** Leder: hvilke ord på ordrelinjene som gjør at salget regnes som vinduer eller takplater */
function DgRegler() {
  const { d, kjor } = useApp();
  const [k, setK] = useState<DgKategori[]>(() => structuredClone(d.dgKategorier ?? []));
  useEffect(() => { setK(structuredClone(d.dgKategorier ?? [])); }, [d.dgKategorier]);
  const siste = (id: string) => (d.salgKategorier ?? []).filter((x) => x.kategori === id).sort((a, b) => b.aar * 12 + b.mnd - (a.aar * 12 + a.mnd))[0];
  const ord = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const [prove, setProve] = useState("");
  const endret = JSON.stringify(k) !== JSON.stringify(d.dgKategorier ?? []);
  return (
    <details className="oppsett-under" style={{ marginTop: 12 }}>
      <summary><b>Hva regnes som vinduer og takplater?</b> <span className="small muted">Salget sorteres etter teksten på ordrelinjen i Visma, så også «Diverse»-varenummer kommer med.</span></summary>
      {k.map((x, i) => {
        const s = siste(x.id);
        return (
          <fieldset key={x.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <legend className="label">{x.navn}</legend>
            <label className="field"><span className="label">Tas med når teksten inneholder (skill med komma)</span>
              <textarea rows={2} value={x.med.join(", ")} onChange={(e) => { const n = [...k]; n[i] = { ...x, med: ord(e.target.value) }; setK(n); }} /></label>
            <label className="field"><span className="label">… men ikke når den inneholder</span>
              <textarea rows={2} value={x.uten.join(", ")} onChange={(e) => { const n = [...k]; n[i] = { ...x, uten: ord(e.target.value) }; setK(n); }} /></label>
            {s?.eksempler?.length ? (
              <div className="small"><span className="label">Største linjer {periodeNavn(`${s.aar}-${String(s.mnd).padStart(2, "0")}-01`)}</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{s.eksempler.slice(0, 8).map((e) => <li key={e.tekst}>{e.tekst} – {kr(e.omsetning)} ({pst(e.omsetning ? Math.round((e.db / e.omsetning) * 1000) / 10 : null)})</li>)}</ul></div>
            ) : <p className="small muted" style={{ margin: 0 }}>Ingen salg hentet ennå.</p>}
          </fieldset>
        );
      })}
      <label className="field" style={{ marginTop: 10 }}><span className="label">Prøv en tekst fra en ordrelinje</span>
        <input type="text" value={prove} onChange={(e) => setProve(e.target.value)} placeholder="F.eks. Nordan vinduspakke ordre 123" />
        {prove.trim() && <span className="small">→ {k.find((x) => x.id === kategoriFor(prove, k))?.navn ?? "ikke med"}</span>}</label>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" disabled={!endret} onClick={() => kjor(() => api.lagreDgKategorier(k), "Lagret – tallene hentes på nytt fra Visma innen en time")}>Lagre reglene</button>
        {endret && <button className="btn" onClick={() => setK(structuredClone(d.dgKategorier ?? []))}>Angre</button>}
      </div>
    </details>
  );
}


