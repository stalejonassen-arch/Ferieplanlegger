// Egenkontroll (sjekklister), SJA og mannskapsliste på prosjektet.
import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, langDato, sorterAnsatte } from "../lib/ferie";
import { FARER, MALER, SVAR, avvikIListe, besvart, hmsKortStatus, kvitteringer, mannskapCsv, mannskapsliste, type Punkt, type Risiko, type Sja, type Sjekkliste, type Svar } from "../lib/kvalitet";
import { lastNedCsv } from "../lib/lonn";
import { t2, type Prosjekt } from "../lib/timer";
import { Bilder } from "./Bilder";
import { usePlanlegger } from "./Plan";

const navnPaa = (d: ReturnType<typeof useApp>["d"], id: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";

// ------------------------------------------------------------ Sjekklister

function Utfylling({ s, lukk }: { s: Sjekkliste; lukk: () => void }) {
  const { d, kjor } = useApp();
  const planlegger = usePlanlegger();
  const [punkter, setPunkter] = useState<Punkt[]>(s.punkter);
  const [nytt, setNytt] = useState("");
  useEffect(() => setPunkter(s.punkter), [s.id, s.endret]); // eslint-disable-line react-hooks/exhaustive-deps
  const laast = s.status === "signert";
  const endret = JSON.stringify(punkter) !== JSON.stringify(s.punkter);
  const sett = (i: number, x: Partial<Punkt>) => setPunkter(punkter.map((p, n) => (n === i ? { ...p, ...x } : p)));
  const lagre = (status?: "signert") => kjor(() => api.lagreSjekkliste(s.id, { punkter: punkter.map((x) => ({ ...x, kommentar: (x.kommentar ?? "").trim() })), ...(status ? { status } : {}) }), status ? "Sjekklisten er signert" : "Lagret");
  const ferdig = punkter.every((p) => p.svar);
  const bilder = d.bilder.filter((b) => b.sjekkliste_id === s.id);

  return (
    <div className="sjekkliste">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{s.navn}</b>
        <button className="btn sm" onClick={lukk}>Lukk</button>
      </div>
      {laast && <p className="small" style={{ margin: 0 }}>Signert av {navnPaa(d, s.signert_av)}{s.signert_tid ? `, ${langDato(s.signert_tid.slice(0, 10))}` : ""}.</p>}
      <ol className="sk-punkter">
        {punkter.map((p, i) => (
          <li key={i} className={p.svar ? `svar-${p.svar}` : ""}>
            <span className="sk-tekst">{p.tekst}</span>
            <span className="sk-valg" role="group" aria-label={`Svar på ${p.tekst}`}>
              {(Object.keys(SVAR) as Svar[]).map((v) => (
                <button key={v} type="button" className={`sk-knapp ${v}`} aria-pressed={p.svar === v} disabled={laast}
                  onClick={() => sett(i, { svar: p.svar === v ? null : v })}>{SVAR[v]}</button>
              ))}
            </span>
            {(p.svar === "avvik" || p.kommentar) && (
              <input className="sk-kommentar" aria-label={`Kommentar til ${p.tekst}`} value={p.kommentar ?? ""} disabled={laast}
                placeholder={p.svar === "avvik" ? "Hva er feil, og hva er gjort?" : "Kommentar"} onChange={(e) => sett(i, { kommentar: e.target.value })} />
            )}
            {!laast && p.svar !== "avvik" && !p.kommentar && <button type="button" className="linkbtn small" onClick={() => sett(i, { kommentar: " " })}>+ Kommentar</button>}
          </li>
        ))}
      </ol>
      {!laast && (
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (nytt.trim()) { setPunkter([...punkter, { tekst: nytt.trim(), svar: null, kommentar: "" }]); setNytt(""); } }}>
          <input value={nytt} onChange={(e) => setNytt(e.target.value)} placeholder="Legg til eget punkt" aria-label="Nytt punkt" style={{ flex: 1, minWidth: 160 }} />
          <button className="btn sm" disabled={!nytt.trim()}>Legg til</button>
        </form>
      )}
      <Bilder bilder={bilder} til={{ prosjekt_id: s.prosjekt_id, sjekkliste_id: s.id }} tittel="Bilder til sjekklisten" />
      <div className="row" style={{ gap: 8 }}>
        {!laast && <button className="btn" disabled={!endret} onClick={() => lagre()}>Lagre</button>}
        {!laast && <button className="btn primary" disabled={!ferdig} onClick={() => lagre("signert")} title={ferdig ? "" : "Svar på alle punktene først"}>Signer sjekklisten</button>}
        {!laast && !ferdig && <span className="small muted">{punkter.filter((p) => !p.svar).length} punkter mangler svar</span>}
        {laast && planlegger && <button className="btn" onClick={() => kjor(() => api.lagreSjekkliste(s.id, { status: "pagaar" }), "Sjekklisten er åpnet igjen")}>Åpne igjen</button>}
        {(planlegger || !laast) && <button className="btn" style={{ marginLeft: "auto" }} onClick={async () => { if (await kjor(() => api.slettSjekkliste(s.id), "Sjekklisten er slettet")) lukk(); }}>Slett</button>}
      </div>
    </div>
  );
}

