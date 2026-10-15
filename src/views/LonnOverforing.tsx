// Overføring av lønnsgrunnlaget til lønnssystemet: importfil til Visma Lønn, eller rett inn i Tripletex.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api, type LonnSendt, type TxLonnsart } from "../lib/api";
import { MND } from "../lib/ferie";
import type { LonnRad } from "../lib/lonn";
import { ARTER, SYSTEMER, lastNedTekst, lonnLinjer, utenAnsattnr, vismaLonnFil, type LonnOppsett, type Lonnsarter, type LonnSystem } from "../lib/lonnsystem";
import type { LonnTimer } from "../lib/timer";

const pad = (n: number) => String(n).padStart(2, "0");

export function LonnOverforing({ timer, ferie, aar, mnd }: { timer: LonnTimer[]; ferie: LonnRad[]; aar: number; mnd: number }) {
  const { kjor } = useApp();
  const [oppsett, setOppsett] = useState<LonnOppsett | null>(null);
  const [system, setSystem] = useState<LonnSystem>("excel");
  const [arter, setArter] = useState<Lonnsarter>({});
  const [redigerer, setRedigerer] = useState(false);
  const [txArter, setTxArter] = useState<TxLonnsart[] | null>(null);
  const [jobber, setJobber] = useState(false);
  const [bekreft, setBekreft] = useState(false);
  const [svar, setSvar] = useState<LonnSendt | null>(null);
  const [feil, setFeil] = useState("");

  const last = () => api.lonnOppsett().then((o) => {
    setOppsett(o);
    if (o) { setSystem(o.system); setArter(o.arter ?? {}); setRedigerer(o.system !== "excel" && !Object.keys(o.arter ?? {}).length); }
  }).catch(() => setOppsett(null));
  useEffect(() => { last(); }, []);
  useEffect(() => { setBekreft(false); setSvar(null); setFeil(""); }, [aar, mnd]);

  const linjer = useMemo(() => lonnLinjer(timer, ferie, oppsett?.arter ?? {}), [timer, ferie, oppsett]);
  if (!oppsett) return null;

  const mndNavn = MND[mnd - 1]!;
  const mndKode = `${aar}-${pad(mnd)}`;
  const mangler = utenAnsattnr(linjer);
  const satt = ARTER.filter((a) => oppsett.arter[a.art]);
  const ansatte = new Set(linjer.map((l) => l.ansatt_id)).size;
  const txNavn = (kode?: string) => txArter?.find((t) => t.number === kode?.trim());

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await kjor(() => api.lagreLonnOppsett(system, arter), "Lønnsoppsettet er lagret");
    if (ok) { setRedigerer(false); await last(); }
  };
  const hentTxArter = async () => {
    setFeil("");
    try { setTxArter(await api.tripletexLonnsarter()); } catch (e) { setFeil(e instanceof Error ? e.message : String(e)); }
  };
  const send = async () => {
    setJobber(true); setFeil(""); setSvar(null);
    try { setSvar(await api.sendLonnTripletex(mndKode, linjer)); } catch (e) { setFeil(e instanceof Error ? e.message : String(e)); }
    finally { setJobber(false); setBekreft(false); }
  };

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Overføring til lønnssystemet</h2>
        <span className="chip">{SYSTEMER.find((s) => s.id === oppsett.system)?.navn}</span>
      </div>

      {redigerer ? (
        <form onSubmit={lagre} style={{ display: "grid", gap: 10 }}>
          <label className="field"><span className="label">Lønnssystem</span>
            <select id="lonn-system" value={system} onChange={(e) => setSystem(e.target.value as LonnSystem)}>
              {SYSTEMER.map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}
            </select>
          </label>
          {system === "visma_lonn" && <p className="small muted" style={{ margin: 0 }}>Visma Business NXT har ikke lønn selv. Bruker dere Visma Lønn, lager ByggLogg en fil som leses inn under <b>Rutiner → Registrering → Import variable lønnsdata</b>. Skriv inn lønnsartnummeret dere bruker i Visma Lønn for hver type.</p>}
          {system === "tripletex" && (
            <p className="small muted" style={{ margin: 0 }}>
              Lønnsartene føres i timelisten til hver ansatt i Tripletex og blir med når dere kjører lønn der. Normaltid på prosjekt sendes allerede som timeføringer, så la «Normaltid» stå tom hvis Tripletex henter timelønn fra timelisten.{" "}
              <button type="button" className="linkbtn" onClick={hentTxArter}>Hent lønnsartene fra Tripletex</button>
            </p>
          )}
          {system !== "excel" && (
            <div className="scroll" style={{ border: 0 }}>
              <table className="tbl">
                <thead><tr><th>Fra ByggLogg</th><th>Lønnsart nr.</th><th /></tr></thead>
                <tbody>
                  {ARTER.map((a) => {
                    const tx = system === "tripletex" ? txNavn(arter[a.art]) : undefined;
                    return (
                      <tr key={a.art}>
                        <td>{a.navn} <span className="small muted">({a.enhet})</span>{a.hjelp && <div className="small muted">{a.hjelp}</div>}</td>
                        <td><input id={`lonnsart-${a.art}`} list={system === "tripletex" ? "tx-lonnsarter" : undefined} inputMode="numeric" style={{ width: 110 }}
                          value={arter[a.art] ?? ""} onChange={(e) => setArter({ ...arter, [a.art]: e.target.value })} placeholder="Ikke med" aria-label={`Lønnsart for ${a.navn}`} /></td>
                        <td className="small">{tx ? <>{tx.name}{!tx.showInTimesheet && <span className="feil"> – ikke slått på for timeliste i Tripletex</span>}</> : txArter && arter[a.art]?.trim() ? <span className="feil">Finnes ikke i Tripletex</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {txArter && <datalist id="tx-lonnsarter">{txArter.map((t) => <option key={t.id} value={t.number}>{t.name}</option>)}</datalist>}
            </div>
          )}
          {feil && <p className="small feil" style={{ margin: 0 }}>{feil}</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary">Lagre</button>
            <button type="button" className="btn" onClick={() => { setSystem(oppsett.system); setArter(oppsett.arter); setRedigerer(false); }}>Avbryt</button>
          </div>
        </form>
      ) : oppsett.system === "excel" ? (
        <>
          <p className="small muted">Lønnsgrunnlaget lastes ned som regneark. Bruker dere Visma Lønn eller Tripletex, kan timene, overtiden, kjøringen, ferien og fraværet gå rett inn i lønnssystemet i stedet.</p>
          <div className="row"><button className="btn" onClick={() => setRedigerer(true)}>Velg lønnssystem</button></div>
        </>
      ) : (
        <>
          <p className="small muted">
            {satt.length ? <>Føres på: {satt.map((a) => `${a.navn} → ${oppsett.arter[a.art]}`).join(", ")}. </> : "Ingen lønnsarter er satt opp ennå. "}
            <button className="linkbtn" onClick={() => setRedigerer(true)}>Endre</button>
          </p>
          {timer.some((r) => r.ikkeGodkjent > 0) && (
            <ul className="checks"><li className="advarsel"><span className="i" aria-hidden="true">!</span>
              <span>Noen timer i {mndNavn} er ikke godkjent ennå, men er med i tallene. Godkjenn dem før du overfører.</span></li></ul>
          )}
          {linjer.length ? (
            <p className="small">{linjer.length} lønnslinjer for {ansatte} ansatte i {mndNavn} {aar}.</p>
          ) : <div className="empty">Ingen lønnslinjer i {mndNavn} med lønnsartene som er satt opp.</div>}

          {oppsett.system === "visma_lonn" && (
            <>
              {mangler.length > 0 && <ul className="checks"><li className="advarsel"><span className="i" aria-hidden="true">!</span>
                <span>Mangler ansattnummer og kommer ikke med i fila: {mangler.join(", ")}. Legg inn samme ansattnummer som i Visma Lønn under «Ansatte».</span></li></ul>}
              <div className="row">
                <button className="btn primary" disabled={!linjer.some((l) => l.ansattnr)}
                  onClick={() => lastNedTekst(vismaLonnFil(linjer, aar), `visma-lonn-${mndKode}.csv`, "text/csv;charset=utf-8")}>Last ned importfil til Visma Lønn</button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Les inn fila i Visma Lønn under Rutiner → Registrering → Import variable lønnsdata, og kontroller lønnslista før du kjører lønn.</p>
            </>
          )}

          {oppsett.system === "tripletex" && (
            <>
              {feil && <p className="small feil">{feil}</p>}
              {svar && (
                <ul className="checks">
                  <li className={svar.feil.length || svar.ukjente_lonnsarter.length ? "advarsel" : "ok"}><span className="i" aria-hidden="true">{svar.feil.length ? "!" : "✓"}</span>
                    <span>{svar.sendt} nye, {svar.oppdatert} oppdatert og {svar.fjernet} fjernet i Tripletex for {mndNavn}.</span></li>
                  {svar.ikke_koblet.length > 0 && <li className="advarsel"><span className="i" aria-hidden="true">!</span><span>Ikke koblet til en ansatt i Tripletex: {svar.ikke_koblet.join(", ")}. Bruk samme e-post eller ansattnummer begge steder.</span></li>}
                  {svar.ukjente_lonnsarter.length > 0 && <li className="advarsel"><span className="i" aria-hidden="true">!</span><span>Lønnsart finnes ikke i Tripletex: {svar.ukjente_lonnsarter.join(", ")}.</span></li>}
                  {svar.feil.map((f) => <li key={f} className="advarsel"><span className="i" aria-hidden="true">!</span><span>{f}</span></li>)}
                </ul>
              )}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {bekreft ? (
                  <>
                    <button className="btn primary" disabled={jobber} onClick={send}>{jobber ? "Sender …" : `Ja, send ${mndNavn}`}</button>
                    <button className="btn" disabled={jobber} onClick={() => setBekreft(false)}>Avbryt</button>
                  </>
                ) : (
                  <button className="btn primary" onClick={() => setBekreft(true)}>Send {mndNavn} til Tripletex lønn</button>
                )}
              </div>
              <p className="small muted" style={{ margin: 0 }}>Linjene legges i timelisten til hver ansatt, datert siste dag i måneden. Sender du måneden på nytt etter endringer, rettes linjene i stedet for å legges inn to ganger. Kontroller lønnen i Tripletex før den utbetales.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
