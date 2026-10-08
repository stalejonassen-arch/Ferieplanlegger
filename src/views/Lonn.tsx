import { useState } from "react";
import { useApp } from "../App";
import { MND, vd } from "../lib/ferie";
import { lastNedCsv, lonnAarCsv, lonnCsv, lonnMaaned } from "../lib/lonn";

export function Lonn() {
  const { d, aar, idag } = useApp();
  const iAar = Number(idag.slice(0, 4)) === aar;
  const [mnd, setMnd] = useState(() => (iAar ? Number(idag.slice(5, 7)) : 1));
  const rader = lonnMaaned(d, aar, mnd);
  const sum = rader.reduce((n, r) => n + r.dager, 0);
  const venter = rader.filter((r) => r.venter > 0);
  const mndNavn = MND[mnd - 1];

  return (
    <>
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
