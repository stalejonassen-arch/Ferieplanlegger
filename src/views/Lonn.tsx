import { useState } from "react";
import { useApp } from "../App";
import { MND, vd } from "../lib/ferie";
import { lastNedCsv, lonnAarCsv, lonnCsv, lonnMaaned, lonnTimerCsv, lonnTimerMaaned } from "../lib/lonn";
import { api } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { t2 } from "../lib/timer";

export function Lonn() {
  const { d, aar, idag, kjor } = useApp();
  const iAar = Number(idag.slice(0, 4)) === aar;
  const [mnd, setMnd] = useState(() => (iAar ? Number(idag.slice(5, 7)) : 1));
  const rader = lonnMaaned(d, aar, mnd);
  const sum = rader.reduce((n, r) => n + r.dager, 0);
  const venter = rader.filter((r) => r.venter > 0);
  const mndNavn = MND[mnd - 1];
  const timer = lonnTimerMaaned(d, aar, mnd);
  const harTimer = timer.some((r) => r.normal + r.ot50 + r.ot100 > 0);
  const ikkeGodkjent = timer.filter((r) => r.ikkeGodkjent > 0);
  const unntak = (ansattId: string, dato: string) => {
    const t = d.timer.find((x) => x.ansatt_id === ansattId && x.dato === dato);
    if (t) kjor(() => api.lunsjUnntak(t.id, true), "Godkjent uten lunsjtrekk");
  };

  return (
    <>
      <section className="panel">
        <div className="cal-head">
          <h2 style={{ margin: 0 }}>Timer i lønnskjøringen</h2>
          <div className="cal-nav">
            <button className="btn sm" aria-label="Forrige måned" disabled={mnd === 1} onClick={() => setMnd(mnd - 1)}>‹</button>
            <h2 style={{ margin: 0 }}>{mndNavn[0].toUpperCase() + mndNavn.slice(1)} {aar}</h2>
            <button className="btn sm" aria-label="Neste måned" disabled={mnd === 12} onClick={() => setMnd(mnd + 1)}>›</button>
          </div>
        </div>
        <p className="small muted">Overtid regnes per uke: timer over normaltiden (37,5 eller 40 t) gir 50 %, timer på søndag og helligdager gir 100 %. Lunsj trekkes for dem som skal trekkes, på dager over 5,5 timer uten registrert lunsj.</p>
        {ikkeGodkjent.length > 0 && (
          <ul className="checks"><li className="advarsel"><span className="i" aria-hidden="true">!</span>
            <span>Ikke godkjent ennå: {ikkeGodkjent.map((r) => `${r.ansatt.navn} (${r.ikkeGodkjent})`).join(", ")}. Godkjenn under «Timer» før du kjører lønn.</span></li></ul>
        )}
        {harTimer ? (
          <div className="scroll" style={{ border: 0 }}>
            <table className="tbl">
              <thead><tr><th>Ansatt</th><th>Normaltid</th><th>Overtid 50 %</th><th>Overtid 100 %</th><th>Km</th><th>Lunsjtrekk</th></tr></thead>
              <tbody>
                {timer.map((r) => (
                  <tr key={r.ansatt.id}>
                    <td>{r.ansatt.navn}<div className="small muted">{t2(r.ansatt.normaltid_uke ?? 37.5)} t/uke{r.ansatt.lunsjtrekk ? " · lunsjtrekk" : ""}</div></td>
                    <td className="n">{t2(r.normal) || "–"}</td>
                    <td className="n">{t2(r.ot50) || "–"}</td>
                    <td className="n">{t2(r.ot100) || "–"}</td>
                    <td className="n">{t2(r.km) || "–"}</td>
                    <td>{r.avvik.length ? r.avvik.map((x) => (
                      <div key={x} className="small" style={{ whiteSpace: "nowrap" }}>{kortDato(x)} <button className="linkbtn" onClick={() => unntak(r.ansatt.id, x)}>Ikke trekk</button></div>
                    )) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">Ingen timer registrert i {mndNavn}.</div>}
        <div className="row">
          <button className="btn primary" disabled={!harTimer} onClick={() => lastNedCsv(lonnTimerCsv(timer, aar, mnd), `timer-${aar}-${String(mnd).padStart(2, "0")}.csv`)}>Last ned lønnsgrunnlag {mndNavn} (Excel)</button>
        </div>
      </section>

      <section className="panel">
        <div className="cal-head">
          <h2 style={{ margin: 0 }}>Ferie i lønnskjøringen</h2>
          <div className="cal-nav">
            <button className="btn sm" aria-label="Forrige måned" disabled={mnd === 1} onClick={() => setMnd(mnd - 1)}>‹</button>
            <h2 style={{ margin: 0 }}>{mndNavn[0].toUpperCase() + mndNavn.slice(1)} {aar}</h2>
            <button className="btn sm" aria-label="Neste måned" disabled={mnd === 12} onClick={() => setMnd(mnd + 1)}>›</button>
          </div>
        </div>
        <p className="small muted">Godkjente feriedager mandag–fredag, uten helligdager. Bruk tallene når du kjører lønn for måneden.</p>

        {venter.length > 0 && (
          <ul className="checks">
            <li className="advarsel"><span className="i" aria-hidden="true">!</span>
              <span>Venter på godkjenning og er ikke tatt med: {venter.map((r) => `${r.ansatt.navn} (${vd(r.venter)})`).join(", ")}.</span></li>
          </ul>
        )}

        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Ansatt</th><th>Feriedager</th><th>Perioder</th><th>Hittil i år</th></tr></thead>
            <tbody>
              {rader.map((r) => (
                <tr key={r.ansatt.id} style={r.dager ? undefined : { color: "var(--muted)" }}>
                  <td>{r.ansatt.navn}{r.ansatt.over60 && <span className="small muted"> · over 60</span>}<div className="small muted">{r.avdeling}</div></td>
                  <td className="n">{r.dager || "–"}</td>
                  <td>{r.perioder.join(", ")}</td>
                  <td className="n">{r.hittil}</td>
                </tr>
              ))}
              <tr><td><b>Sum</b></td><td className="n"><b>{sum}</b></td><td /><td className="n"><b>{rader.reduce((n, r) => n + r.hittil, 0)}</b></td></tr>
            </tbody>
          </table>
        </div>

        <div className="row">
          <button className="btn primary" onClick={() => lastNedCsv(lonnCsv(rader, aar, mnd), `ferie-${aar}-${String(mnd).padStart(2, "0")}.csv`)}>
            Last ned {mndNavn} (Excel)
          </button>
          <button className="btn" onClick={() => lastNedCsv(lonnAarCsv(d, aar), `ferie-${aar}-hele-aaret.csv`)}>Last ned hele {aar}</button>
        </div>
        <p className="small muted">Ansatte over 60 år har krav på 2,3 prosentpoeng ekstra feriepenger (ferieloven § 10 nr. 3).</p>
      </section>
    </>
  );
}
