// Arbeidsplan: leder deler ut arbeid på prosjektene til de ansatte, med fra–til-dato.
// Tidsplanen viser uka per ansatt (med ferie og fravær), og hver ansatt ser sine egne oppgaver øverst.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { addDays, borteDag, kortDato, sorterAnsatte } from "../lib/ferie";
import { fravaerPaa } from "../lib/fravaer";
import { OPPGAVE_STATUS, forsinket, oppgaverPaa, sorterOppgaver, ukeDager, type NyOppgave, type Oppgave, type OppgaveStatus } from "../lib/plan";
import { ukenr, type Prosjekt } from "../lib/timer";
import { ProsjektVelger } from "./ProsjektVelger";

/** Leder eller prosjektleder: kan dele ut arbeid og styre materiell */
export function usePlanlegger() { const { leder, meg } = useApp(); return leder || !!meg.prosjektleder; }

const DAG = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const periodeTekst = (o: Pick<Oppgave, "fra" | "til">) => (o.fra === o.til ? kortDato(o.fra) : `${kortDato(o.fra)} – ${kortDato(o.til)}`);
const STATUS_CHIP: Record<OppgaveStatus, string> = { planlagt: "demo", pagaar: "venter", ferdig: "godkjent" };

/** Farge per prosjekt i tidsplanen (samme prosjekt får alltid samme farge) */
const FARGER = ["#2F6FDE", "#1F9D6B", "#C2410C", "#7C3AED", "#B45309", "#0E7490", "#BE185D", "#4D7C0F"];
const farge = (id: string) => FARGER[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % FARGER.length];

// ------------------------------------------------------------ Skjema

