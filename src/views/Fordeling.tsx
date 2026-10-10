import { useState } from "react";
import { useApp } from "../App";
import { MND } from "../lib/ferie";
import { andelIntern, fordelingPerAnsatt, fordelingPerMnd, t2 } from "../lib/timer";

const FARGE = { fakturerbart: "var(--approved)", ikkeFakturerbart: "var(--pending)", intern: "var(--info)" };

/** Timer fra måned til måned: fakturerbart, ikke-fakturerbart prosjekt og interntid. Leder ser alle, ansatte seg selv. */
export function Fordeling() {
  const { d, meg, leder, idag } = useApp();
  const aar = Number(idag.slice(0, 4)), mndNr = Number(idag.slice(5, 7));
  const [hvem, setHvem] = useState<string>(leder ? "alle" : meg.id);
  const [valgt, setValgt] = useState(mndNr);
  // «Alle» = de som er med i timerapporten (snekkere og allround), ikke butikk, kjøkken og leder
  const iRapport = new Set(d.ansatte.filter((a) => a.i_timerapport !== false).map((a) => a.id));
  const filter = hvem === "alle" ? iRapport : new Set([hvem]);
  const per = fordelingPerMnd(d.timer, aar, filter);
  const maks = Math.max(1, ...per.map((m) => m.sum));
  const hittil = per.slice(0, mndNr).reduce((a, m) => ({ f: a.f + m.fakturerbart, i: a.i + m.ikkeFakturerbart, n: a.n + m.intern, s: a.s + m.sum }), { f: 0, i: 0, n: 0, s: 0 });
  const mnd = `${aar}-${String(valgt).padStart(2, "0")}`;
  const perAnsatt = leder && hvem === "alle" ? [...fordelingPerAnsatt(d.timer.filter((t) => iRapport.has(t.ansatt_id)), mnd)].map(([id, f]) => ({ navn: d.ansatte.find((a) => a.id === id)?.navn ?? "?", f,
    etterpa: d.timer.filter((t) => t.ansatt_id === id && t.dato.startsWith(`${mnd}-`) && t.kilde === "manuell").length })).sort((a, b) => b.f.intern - a.f.intern) : [];
  const m = per[valgt - 1];

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Kundetimer og interntid {aar}</h2>
        {leder && (
          <select value={hvem} onChange={(e) => setHvem(e.target.value)} aria-label="Hvem">
            <option value="alle">Snekkere og allround</option>
            {d.ansatte.filter((a) => a.aktiv && a.i_timerapport !== false).sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select>
        )}
      </div>
      <div className="legend">
        <div><span className="label">Hittil i år</span><span className="v">{t2(Math.round(hittil.s))} t</span></div>
        <div><span className="label"><span style={{ color: FARGE.fakturerbart }}>■</span> Fakturerbart</span><span className="v">{t2(Math.round(hittil.f))}</span></div>
        <div><span className="label"><span style={{ color: FARGE.ikkeFakturerbart }}>■</span> Prosjekt, ikke fakt.</span><span className="v">{t2(Math.round(hittil.i))}</span></div>
        <div><span className="label"><span style={{ color: FARGE.intern }}>■</span> Interntid</span><span className="v">{t2(Math.round(hittil.n))} · {hittil.s ? Math.round((hittil.n / hittil.s) * 100) : 0} %</span></div>
      </div>
      <div className="maal-mnd" role="img" aria-label="Timer per måned fordelt på fakturerbart, ikke fakturerbart og interntid" style={{ height: 110 }}>
        {per.map((x, i) => (
          <button key={i} onClick={() => setValgt(i + 1)} title={`${MND[i]}: ${t2(x.sum)} t, interntid ${t2(x.intern)} t`}
            style={{ height: `${(x.sum / maks) * 100}%`, minHeight: 2, display: "flex", flexDirection: "column-reverse", padding: 0, border: 0, cursor: "pointer", background: "var(--sunk)", outline: i + 1 === valgt ? "2px solid var(--fg)" : undefined, opacity: i < mndNr ? 1 : 0.35, borderRadius: "2px 2px 0 0", overflow: "hidden" }}>
            {(["fakturerbart", "ikkeFakturerbart", "intern"] as const).map((k) => x.sum ? <span key={k} style={{ display: "block", height: `${(x[k] / x.sum) * 100}%`, background: FARGE[k] }} /> : null)}
          </button>
        ))}
      </div>
      <div className="maal-akse">{MND.map((n) => <span key={n}>{n.slice(0, 3)}</span>)}</div>
      <p className="small" style={{ margin: 0 }}>
        <b>{MND[valgt - 1]}:</b> {t2(m.sum)} t totalt – {t2(m.fakturerbart)} fakturerbart, {t2(m.ikkeFakturerbart)} på prosjekt uten faktura, <b>{t2(m.intern)} interntid ({andelIntern(m)} %)</b>.
        {valgt > 1 && per[valgt - 2].sum > 0 && <span className="muted"> Interntid forrige måned: {t2(per[valgt - 2].intern)} t ({andelIntern(per[valgt - 2])} %).</span>}
      </p>
      {perAnsatt.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl"><thead><tr><th>{MND[valgt - 1]}</th><th>Fakturerbart</th><th>Ikke fakt.</th><th>Interntid</th><th>Andel intern</th><th title="Føringer som ikke ble logget inn/ut i sanntid">Ført etterpå</th></tr></thead><tbody>
            {perAnsatt.map(({ navn, f, etterpa }) => (
              <tr key={navn}><td>{navn}</td><td>{t2(f.fakturerbart)}</td><td>{t2(f.ikkeFakturerbart)}</td><td>{t2(f.intern)}</td>
                <td style={andelIntern(f) >= 50 ? { color: "var(--warn)" } : undefined}>{andelIntern(f)} %</td><td>{etterpa || ""}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>Trykk på en måned for detaljer. Interntid er timer uten prosjekt (butikk, lager, verksted). {leder ? "Hvem som telles med velger du under Oppsett → «I timerapport»." : ""}</p>
    </section>
  );
}
