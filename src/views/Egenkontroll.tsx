// Egenkontroll (sentral godkjenning): kontrollplan og sjekklister på prosjektet, bedriftens egne maler,
// og oversikt over egenkontrollen på alle prosjekter for leder og faglig leder.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, langDato, sorterAnsatte } from "../lib/ferie";
import { AVVIK_STATUS } from "../lib/hms";
import {
  BIBLIOTEK, KONTROLL_STATUS, SVAR, avvikIListe, besvart, egenkontrollTall, forsinket, kontrollStatus, malTilTekst, nyePunkter, tekstTilMal,
  type MalPunkt, type Punkt, type Sjekkliste, type SjekklisteMal, type Svar,
} from "../lib/kvalitet";
import { apneProsjektDel } from "../lib/navigasjon";
import type { Prosjekt } from "../lib/timer";
import { Avvik } from "./Avvik";
import { Bilder } from "./Bilder";
import { usePlanlegger } from "./Plan";

type D = ReturnType<typeof useApp>["d"];
const navnPaa = (d: D, id: string | null | undefined) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
const fornavn = (d: D, id: string | null | undefined) => navnPaa(d, id).split(" ")[0] ?? "";

/** Leder, prosjektleder eller faglig leder: kan kontrollere og godkjenne egenkontroll og styre malene */
export function useKontrollor() { const { meg } = useApp(); return usePlanlegger() || !!meg.faglig_leder; }

const STATUS_CHIP = { planlagt: "demo", pagaar: "venter", signert: "venter", godkjent: "godkjent" } as const;

/** Malene å velge mellom: bedriftens egne først, så biblioteket */
function useMaler() {
  const { d } = useApp();
  const egne = (d.sjekklisteMaler ?? []).filter((m) => m.aktiv).sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  const finn = (v: string): { navn: string; mal: string; punkter: MalPunkt[]; dok_nr: string; revisjon: number | null } | null => {
    if (v.startsWith("m:")) { const m = egne.find((x) => x.id === v.slice(2)); return m ? { navn: m.navn, mal: m.id, punkter: m.punkter, dok_nr: m.dok_nr, revisjon: m.revisjon } : null; }
    if (v.startsWith("b:")) { const m = BIBLIOTEK.find((x) => x.id === v.slice(2)); return m ? { navn: m.navn, mal: m.id, punkter: m.punkter, dok_nr: "", revisjon: null } : null; }
    if (v === "egen") return { navn: "Egen sjekkliste", mal: "egen", punkter: [], dok_nr: "", revisjon: null };
    return null;
  };
  const valg = (
    <>
      <option value="">Velg …</option>
      {egne.length > 0 && <optgroup label="Våre maler">{egne.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.dok_nr ? `${m.dok_nr} ` : ""}{m.navn}</option>)}</optgroup>}
      <optgroup label="Malbiblioteket">{BIBLIOTEK.map((m) => <option key={m.id} value={`b:${m.id}`}>{m.navn}</option>)}</optgroup>
      <option value="egen">Egen sjekkliste (tom)</option>
    </>
  );
  return { finn, valg };
}

// ------------------------------------------------------------ Utfylling

