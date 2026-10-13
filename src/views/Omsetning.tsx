import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { MND } from "../lib/ferie";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";
const mkr = (n: number) => (n / 1e6).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MNOK";
const pst = (a: number, b: number) => (b ? Math.round((a / b - 1) * 100) : 0);

/** Omsetning i inneværende måned fra Visma (hovedbok), mot samme måned i fjor og mot målet. Bare leder. */
export function Omsetning() {
  const { d, idag, kjor } = useApp();
  const [endrer, setEndrer] = useState(false);
  const [nytt, setNytt] = useState("");
  const rader = d.omsetning ?? [];
  if (!rader.length) return null;

  const aar = Number(idag.slice(0, 4)), mnd = Number(idag.slice(5, 7)), dag = Number(idag.slice(8, 10));
  const dager = new Date(aar, mnd, 0).getDate();
  const verdi = (a: number, m: number) => rader.find((r) => r.aar === a && r.mnd === m)?.belop ?? 0;
  const iAar = Array.from({ length: 12 }, (_, i) => verdi(aar, i + 1));
  const iFjor = Array.from({ length: 12 }, (_, i) => verdi(aar - 1, i + 1));
  const denne = iAar[mnd - 1]!, fjorMnd = iFjor[mnd - 1]!;
  const fjorAar = iFjor.reduce((a, b) => a + b, 0);
  // Månedsmål: årsmålet fordelt etter fjorårets sesongmønster (ellers en tolvdel)
  const aarsmaal = d.maalOmsetning ?? null;
  const andel = fjorAar ? fjorMnd / fjorAar : 1 / 12;
  const maal = aarsmaal ? aarsmaal * andel : null;
  const tempo = dag / dager; // hvor langt vi er kommet i måneden
  const forventet = fjorMnd * tempo;
  // Hittil i år: fullførte måneder + denne
  const hittil = iAar.slice(0, mnd).reduce((a, b) => a + b, 0);
  const fjorHittilFull = iFjor.slice(0, mnd - 1).reduce((a, b) => a + b, 0);
  const hittilFull = iAar.slice(0, mnd - 1).reduce((a, b) => a + b, 0);
  const maks = Math.max(...iAar, ...iFjor, 1);
  const oppdatert = rader.reduce((s, r) => (r.oppdatert > s ? r.oppdatert : s), "");
  const navn = MND[mnd - 1]!;

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(nytt.replace(/[\s.]/g, "").replace(",", "."));
    if (await kjor(() => api.settOmsetningsmaal(n > 0 ? n : null), n > 0 ? `Omsetningsmål ${aar}: ${kr(n)}` : "Omsetningsmålet er fjernet")) setEndrer(false);
  };

  return (
    <section className="panel omsetning">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Omsetning {navn} {aar}</h2>
        <span className="small muted">Fra Visma{oppdatert ? ` · oppdatert ${new Date(oppdatert).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      </div>

      <div className="oms-topp">
        <div className="oms-hoved">
          <div className="label">Hittil i {navn} (dag {dag} av {dager})</div>
          <div className="oms-tall">{kr(denne)}</div>
          {fjorMnd > 0 && (
            <div className={`oms-endring ${denne >= forventet ? "opp" : "ned"}`}>
              {denne >= forventet ? "▲" : "▼"} {Math.abs(pst(denne, forventet))} % mot samme tempo i fjor
              <span className="muted"> ({kr(forventet)} på dag {dag})</span>
            </div>
          )}
        </div>
        <div className="oms-sammen">
          <div><span className="label">{navn[0]!.toUpperCase() + navn.slice(1)} i fjor</span><b>{kr(fjorMnd)}</b></div>
          {maal != null && <div><span className="label">Mål for {navn}</span><b>{kr(maal)}</b></div>}
          <div><span className="label">Hittil i år</span><b>{mkr(hittil)}</b></div>
        </div>
      </div>

      {(maal ?? fjorMnd) > 0 && (
        <div className="oms-bar" aria-label="Framdrift i måneden">
          <span className="fyll" style={{ width: `${Math.min(100, (denne / (maal ?? fjorMnd)) * 100)}%` }} />
          <span className="tempo" style={{ left: `${tempo * 100}%` }} title="Så langt er vi kommet i måneden" />
          <span className="tekst">{Math.round((denne / (maal ?? fjorMnd)) * 100)} % av {maal != null ? "målet" : "fjorårets måned"}</span>
        </div>
      )}

      {mnd > 1 && fjorHittilFull > 0 && (
        <p className="small">
          Januar–{MND[mnd - 2]}: <b>{mkr(hittilFull)}</b> mot {mkr(fjorHittilFull)} i fjor
          {" "}<span className={hittilFull >= fjorHittilFull ? "oms-opp" : "oms-ned"}>({hittilFull >= fjorHittilFull ? "+" : ""}{pst(hittilFull, fjorHittilFull)} %)</span>
          {aarsmaal ? <> · årsmål {mkr(aarsmaal)}, {Math.round((hittil / aarsmaal) * 100)} % nådd</> : null}
        </p>
      )}

      <div className="oms-mnd" aria-label="Omsetning per måned, i år og i fjor">
        {iAar.map((v, i) => (
          <div key={i} className={`oms-kol${i + 1 === mnd ? " naa" : ""}`} title={`${MND[i]}: ${kr(v)} (i fjor ${kr(iFjor[i]!)})`}>
            <div className="oms-par">
              <i className="fjor" style={{ height: `${(iFjor[i]! / maks) * 100}%` }} />
              <i className="iaar" style={{ height: `${(v / maks) * 100}%` }} />
            </div>
            <span>{MND[i]!.slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <div className="cal-legend"><span><i className="dot oms-dot-iaar" />{aar}</span><span><i className="dot oms-dot-fjor" />{aar - 1}</span></div>

      {endrer ? (
        <form className="row" onSubmit={lagre}>
          <label className="field"><span className="label">Omsetningsmål {aar} (kr, eks. mva)</span>
            <input type="text" inputMode="numeric" value={nytt} onChange={(e) => setNytt(e.target.value)} placeholder={fjorAar ? `I fjor: ${Math.round(fjorAar).toLocaleString("nb-NO")}` : "F.eks. 28 000 000"} autoFocus /></label>
          <div className="row"><button className="btn primary">Lagre</button><button type="button" className="btn" onClick={() => setEndrer(false)}>Avbryt</button></div>
        </form>
      ) : (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small muted">Salgsinntekter (konto 3000–3999) eks. mva. Fakturaer som ikke er bokført ennå kommer med når de bokføres.</span>
          <button className="btn sm" onClick={() => { setNytt(aarsmaal ? String(aarsmaal) : ""); setEndrer(true); }}>{aarsmaal ? "Endre mål" : "Sett omsetningsmål"}</button>
        </div>
      )}
    </section>
  );
}