/** Egenkontroll på prosjektet: velg en mal, fyll ut og signer. Signerte lister følger sluttrapporten. */
export function Sjekklister({ p }: { p: Prosjekt }) {
  const { d, kjor } = useApp();
  const [aapen, setAapen] = useState<string | null>(null);
  const [mal, setMal] = useState("");
  const liste = (d.sjekklister ?? []).filter((s) => s.prosjekt_id === p.id).sort((a, b) => a.opprettet.localeCompare(b.opprettet));
  const valgt = liste.find((s) => s.id === aapen);
  const ny = async () => {
    const m = MALER.find((x) => x.id === mal);
    let id = "";
    const ok = await kjor(async () => { id = await api.nySjekkliste(p.id, m?.navn ?? "Egen sjekkliste", m?.id ?? "egen", m?.punkter ?? []); }, "Sjekklisten er laget");
    if (ok) { setAapen(id); setMal(""); }
  };
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Egenkontroll</h2>
      {valgt ? <Utfylling s={valgt} lukk={() => setAapen(null)} /> : (
        <>
          {liste.length ? (
            <ul className="plan-liste">
              {liste.map((s) => (
                <li key={s.id} className="plan-oppgave" style={{ borderLeftColor: s.status === "signert" ? "var(--approved)" : "var(--pending)", cursor: "pointer" }} onClick={() => setAapen(s.id)}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>{s.navn}</b>
                    <span className={`chip ${s.status === "signert" ? "godkjent" : "venter"}`}>{s.status === "signert" ? "Signert" : `${besvart(s)} av ${s.punkter.length}`}</span>
                  </div>
                  <div className="small muted">
                    {s.status === "signert" ? `Signert av ${navnPaa(d, s.signert_av)} ${s.signert_tid ? kortDato(s.signert_tid.slice(0, 10)) : ""}` : `Startet av ${navnPaa(d, s.opprettet_av)} ${kortDato(s.opprettet.slice(0, 10))}`}
                    {avvikIListe(s) ? ` · ${avvikIListe(s)} avvik` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="muted small" style={{ margin: 0 }}>Ingen sjekklister på prosjektet ennå. Fyll dem ut mens arbeidet gjøres, så følger de sluttrapporten når de er signert.</p>}
          <div className="row" style={{ gap: 8, alignItems: "end" }}>
            <label className="field" style={{ flex: "1 1 240px" }}><span className="label">Ny sjekkliste</span>
              <select id="ny-sjekkliste" value={mal} onChange={(e) => setMal(e.target.value)}>
                <option value="">Velg …</option>
                {MALER.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
                <option value="egen">Egen sjekkliste (tom)</option>
              </select></label>
            <button className="btn primary" disabled={!mal} onClick={ny}>Start</button>
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ SJA

function SjaSkjema({ p, start, lukk }: { p: Prosjekt; start?: Sja; lukk: () => void }) {
  const { d, kjor, idag, meg } = useApp();
  const [f, setF] = useState({ dato: start?.dato ?? idag, arbeid: start?.arbeid ?? "", verneutstyr: start?.verneutstyr ?? "", deltakere: start?.deltakere ?? [meg.id] });
  const [risikoer, setRisikoer] = useState<Risiko[]>(start?.risikoer.length ? start.risikoer : [{ fare: "", tiltak: "" }]);
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  const kan = f.arbeid.trim() && risikoer.some((r) => r.fare.trim());
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await kjor(() => api.lagreSja({ id: start?.id, prosjekt_id: p.id, ...f, arbeid: f.arbeid.trim(), verneutstyr: f.verneutstyr.trim(),
      risikoer: risikoer.filter((r) => r.fare.trim()).map((r) => ({ fare: r.fare.trim(), tiltak: r.tiltak.trim() })) }), start ? "SJA-en er endret" : "SJA-en er lagret. Deltakerne må kvittere.");
    if (ok) lukk();
  };
  return (
    <form onSubmit={lagre} style={{ display: "grid", gap: 10 }}>
      <datalist id="farer">{FARER.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: "3 1 240px" }}><span className="label">Arbeid som skal gjøres</span>
          <input id="sja-arbeid" value={f.arbeid} onChange={(e) => setF({ ...f, arbeid: e.target.value })} placeholder="F.eks. Legge takstein fra stillas" maxLength={500} required /></label>
        <label className="field kort"><span className="label">Dato</span>
          <input type="date" value={f.dato} onChange={(e) => setF({ ...f, dato: e.target.value })} required /></label>
      </div>
      <div className="label">Farer og tiltak</div>
      {risikoer.map((r, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <input list="farer" aria-label={`Fare ${i + 1}`} value={r.fare} placeholder="Fare" style={{ flex: "1 1 200px" }}
            onChange={(e) => setRisikoer(risikoer.map((x, n) => (n === i ? { ...x, fare: e.target.value } : x)))} />
          <input aria-label={`Tiltak ${i + 1}`} value={r.tiltak} placeholder="Tiltak" style={{ flex: "2 1 240px" }}
            onChange={(e) => setRisikoer(risikoer.map((x, n) => (n === i ? { ...x, tiltak: e.target.value } : x)))} />
          {risikoer.length > 1 && <button type="button" className="linkbtn small" onClick={() => setRisikoer(risikoer.filter((_, n) => n !== i))}>Fjern</button>}
        </div>
      ))}
      <div><button type="button" className="btn sm" onClick={() => setRisikoer([...risikoer, { fare: "", tiltak: "" }])}>+ Fare</button></div>
      <label className="field"><span className="label">Verneutstyr</span>
        <input value={f.verneutstyr} onChange={(e) => setF({ ...f, verneutstyr: e.target.value })} placeholder="F.eks. hjelm, sele, hørselvern, støvmaske" /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Hvem er med</legend>
        <div className="plan-velg">
          {ansatte.map((a) => (
            <label key={a.id} className={`plan-person${f.deltakere.includes(a.id) ? " valgt" : ""}`}>
              <input type="checkbox" checked={f.deltakere.includes(a.id)}
                onChange={() => setF({ ...f, deltakere: f.deltakere.includes(a.id) ? f.deltakere.filter((x) => x !== a.id) : [...f.deltakere, a.id] })} />{a.navn}
            </label>
          ))}
        </div>
      </fieldset>
      {start && Object.keys(start.kvittert).length > 0 && <p className="small muted" style={{ margin: 0 }}>Endrer du arbeid, farer, tiltak eller dato, må alle kvittere på nytt.</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!kan}>Lagre SJA</button>
        <button type="button" className="btn" onClick={lukk}>Avbryt</button>
      </div>
    </form>
  );
}

/** Sikker jobbanalyse før risikofylt arbeid. Deltakerne kvitterer i appen. */
export function SjaDel({ p }: { p: Prosjekt }) {
  const { d, meg, kjor } = useApp();
  const planlegger = usePlanlegger();
  const [skjema, setSkjema] = useState<Sja | "ny" | null>(null);
  const liste = (d.sja ?? []).filter((s) => s.prosjekt_id === p.id).sort((a, b) => b.dato.localeCompare(a.dato));
  if (skjema) return <section className="panel"><h2 style={{ margin: 0 }}>{skjema === "ny" ? "Ny SJA" : "Endre SJA"}</h2><SjaSkjema p={p} start={skjema === "ny" ? undefined : skjema} lukk={() => setSkjema(null)} /></section>;
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>SJA – sikker jobbanalyse</h2>
        <button className="btn primary" onClick={() => setSkjema("ny")}>+ Ny SJA</button>
      </div>
      {!liste.length && <p className="muted small" style={{ margin: 0 }}>Lag en SJA før arbeid med fare for liv og helse, for eksempel arbeid på tak, i høyden eller ved riving.</p>}
      <ul className="plan-liste">
        {liste.map((s) => {
          const ferdig = kvitteringer(s) === s.deltakere.length && s.deltakere.length > 0;
          const minTur = s.deltakere.includes(meg.id) && !s.kvittert[meg.id];
          return (
            <li key={s.id} className="plan-oppgave" style={{ borderLeftColor: ferdig ? "var(--approved)" : "var(--pending)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{s.arbeid}</b>
                <span className={`chip ${ferdig ? "godkjent" : "venter"}`}>{kvitteringer(s)} av {s.deltakere.length} har kvittert</span>
              </div>
              <div className="small muted">{langDato(s.dato)} · laget av {navnPaa(d, s.opprettet_av)}</div>
              <table className="tbl small"><thead><tr><th>Fare</th><th>Tiltak</th></tr></thead>
                <tbody>{s.risikoer.map((r, i) => <tr key={i}><td style={{ whiteSpace: "normal" }}>{r.fare}</td><td style={{ whiteSpace: "normal" }}>{r.tiltak || "–"}</td></tr>)}</tbody></table>
              {s.verneutstyr && <div className="small"><b>Verneutstyr:</b> {s.verneutstyr}</div>}
              <div className="small">{s.deltakere.map((id) => `${navnPaa(d, id)} ${s.kvittert[id] ? "✓" : "–"}`).join(" · ")}</div>
              <div className="row" style={{ gap: 6 }}>
                {minTur && <button className="btn sm primary" onClick={() => kjor(() => api.kvitterSja(s.id), "Takk – du har kvittert")}>Jeg har gått gjennom SJA-en</button>}
                {(planlegger || s.opprettet_av === meg.id) && <button className="btn sm" onClick={() => setSkjema(s)}>Endre</button>}
                {(planlegger || s.opprettet_av === meg.id) && <button className="btn sm" onClick={() => kjor(() => api.slettSja(s.id), "SJA-en er slettet")}>Slett</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------ Mannskapsliste og HMS-kort

/** Eget HMS-kort: den ansatte legger inn nummer og utløpsdato selv */
export function MittHmsKort() {
  const { meg, kjor, idag } = useApp();
  const [nr, setNr] = useState(meg.hms_kort_nr ?? "");
  const [gyldig, setGyldig] = useState(meg.hms_kort_gyldig ?? "");
  const st = hmsKortStatus(meg, idag);
  const tekst = { mangler: "Du har ikke lagt inn HMS-kortet ditt.", utlopt: "HMS-kortet ditt har gått ut.", snart: "HMS-kortet ditt går snart ut.", ok: "" }[st];
  return (
    <form className="row" style={{ gap: 8, alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); kjor(() => api.lagreMittHmsKort(nr, gyldig || null), "HMS-kortet er lagret"); }}>
      <label className="field" style={{ flex: "1 1 160px" }}><span className="label">Mitt HMS-kort (nummer)</span>
        <input id="hms-kort-nr" value={nr} onChange={(e) => setNr(e.target.value)} maxLength={40} /></label>
      <label className="field kort"><span className="label">Gyldig til</span>
        <input type="date" value={gyldig} onChange={(e) => setGyldig(e.target.value)} /></label>
      <button className="btn" disabled={nr === (meg.hms_kort_nr ?? "") && gyldig === (meg.hms_kort_gyldig ?? "")}>Lagre</button>
      {tekst && <span className="small" style={{ color: st === "ok" ? undefined : "var(--warn)", flexBasis: "100%" }}>{tekst}</span>}
    </form>
  );
}

/** Hvem som har vært på prosjektet, dag for dag (fra timene), med HMS-kort */
export function Mannskap({ p }: { p: Prosjekt }) {
  const { d, idag } = useApp();
  const [alle, setAlle] = useState(false);
  const liste = mannskapsliste(d.timer, d.ansatte, p.id);
  const vis = alle ? liste : liste.slice(0, 14);
  const pa = [...new Map(liste.flatMap((x) => x.ansatte.map((y) => [y.ansatt.id, y.ansatt] as const))).values()];
  const mangler = pa.filter((a) => hmsKortStatus(a, idag) !== "ok");
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Mannskapsliste</h2>
        {liste.length > 0 && <button className="btn sm" onClick={() => lastNedCsv(mannskapCsv(liste, p.navn), `mannskapsliste-${(p.visma_nr ?? p.navn).toString().replace(/[^\wæøåÆØÅ-]+/g, "-")}.csv`)}>Last ned (Excel)</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Laget av timene som er ført på prosjektet. Byggherreforskriften krever oversikt over hvem som er på byggeplassen.</p>
      {mangler.length > 0 && (
        <ul className="checks"><li className="advarsel"><span className="i" aria-hidden="true">!</span>
          <span>HMS-kort mangler eller har gått ut: {mangler.map((a) => `${a.navn} (${{ mangler: "mangler", utlopt: "utløpt", snart: "går snart ut", ok: "" }[hmsKortStatus(a, idag)]})`).join(", ")}.</span></li></ul>
      )}
      <MittHmsKort />
      {vis.length ? (
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Dato</th><th>På byggeplassen</th></tr></thead>
            <tbody>
              {vis.map((x) => (
                <tr key={x.dato}>
                  <td style={{ whiteSpace: "nowrap" }}>{kortDato(x.dato)} {x.dato.slice(0, 4)}</td>
                  <td>{x.ansatte.map((y) => <span key={y.ansatt.id} className="small" style={{ marginRight: 12, whiteSpace: "nowrap" }}>{y.ansatt.navn} <span className="muted">({t2(y.timer)} t{y.ansatt.hms_kort_nr ? ` · HMS ${y.ansatt.hms_kort_nr}` : ""})</span></span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small">Ingen timer på prosjektet ennå.</p>}
      {liste.length > 14 && <div><button className="btn sm" onClick={() => setAlle(!alle)}>{alle ? "Vis færre" : `Vis alle ${liste.length} dager`}</button></div>}
    </section>
  );
}