function Utfylling({ s, lukk }: { s: Sjekkliste; lukk: () => void }) {
  const { d, kjor, idag, meg } = useApp();
  const planlegger = usePlanlegger();
  const kontrollor = useKontrollor();
  const [punkter, setPunkter] = useState<Punkt[]>(s.punkter);
  const [nytt, setNytt] = useState("");
  const [bildeApen, setBildeApen] = useState<number | null>(null);
  useEffect(() => setPunkter(s.punkter), [s.id, s.endret]); // eslint-disable-line react-hooks/exhaustive-deps
  const laast = s.status === "signert";
  const endret = JSON.stringify(punkter) !== JSON.stringify(s.punkter);
  const sett = (i: number, x: Partial<Punkt>) => setPunkter(punkter.map((p, n) => (n === i ? { ...p, ...x } : p)));
  const rens = () => punkter.map((x) => ({ ...x, kommentar: (x.kommentar ?? "").trim(), ...(x.maal ? { verdi: (x.verdi ?? "").trim() } : {}) }));
  const lagre = (status?: "signert") => kjor(() => api.lagreSjekkliste(s.id, { punkter: rens(), ...(status ? { status } : {}) }),
    status ? "Sjekklisten er signert" : punkter.some((p, i) => p.svar === "avvik" && !s.punkter[i]?.avvik_id) ? "Lagret. Avviket er registrert i avviksregisteret." : "Lagret");
  const mangler = punkter.filter((p) => !p.svar).length;
  const manglerMaal = punkter.filter((p) => p.maal && p.svar === "ok" && !(p.verdi ?? "").trim()).length;
  const alleBilder = d.bilder.filter((b) => b.sjekkliste_id === s.id);
  const avvik = d.avvik.filter((a) => a.sjekkliste_id === s.id);
  const aapneAvvik = avvik.filter((a) => a.status !== "lukket").length;
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  let forrigeSeksjon: string | undefined;

  return (
    <div className="sjekkliste">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><b>{s.navn}</b>{s.dok_nr ? <span className="small muted"> · {s.dok_nr}{s.revisjon ? ` rev. ${s.revisjon}` : ""}</span> : null}</div>
        <button className="btn sm" onClick={lukk}>Lukk</button>
      </div>
      {planlegger && !laast ? (
        <div className="row small" style={{ gap: 10 }}>
          <label className="row" style={{ gap: 6 }}>Ansvarlig
            <select value={s.ansvarlig_id ?? ""} onChange={(e) => kjor(() => api.lagreSjekkliste(s.id, { ansvarlig_id: e.target.value || null }), "Ansvarlig er endret")}>
              <option value="">Ingen</option>
              {ansatte.map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
            </select></label>
          <label className="row" style={{ gap: 6 }}>Frist
            <input type="date" value={s.frist ?? ""} onChange={(e) => kjor(() => api.lagreSjekkliste(s.id, { frist: e.target.value || null }), "Fristen er endret")} /></label>
        </div>
      ) : (s.ansvarlig_id || s.frist) && (
        <p className="small muted" style={{ margin: 0 }}>
          {s.ansvarlig_id ? `Ansvarlig: ${navnPaa(d, s.ansvarlig_id)}` : ""}{s.ansvarlig_id && s.frist ? " · " : ""}
          {s.frist ? <span style={forsinket(s, idag) ? { color: "var(--warn)", fontWeight: 700 } : undefined}>Frist {kortDato(s.frist)}</span> : null}
        </p>
      )}
      {laast && <p className="small" style={{ margin: 0 }}>Signert av {navnPaa(d, s.signert_av)}{s.signert_tid ? `, ${langDato(s.signert_tid.slice(0, 10))}` : ""}.</p>}

      <ol className="sk-punkter">
        {punkter.map((p, i) => {
          const ny = p.seksjon && p.seksjon !== forrigeSeksjon;
          forrigeSeksjon = p.seksjon;
          const a = p.avvik_id ? d.avvik.find((x) => x.id === p.avvik_id) : undefined;
          const bilder = alleBilder.filter((b) => b.sjekkliste_punkt === i);
          return [
            ny ? <li key={`s${i}`} className="sk-seksjon">{p.seksjon}</li> : null,
            <li key={i} className={p.svar ? `svar-${p.svar}` : ""}>
              <span className="sk-tekst">{p.tekst}</span>
              <span className="sk-valg" role="group" aria-label={`Svar på ${p.tekst}`}>
                {(Object.keys(SVAR) as Svar[]).map((v) => (
                  <button key={v} type="button" className={`sk-knapp ${v}`} aria-pressed={p.svar === v} disabled={laast}
                    onClick={() => sett(i, { svar: p.svar === v ? null : v })}>{SVAR[v]}</button>
                ))}
              </span>
              {p.maal && (
                <label className="sk-maal">Målt
                  <input inputMode="decimal" value={p.verdi ?? ""} disabled={laast} aria-label={`Målt verdi for ${p.tekst}`}
                    onChange={(e) => sett(i, { verdi: e.target.value })} />
                  <span className="muted">{p.maal}</span>
                </label>
              )}
              {(p.svar === "avvik" || p.kommentar) && (
                <input className="sk-kommentar" aria-label={`Kommentar til ${p.tekst}`} value={p.kommentar ?? ""} disabled={laast}
                  placeholder={p.svar === "avvik" ? "Hva er feil, og hva skal gjøres?" : "Kommentar"} onChange={(e) => sett(i, { kommentar: e.target.value })} />
              )}
              <span className="sk-under small muted">
                {!laast && p.svar !== "avvik" && !p.kommentar && <button type="button" className="linkbtn small" onClick={() => sett(i, { kommentar: " " })}>+ Kommentar</button>}
                <button type="button" className="linkbtn small" onClick={() => setBildeApen(bildeApen === i ? null : i)}>{bilder.length ? `Bilder (${bilder.length})` : "+ Bilde"}</button>
                {p.av && p.tid && <span>{fornavn(d, p.av)} {kortDato(p.tid.slice(0, 10))}</span>}
                {a && <span className={`chip ${a.status === "lukket" ? "godkjent" : "venter"}`} title={a.tiltak || undefined}>Avvik: {AVVIK_STATUS[a.status]}</span>}
              </span>
              {bildeApen === i && <div style={{ flexBasis: "100%" }}><Bilder bilder={bilder} til={{ prosjekt_id: s.prosjekt_id, sjekkliste_id: s.id, sjekkliste_punkt: i }} tittel={`Bilder til punkt ${i + 1}`} /></div>}
            </li>,
          ];
        })}
      </ol>
      {!laast && (
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (nytt.trim()) { setPunkter([...punkter, { tekst: nytt.trim(), svar: null, kommentar: "" }]); setNytt(""); } }}>
          <input value={nytt} onChange={(e) => setNytt(e.target.value)} placeholder="Legg til eget punkt" aria-label="Nytt punkt" style={{ flex: 1, minWidth: 160 }} />
          <button className="btn sm" disabled={!nytt.trim()}>Legg til</button>
        </form>
      )}
      <Bilder bilder={alleBilder.filter((b) => b.sjekkliste_punkt == null)} til={{ prosjekt_id: s.prosjekt_id, sjekkliste_id: s.id }} tittel="Bilder til sjekklisten" />
      <div className="row" style={{ gap: 8 }}>
        {!laast && <button className="btn" disabled={!endret} onClick={() => lagre()}>Lagre</button>}
        {!laast && <button className="btn primary" disabled={mangler > 0} onClick={() => lagre("signert")} title={mangler ? "Svar på alle punktene først" : ""}>Signer sjekklisten</button>}
        {!laast && mangler > 0 && <span className="small muted">{mangler} punkter mangler svar</span>}
        {!laast && !mangler && manglerMaal > 0 && <span className="small" style={{ color: "var(--warn)" }}>{manglerMaal} målinger er ikke fylt inn</span>}
        {laast && kontrollor && <button className="btn" onClick={() => kjor(() => api.lagreSjekkliste(s.id, { status: "pagaar" }), "Sjekklisten er åpnet igjen")}>Åpne igjen</button>}
        {(planlegger || (!laast && !s.godkjent_av)) && <button className="btn" style={{ marginLeft: "auto" }} onClick={async () => { if (await kjor(() => api.slettSjekkliste(s.id), "Sjekklisten er slettet")) lukk(); }}>Slett</button>}
      </div>
      {laast && (
        <div className="sk-kontroll">
          <b>Kontroll av faglig leder</b>
          {s.godkjent_av ? (
            <div className="row" style={{ gap: 8 }}>
              <span className="chip godkjent">Godkjent</span>
              <span className="small">Kontrollert og godkjent av {navnPaa(d, s.godkjent_av)}{s.godkjent_tid ? `, ${langDato(s.godkjent_tid.slice(0, 10))}` : ""}.</span>
              {kontrollor && <button className="btn sm" onClick={() => kjor(() => api.lagreSjekkliste(s.id, { godkjent_av: null }), "Godkjenningen er trukket tilbake")}>Angre</button>}
            </div>
          ) : kontrollor ? (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={aapneAvvik > 0} onClick={() => kjor(() => api.lagreSjekkliste(s.id, { godkjent_av: meg.id }), "Egenkontrollen er godkjent")}>Kontrollert – godkjenn</button>
              {aapneAvvik > 0 && <span className="small" style={{ color: "var(--warn)" }}>{aapneAvvik} avvik fra listen må lukkes først</span>}
            </div>
          ) : <span className="small muted">Venter på kontroll av faglig leder.</span>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Prosjektet

/** Egenkontroll på prosjektet: kontrollplan (planlagte kontroller), sjekklister som fylles ut og signeres, og kontroll av faglig leder */
export function Sjekklister({ p }: { p: Prosjekt }) {
  const { d, kjor, idag, meg } = useApp();
  const planlegger = usePlanlegger();
  const { finn, valg } = useMaler();
  const [aapen, setAapen] = useState<string | null>(null);
  const [mal, setMal] = useState("");
  const [plan, setPlan] = useState({ mal: "", ansvarlig: "", frist: "" });
  const [pdfFeil, setPdfFeil] = useState("");
  const [lager, setLager] = useState(false);
  const liste = (d.sjekklister ?? []).filter((s) => s.prosjekt_id === p.id)
    .sort((a, b) => (a.frist ?? "9999").localeCompare(b.frist ?? "9999") || a.opprettet.localeCompare(b.opprettet));
  const valgt = liste.find((s) => s.id === aapen);
  const tall = egenkontrollTall(liste, d.avvik, idag);
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);

  const lag = async (v: string, x: { status?: "planlagt"; ansvarlig_id?: string | null; frist?: string | null } = {}) => {
    const m = finn(v);
    if (!m) return null;
    let id = "";
    const ok = await kjor(async () => { id = await api.nySjekkliste(p.id, m.navn, m.mal, nyePunkter(m.punkter), { ...x, dok_nr: m.dok_nr, revisjon: m.revisjon }); },
      x.status === "planlagt" ? "Kontrollen er lagt til i kontrollplanen" : "Sjekklisten er laget");
    return ok ? id : null;
  };
  const start = async () => { const id = await lag(mal); if (id) { setAapen(id); setMal(""); } };
  const planlegg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await lag(plan.mal, { status: "planlagt", ansvarlig_id: plan.ansvarlig || null, frist: plan.frist || null })) setPlan({ mal: "", ansvarlig: plan.ansvarlig, frist: "" });
  };
  const lastNed = async () => {
    setPdfFeil(""); setLager(true);
    try {
      const { egenkontrollData, lagEgenkontrollRapport } = await import("../lib/egenkontrollRapport");
      const data = await lagEgenkontrollRapport(egenkontrollData(d, p, meg.navn, idag));
      const u = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = u; a.download = `Egenkontroll ${p.visma_nr ?? ""} ${p.navn}.pdf`.replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "-"); a.click();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch (e) { setPdfFeil(e instanceof Error ? e.message : String(e)); }
    setLager(false);
  };

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Egenkontroll</h2>
        {liste.length > 0 && !valgt && <button className="btn sm" disabled={lager} onClick={lastNed}>{lager ? "Lager PDF …" : "Last ned egenkontroll (PDF)"}</button>}
      </div>
      {pdfFeil && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>{pdfFeil}</p>}
      {valgt ? <Utfylling s={valgt} lukk={() => setAapen(null)} /> : (
        <>
          {liste.length > 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              {tall.godkjent} godkjent · {tall.signert} venter på kontroll · {tall.pagaar} påbegynt · {tall.planlagt} planlagt
              {tall.forsinket ? <b style={{ color: "var(--warn)" }}> · {tall.forsinket} over fristen</b> : null}
              {tall.aapneAvvik ? <b style={{ color: "var(--warn)" }}> · {tall.aapneAvvik} åpne avvik</b> : null}
            </p>
          )}
          {liste.length ? (
            <ul className="plan-liste">
              {liste.map((s) => {
                const st = kontrollStatus(s);
                const sent = forsinket(s, idag);
                return (
                  <li key={s.id} className="plan-oppgave" style={{ borderLeftColor: st === "godkjent" ? "var(--approved)" : sent ? "var(--warn)" : st === "planlagt" ? "var(--line)" : "var(--pending)", cursor: "pointer" }} onClick={() => setAapen(s.id)}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{s.navn}</b>
                      <span className={`chip ${STATUS_CHIP[st]}`}>{st === "pagaar" ? `${besvart(s)} av ${s.punkter.length}` : KONTROLL_STATUS[st]}</span>
                    </div>
                    <div className="small muted">
                      {[
                        s.ansvarlig_id ? `Ansvarlig: ${navnPaa(d, s.ansvarlig_id)}` : "",
                        s.frist && s.status !== "signert" ? `frist ${kortDato(s.frist)}${sent ? " (over fristen)" : ""}` : "",
                        s.status === "signert" ? `Signert av ${navnPaa(d, s.signert_av)} ${s.signert_tid ? kortDato(s.signert_tid.slice(0, 10)) : ""}` : s.status === "pagaar" && !s.ansvarlig_id ? `Startet av ${navnPaa(d, s.opprettet_av)} ${kortDato(s.opprettet.slice(0, 10))}` : "",
                        avvikIListe(s) ? `${avvikIListe(s)} avvik` : "",
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted small" style={{ margin: 0 }}>Ingen kontroller på prosjektet ennå. {planlegger ? "Legg opp en kontrollplan med de kontrollene som skal gjøres, eller start en sjekkliste direkte." : "Start en sjekkliste mens arbeidet gjøres."} Signerte lister følger sluttrapporten.</p>}

          {planlegger && (
            <form className="sk-planlegg" onSubmit={planlegg}>
              <b className="small">Legg til i kontrollplanen</b>
              <div className="row" style={{ gap: 8, alignItems: "end" }}>
                <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Kontroll</span>
                  <select value={plan.mal} onChange={(e) => setPlan({ ...plan, mal: e.target.value })}>{valg}</select></label>
                <label className="field" style={{ flex: "1 1 160px" }}><span className="label">Ansvarlig</span>
                  <select value={plan.ansvarlig} onChange={(e) => setPlan({ ...plan, ansvarlig: e.target.value })}>
                    <option value="">Velg …</option>
                    {ansatte.map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
                  </select></label>
                <label className="field" style={{ flex: "0 1 150px" }}><span className="label">Frist</span>
                  <input type="date" value={plan.frist} onChange={(e) => setPlan({ ...plan, frist: e.target.value })} /></label>
                <button className="btn" disabled={!plan.mal || plan.mal === "egen"}>Legg til</button>
              </div>
            </form>
          )}
          <div className="row" style={{ gap: 8, alignItems: "end" }}>
            <label className="field" style={{ flex: "1 1 240px" }}><span className="label">Start sjekkliste nå</span>
              <select id="ny-sjekkliste" value={mal} onChange={(e) => setMal(e.target.value)}>{valg}</select></label>
            <button className="btn primary" disabled={!mal} onClick={start}>Start</button>
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Maler

function MalSkjema({ m, lukk }: { m: Partial<SjekklisteMal> & { punkter: MalPunkt[] }; lukk: () => void }) {
  const { kjor } = useApp();
  const [f, setF] = useState({ navn: m.navn ?? "", kategori: m.kategori ?? "", dok_nr: m.dok_nr ?? "", beskrivelse: m.beskrivelse ?? "", tekst: malTilTekst(m.punkter) });
  const punkter = useMemo(() => tekstTilMal(f.tekst), [f.tekst]);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await kjor(async () => { await api.lagreSjekklisteMal({ id: m.id, navn: f.navn.trim(), kategori: f.kategori.trim(), dok_nr: f.dok_nr.trim(), beskrivelse: f.beskrivelse.trim(), punkter }); },
      m.id ? "Malen er lagret. Nye sjekklister får den nye revisjonen." : "Malen er laget");
    if (ok) lukk();
  };
  return (
    <form onSubmit={lagre} style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: "3 1 240px" }}><span className="label">Navn</span>
          <input value={f.navn} onChange={(e) => setF({ ...f, navn: e.target.value })} maxLength={200} required /></label>
        <label className="field" style={{ flex: "1 1 120px" }}><span className="label">Dokumentnr.</span>
          <input value={f.dok_nr} onChange={(e) => setF({ ...f, dok_nr: e.target.value })} placeholder="F.eks. EK-03" maxLength={40} /></label>
        <label className="field" style={{ flex: "1 1 140px" }}><span className="label">Kategori</span>
          <input value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value })} placeholder="F.eks. Tømrer" maxLength={100} /></label>
      </div>
      <label className="field"><span className="label">Punkter – ett per linje. «# Overskrift» lager en seksjon, og «[mm]» bakerst gjør punktet til en måling.</span>
        <textarea rows={Math.min(22, Math.max(8, f.tekst.split("\n").length + 1))} value={f.tekst} onChange={(e) => setF({ ...f, tekst: e.target.value })}
          placeholder={"# Før start\nTegninger og beskrivelse er gjennomgått\n# Utførelse\nSenteravstand stendere [mm]"} /></label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!f.navn.trim() || !punkter.length}>{m.id ? "Lagre malen" : "Lag malen"}</button>
        <button type="button" className="btn" onClick={lukk}>Avbryt</button>
        <span className="small muted">{punkter.length} punkter{punkter.filter((x) => x.maal).length ? `, ${punkter.filter((x) => x.maal).length} målinger` : ""}{m.id ? ` · nå rev. ${m.revisjon}` : ""}</span>
      </div>
    </form>
  );
}

/** Bedriftens sjekklistemaler med dokumentnummer og revisjon (kvalitetssystemet) */
export function SjekklisteMaler() {
  const { d, kjor } = useApp();
  const [redig, setRedig] = useState<(Partial<SjekklisteMal> & { punkter: MalPunkt[] }) | null>(null);
  const [fra, setFra] = useState("");
  const egne = [...(d.sjekklisteMaler ?? [])].sort((a, b) => (a.dok_nr || "~").localeCompare(b.dok_nr || "~", "nb", { numeric: true }) || a.navn.localeCompare(b.navn, "nb"));
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Sjekklistemaler</h2>
      <p className="small muted" style={{ margin: 0 }}>Bedriftens egne maler for egenkontroll. Revisjonen øker hver gang punktene endres, og hver sjekkliste husker hvilken revisjon den ble laget fra.</p>
      {redig ? <MalSkjema m={redig} lukk={() => setRedig(null)} /> : (
        <>
          {egne.length ? (
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Dok.nr.</th><th>Navn</th><th>Rev.</th><th>Punkter</th><th>Endret</th><th></th></tr></thead>
              <tbody>
                {egne.map((m) => (
                  <tr key={m.id} style={m.aktiv ? undefined : { opacity: 0.55 }}>
                    <td>{m.dok_nr || "–"}</td>
                    <td><b>{m.navn}</b>{m.kategori ? <span className="muted"> · {m.kategori}</span> : null}{!m.aktiv ? <span className="muted"> (ikke i bruk)</span> : null}</td>
                    <td>{m.revisjon}</td>
                    <td>{m.punkter.length}</td>
                    <td>{kortDato(m.endret.slice(0, 10))}{m.endret_av ? ` ${fornavn(d, m.endret_av)}` : ""}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button className="btn sm" onClick={() => setRedig(m)}>Endre</button>{" "}
                      <button className="btn sm" onClick={() => kjor(async () => { await api.lagreSjekklisteMal({ ...m, aktiv: !m.aktiv }); }, m.aktiv ? "Malen er tatt ut av bruk" : "Malen er i bruk igjen")}>{m.aktiv ? "Ta ut av bruk" : "Ta i bruk"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="small muted" style={{ margin: 0 }}>Ingen egne maler ennå. Hent maler fra biblioteket og tilpass dem, eller lag en ny.</p>}
          <div className="row" style={{ gap: 8, alignItems: "end" }}>
            <label className="field" style={{ flex: "1 1 240px" }}><span className="label">Hent fra malbiblioteket</span>
              <select value={fra} onChange={(e) => setFra(e.target.value)}>
                <option value="">Velg …</option>
                {BIBLIOTEK.map((m) => <option key={m.id} value={m.id}>{m.kategori}: {m.navn}</option>)}
              </select></label>
            <button className="btn" disabled={!fra} onClick={() => { const m = BIBLIOTEK.find((x) => x.id === fra); if (m) { setRedig({ navn: m.navn, kategori: m.kategori, punkter: m.punkter }); setFra(""); } }}>Tilpass og lagre</button>
            <button className="btn" onClick={() => setRedig({ punkter: [] })}>Ny tom mal</button>
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Oversikt

/** Egenkontrollen på alle aktive prosjekter: hva som venter på kontroll, hva som er over fristen og åpne avvik */
export function EgenkontrollOversikt() {
  const { d, idag, meg } = useApp();
  const alle = d.sjekklister ?? [];
  const venter = alle.filter((s) => s.status === "signert" && !s.godkjent_av);
  const mine = alle.filter((s) => s.ansvarlig_id === meg.id && s.status !== "signert");
  const prosjekter = d.prosjekter
    .map((p) => ({ p, lister: alle.filter((s) => s.prosjekt_id === p.id) }))
    .filter((x) => x.lister.length || (x.p.aktiv && x.p.start))
    .filter((x) => x.p.aktiv || x.lister.some((s) => kontrollStatus(s) !== "godkjent"))
    .map((x) => ({ ...x, t: egenkontrollTall(x.lister, d.avvik, idag) }))
    .sort((a, b) => (b.t.forsinket + b.t.aapneAvvik + b.t.signert) - (a.t.forsinket + a.t.aapneAvvik + a.t.signert) || a.p.navn.localeCompare(b.p.navn, "nb"));
  const pnavn = (id: string) => d.prosjekter.find((p) => p.id === id)?.navn ?? "";
  const aapne = (id: string) => apneProsjektDel(id, "egenkontroll");
  const utenKontroll = prosjekter.filter((x) => !x.lister.length).length;

  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Egenkontroll på prosjektene</h2>
      {venter.length > 0 && (
        <>
          <b className="small">Venter på kontroll av faglig leder ({venter.length})</b>
          <ul className="plan-liste">
            {venter.map((s) => (
              <li key={s.id} className="plan-oppgave" style={{ borderLeftColor: "var(--pending)", cursor: "pointer" }} onClick={() => aapne(s.prosjekt_id)}>
                <div className="row" style={{ justifyContent: "space-between" }}><b>{s.navn}</b><span className="small muted">{pnavn(s.prosjekt_id)}</span></div>
                <div className="small muted">Signert av {navnPaa(d, s.signert_av)} {s.signert_tid ? kortDato(s.signert_tid.slice(0, 10)) : ""}{avvikIListe(s) ? ` · ${avvikIListe(s)} avvik` : ""}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {mine.length > 0 && (
        <>
          <b className="small">Dine kontroller ({mine.length})</b>
          <ul className="plan-liste">
            {mine.map((s) => (
              <li key={s.id} className="plan-oppgave" style={{ borderLeftColor: forsinket(s, idag) ? "var(--warn)" : "var(--line)", cursor: "pointer" }} onClick={() => aapne(s.prosjekt_id)}>
                <div className="row" style={{ justifyContent: "space-between" }}><b>{s.navn}</b><span className="small muted">{pnavn(s.prosjekt_id)}</span></div>
                {s.frist && <div className="small" style={forsinket(s, idag) ? { color: "var(--warn)" } : { color: "var(--muted)" }}>Frist {kortDato(s.frist)}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      {prosjekter.length ? (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Prosjekt</th><th>Godkjent</th><th>Venter</th><th>Igjen</th><th>Over frist</th><th>Åpne avvik</th></tr></thead>
          <tbody>
            {prosjekter.map(({ p, t }) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => aapne(p.id)}>
                <td><b>{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}</b>{!t.totalt ? <span style={{ color: "var(--warn)" }}> – ingen kontroller</span> : null}</td>
                <td>{t.godkjent}/{t.totalt}</td>
                <td>{t.signert || ""}</td>
                <td>{t.planlagt + t.pagaar || ""}</td>
                <td style={t.forsinket ? { color: "var(--warn)", fontWeight: 700 } : undefined}>{t.forsinket || ""}</td>
                <td style={t.aapneAvvik ? { color: "var(--warn)", fontWeight: 700 } : undefined}>{t.aapneAvvik || ""}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : <p className="small muted" style={{ margin: 0 }}>Ingen aktive prosjekter.</p>}
      {utenKontroll > 0 && <p className="small muted" style={{ margin: 0 }}>{utenKontroll} aktive prosjekter har ingen kontroller. For arbeid som krever ansvarsrett skal egenkontrollen dokumenteres – legg opp en kontrollplan på prosjektet.</p>}
    </section>
  );
}

/** På forsiden: kontroller jeg har ansvaret for som ikke er signert ennå */
export function MineKontroller() {
  const { d, meg, idag } = useApp();
  const mine = (d.sjekklister ?? []).filter((s) => s.ansvarlig_id === meg.id && s.status !== "signert")
    .sort((a, b) => (a.frist ?? "9999").localeCompare(b.frist ?? "9999"));
  if (!mine.length) return null;
  const pnavn = (id: string) => d.prosjekter.find((p) => p.id === id)?.navn ?? "";
  return (
    <section className="panel" style={{ borderLeft: "4px solid var(--accent)" }}>
      <h2 style={{ margin: 0 }}>Dine kontroller</h2>
      <div className="list">
        {mine.map((s) => (
          <a key={s.id} className="item" href="#prosjekter" onClick={(e) => { e.preventDefault(); apneProsjektDel(s.prosjekt_id, "egenkontroll"); }}>
            <div><div className="t">{s.navn}</div><div className="s">{pnavn(s.prosjekt_id)}{s.frist ? <span style={forsinket(s, idag) ? { color: "var(--warn)", fontWeight: 700 } : undefined}> · frist {kortDato(s.frist)}</span> : null}{s.status === "pagaar" ? ` · ${besvart(s)} av ${s.punkter.length}` : ""}</div></div>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Fanen for leder, prosjektleder og faglig leder: avvik, egenkontroll på prosjektene og sjekklistemalene */
export function KvalitetFane({ medAvvik }: { medAvvik: boolean }) {
  const [vis, setVis] = useState<"avvik" | "egenkontroll" | "maler">(medAvvik ? "avvik" : "egenkontroll");
  return (
    <>
      <nav className="tabs undertabs" role="tablist">
        {medAvvik && <button role="tab" aria-selected={vis === "avvik"} onClick={() => setVis("avvik")}>Avvik</button>}
        <button role="tab" aria-selected={vis === "egenkontroll"} onClick={() => setVis("egenkontroll")}>Egenkontroll</button>
        <button role="tab" aria-selected={vis === "maler"} onClick={() => setVis("maler")}>Sjekklistemaler</button>
      </nav>
      {vis === "avvik" && <Avvik />}
      {vis === "egenkontroll" && <EgenkontrollOversikt />}
      {vis === "maler" && <SjekklisteMaler />}
    </>
  );
}