/** Ny eller endret oppgave. Varsler hvis noen har ferie, fravær eller annet arbeid i perioden. */
function OppgaveSkjema({ start, prosjekt, ferdig }: { start?: Partial<NyOppgave> & { id?: string }; prosjekt?: Prosjekt; ferdig: () => void }) {
  const { d, kjor, idag } = useApp();
  const [f, setF] = useState<NyOppgave & { id?: string }>({
    prosjekt_id: prosjekt?.id ?? start?.prosjekt_id ?? "", tittel: "", beskrivelse: "", fra: idag, til: idag, ansatte: [], ...start,
  });
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  const prosjekter = d.prosjekter.filter((p) => p.aktiv || p.id === f.prosjekt_id);
  const dager: string[] = [];
  for (let x = f.fra; x && f.til && x <= f.til && dager.length < 120; x = addDays(x, 1)) dager.push(x);
  const varsler = f.ansatte.flatMap((id) => {
    const a = d.ansatte.find((x) => x.id === id);
    if (!a) return [];
    const borte = dager.filter((x) => borteDag(d.soknader.filter((s) => s.ansatt_id === id && s.status === "godkjent"), x).length || fravaerPaa(d.fravaer ?? [], id, x));
    const annet = (d.oppgaver ?? []).filter((o) => o.id !== f.id && o.status !== "ferdig" && o.ansatte.includes(id) && o.fra <= f.til && o.til >= f.fra);
    return [
      ...(borte.length ? [`${a.navn} er borte ${borte.length === 1 ? kortDato(borte[0]) : `${borte.length} dager i perioden`} (ferie eller fravær).`] : []),
      ...annet.map((o) => `${a.navn} har også «${o.tittel}» på ${d.prosjekter.find((p) => p.id === o.prosjekt_id)?.navn ?? "et annet prosjekt"} (${periodeTekst(o)}).`),
    ];
  });
  const kan = f.prosjekt_id && f.tittel.trim() && f.fra && f.til && f.til >= f.fra;
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kan) return;
    const ok = await kjor(() => api.lagreOppgave(f), f.id ? "Oppgaven er endret" : f.ansatte.length ? "Arbeidet er delt ut" : "Oppgaven er lagt i planen");
    if (ok) ferdig();
  };
  const slett = async () => {
    if (!f.id) return;
    const ok = await kjor(() => api.slettOppgave(f.id!), "Oppgaven er slettet");
    if (ok) ferdig();
  };
  const veksle = (id: string) => setF({ ...f, ansatte: f.ansatte.includes(id) ? f.ansatte.filter((x) => x !== id) : [...f.ansatte, id] });

  return (
    <form onSubmit={lagre} className="plan-skjema" style={{ display: "grid", gap: 10 }}>
      {!prosjekt && (
        <ProsjektVelger id="oppgave-prosjekt" value={f.prosjekt_id} onChange={(id) => setF({ ...f, prosjekt_id: id })} prosjekter={prosjekter} required />
      )}
      <label className="field"><span className="label">Arbeid</span>
        <input id="oppgave-tittel" value={f.tittel} onChange={(e) => setF({ ...f, tittel: e.target.value })} placeholder="F.eks. Riving, Membran og flis, Montere vinduer" maxLength={200} required /></label>
      <div className="row" style={{ gap: 10 }}>
        <label className="field kort"><span className="label">Fra</span>
          <input id="oppgave-fra" type="date" value={f.fra} onChange={(e) => setF({ ...f, fra: e.target.value, til: f.til < e.target.value ? e.target.value : f.til })} required /></label>
        <label className="field kort"><span className="label">Til</span>
          <input id="oppgave-til" type="date" value={f.til} min={f.fra} onChange={(e) => setF({ ...f, til: e.target.value })} required /></label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Hvem skal gjøre det</legend>
        <div className="plan-velg">
          {ansatte.map((a) => (
            <label key={a.id} className={`plan-person${f.ansatte.includes(a.id) ? " valgt" : ""}`}>
              <input type="checkbox" checked={f.ansatte.includes(a.id)} onChange={() => veksle(a.id)} />{a.navn}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field"><span className="label">Beskjed til den som skal gjøre det (valgfritt)</span>
        <textarea id="oppgave-beskrivelse" rows={2} value={f.beskrivelse} onChange={(e) => setF({ ...f, beskrivelse: e.target.value })} maxLength={4000} /></label>
      {varsler.length > 0 && (
        <ul className="checks">{varsler.map((v) => <li key={v} className="advarsel"><span className="i" aria-hidden="true">!</span><span>{v}</span></li>)}</ul>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!kan}>{f.id ? "Lagre" : f.ansatte.length ? "Del ut arbeidet" : "Legg i planen"}</button>
        <button type="button" className="btn" onClick={ferdig}>Avbryt</button>
        {f.id && <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={slett}>Slett</button>}
      </div>
    </form>
  );
}

// ------------------------------------------------------------ Én oppgave

function OppgaveKort({ o, visProsjekt, rediger }: { o: Oppgave; visProsjekt?: boolean; rediger?: () => void }) {
  const { d, meg, kjor, idag } = useApp();
  const leder = usePlanlegger();
  const p = d.prosjekter.find((x) => x.id === o.prosjekt_id);
  const min = o.ansatte.includes(meg.id);
  const navn = o.ansatte.map((id) => d.ansatte.find((a) => a.id === id)?.navn.split(" ")[0]).filter(Boolean);
  const sett = (s: OppgaveStatus, t: string) => kjor(() => api.settOppgaveStatus(o.id, s), t);
  const sen = forsinket(o, idag);
  return (
    <li className={`plan-oppgave${o.status === "ferdig" ? " ferdig" : ""}`} style={{ borderLeftColor: farge(o.prosjekt_id) }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
        <b>{o.tittel}</b>
        <span className={`chip ${sen ? "avslatt" : STATUS_CHIP[o.status]}`}>{sen ? "Forsinket" : OPPGAVE_STATUS[o.status]}</span>
      </div>
      {visProsjekt && p && <div className="small">{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}{p.adresse ? <span className="muted"> · {p.adresse}</span> : null}</div>}
      <div className="small muted">{periodeTekst(o)}{navn.length ? ` · ${navn.join(", ")}` : " · Ikke delt ut ennå"}</div>
      {o.beskrivelse && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{o.beskrivelse}</div>}
      {(min || leder) && (
        <div className="row" style={{ gap: 6 }}>
          {o.status === "planlagt" && <button className="btn sm" onClick={() => sett("pagaar", "Satt i gang")}>Start</button>}
          {o.status !== "ferdig" && <button className="btn sm primary" onClick={() => sett("ferdig", "Ferdig – bra jobba!")}>Ferdig</button>}
          {o.status === "ferdig" && <button className="btn sm" onClick={() => sett("pagaar", "Åpnet igjen")}>Ikke ferdig likevel</button>}
          {leder && rediger && <button className="btn sm" onClick={rediger}>Endre</button>}
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------ På prosjektet

/** Planen for ett prosjekt: arbeidet i rekkefølge, med en tidslinje over perioden. */
export function ProsjektPlan({ p }: { p: Prosjekt }) {
  const { d, idag } = useApp();
  const leder = usePlanlegger();
  const [skjema, setSkjema] = useState<null | (Partial<NyOppgave> & { id?: string })>(null);
  const liste = sorterOppgaver((d.oppgaver ?? []).filter((o) => o.prosjekt_id === p.id));
  const ferdige = liste.filter((o) => o.status === "ferdig").length;
  const start = liste.reduce((m, o) => (o.fra < m ? o.fra : m), liste[0]?.fra ?? idag);
  const slutt = liste.reduce((m, o) => (o.til > m ? o.til : m), liste[0]?.til ?? idag);
  const lengde = Math.max(1, (Date.parse(slutt) - Date.parse(start)) / 864e5 + 1);
  const pos = (iso: string) => ((Date.parse(iso) - Date.parse(start)) / 864e5 / lengde) * 100;
  const neste = liste.length ? Math.max(...liste.map((o) => o.rekkefolge)) + 1 : 1;
  const sisteSlutt = liste.length ? addDays(slutt, 1) : p.planlagt_start ?? idag;

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Plan</h2>
        {liste.length > 0 && <span className="small muted">{ferdige} av {liste.length} ferdig</span>}
      </div>
      {liste.length === 0 && !skjema && (
        <p className="muted small" style={{ margin: 0 }}>{leder ? "Del opp jobben i arbeid med datoer, og velg hvem som skal gjøre hva. De ansatte ser det i planen sin." : "Leder har ikke lagt inn noen plan for prosjektet ennå."}</p>
      )}
      {liste.length > 1 && (
        <div className="plan-tidslinje" aria-label="Tidslinje for prosjektet">
          {liste.map((o) => (
            <div key={o.id} className="plan-linje">
              <span className="plan-linje-navn small">{o.tittel}</span>
              <span className="plan-linje-spor">
                <i className={o.status === "ferdig" ? "ferdig" : forsinket(o, idag) ? "sen" : ""}
                  style={{ left: `${pos(o.fra)}%`, width: `${Math.max(2, ((Date.parse(o.til) - Date.parse(o.fra)) / 864e5 + 1) / lengde * 100)}%`, background: farge(p.id) }}
                  title={`${o.tittel}: ${periodeTekst(o)}`} />
                {idag >= start && idag <= slutt && <b className="plan-idag" style={{ left: `${pos(idag)}%` }} aria-hidden="true" />}
              </span>
            </div>
          ))}
          <div className="plan-linje small muted"><span className="plan-linje-navn" /><span className="plan-linje-spor" style={{ background: "none", display: "flex", justifyContent: "space-between" }}><span>{kortDato(start)}</span><span>{kortDato(slutt)}</span></span></div>
        </div>
      )}
      {liste.length > 0 && (
        <ol className="plan-liste">
          {liste.map((o) => skjema?.id === o.id
            ? <li key={o.id} className="plan-oppgave"><OppgaveSkjema prosjekt={p} start={skjema} ferdig={() => setSkjema(null)} /></li>
            : <OppgaveKort key={o.id} o={o} rediger={() => setSkjema({ ...o })} />)}
        </ol>
      )}
      {leder && (skjema && !skjema.id
        ? <OppgaveSkjema prosjekt={p} start={skjema} ferdig={() => setSkjema(null)} />
        : !skjema && <div><button className="btn primary" onClick={() => setSkjema({ prosjekt_id: p.id, fra: sisteSlutt, til: sisteSlutt, rekkefolge: neste })}>+ Legg til arbeid</button></div>)}
    </section>
  );
}

// ------------------------------------------------------------ Tidsplan for alle

/** Ukeplanen: én rad per ansatt, arbeidet de har fått hver dag, og ferie eller fravær. */
export function Tidsplan() {
  const { d, meg, idag } = useApp();
  const leder = usePlanlegger();
  const [uke, setUke] = useState(idag);
  const [skjema, setSkjema] = useState<null | (Partial<NyOppgave> & { id?: string })>(null);
  const [skjemaNr, setSkjemaNr] = useState(0);
  const skjemaRef = useRef<HTMLDivElement>(null);
  const aapne = (s: Partial<NyOppgave> & { id?: string }) => { setSkjema(s); setSkjemaNr((n) => n + 1); };
  // Skjemaet ligger under tabellen – rull ned til det så man ser at trykket virket
  useEffect(() => {
    if (!skjema || !skjemaRef.current) return;
    skjemaRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    skjemaRef.current.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
  }, [skjemaNr]); // eslint-disable-line react-hooks/exhaustive-deps
  const dager = ukeDager(uke);
  const alle = d.oppgaver ?? [];
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  const mine = sorterOppgaver(alle.filter((o) => o.ansatte.includes(meg.id) && o.status !== "ferdig"))
    .sort((a, b) => a.fra.localeCompare(b.fra));
  const ikkeDelt = alle.filter((o) => !o.ansatte.length && o.status !== "ferdig");
  const prosjekt = (id: string) => d.prosjekter.find((p) => p.id === id);
  const borte = (id: string, dato: string) => {
    const f = fravaerPaa(d.fravaer ?? [], id, dato);
    if (f) return f.type === "sykt_barn" ? "Sykt barn" : "Syk";
    if (borteDag(d.soknader.filter((s) => s.ansatt_id === id && s.status === "godkjent"), dato).length) return "Ferie";
    return "";
  };

  return (
    <>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Mitt arbeid</h2>
        {mine.length ? (
          <ol className="plan-liste">{mine.map((o) => <OppgaveKort key={o.id} o={o} visProsjekt />)}</ol>
        ) : <p className="muted small" style={{ margin: 0 }}>Du har ikke fått noe arbeid i planen nå.</p>}
      </section>

      <section className="panel">
        <div className="cal-head">
          <h2 style={{ margin: 0 }}>Tidsplan</h2>
          <div className="cal-nav">
            <button className="btn sm" aria-label="Forrige uke" onClick={() => setUke(addDays(uke, -7))}>‹</button>
            <h2 style={{ margin: 0 }}>Uke {ukenr(dager[0]!)}</h2>
            <button className="btn sm" aria-label="Neste uke" onClick={() => setUke(addDays(uke, 7))}>›</button>
            {!dager.includes(idag) && <button className="btn sm" onClick={() => setUke(idag)}>I dag</button>}
          </div>
        </div>
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl plan-uke">
            <thead><tr><th>Ansatt</th>{dager.map((x, i) => <th key={x} className={`${x === idag ? "idag" : ""}${i > 4 ? " helg" : ""}`}>{DAG[i]} {Number(x.slice(8))}.</th>)}</tr></thead>
            <tbody>
              {ansatte.map((a) => (
                <tr key={a.id} className={a.id === meg.id ? "meg" : ""}>
                  <td className="plan-navn">{a.navn}</td>
                  {dager.map((x, i) => {
                    const b = borte(a.id, x);
                    const os = oppgaverPaa(alle, a.id, x);
                    return (
                      <td key={x} className={`${x === idag ? "idag" : ""}${i > 4 ? " helg" : ""}`}>
                        {b && <span className="plan-borte">{b}</span>}
                        {os.map((o) => (
                          <button key={o.id} type="button" className={`plan-brikke${o.status === "ferdig" ? " ferdig" : ""}`} style={{ background: farge(o.prosjekt_id) }}
                            title={`${prosjekt(o.prosjekt_id)?.navn ?? ""}: ${o.tittel} (${periodeTekst(o)})`}
                            onClick={() => leder && aapne({ ...o })} disabled={!leder}>
                            <span className="p">{prosjekt(o.prosjekt_id)?.navn ?? "Prosjekt"}</span>
                            <span className="t">{o.tittel}</span>
                          </button>
                        ))}
                        {leder && !b && (
                          <button type="button" className={`plan-ledig${os.length || i > 4 ? " liten" : ""}`} title={`Planlegg arbeid for ${a.navn} ${DAG[i]?.toLowerCase()} ${Number(x.slice(8))}.`}
                            aria-label={`Planlegg arbeid for ${a.navn} ${DAG[i]} ${Number(x.slice(8))}.`} onClick={() => aapne({ ansatte: [a.id], fra: x, til: x })}>+</button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leder && !skjema && <div className="row"><button className="btn primary" onClick={() => aapne({ fra: dager[0]!, til: dager[4]! })}>+ Del ut arbeid</button></div>}
        {leder && !skjema && <p className="muted small" style={{ margin: 0 }}>Trykk på + i en rute for å planlegge arbeid for den ansatte den dagen, eller på en jobb for å endre den.</p>}
        <div ref={skjemaRef} style={{ scrollMarginTop: 70 }}>{leder && skjema && <OppgaveSkjema key={skjemaNr} start={skjema} ferdig={() => setSkjema(null)} />}</div>
        {leder && ikkeDelt.length > 0 && (
          <>
            <h3 style={{ marginBottom: 0 }}>Ikke delt ut ennå</h3>
            <ol className="plan-liste">{sorterOppgaver(ikkeDelt).map((o) => <OppgaveKort key={o.id} o={o} visProsjekt rediger={() => aapne({ ...o })} />)}</ol>
          </>
        )}
      </section>
    </>
  );
}
