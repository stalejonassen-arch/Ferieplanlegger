import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { MND } from "../lib/ferie";
import { fakturertPerMnd, t2 } from "../lib/timer";

/** Fakturerte timer per måned mot målet. Leder setter målet for året; månedsmålet er en tolvdel. */
export function Maal() {
  const { d, idag, leder, kjor } = useApp();
  const aar = Number(idag.slice(0, 4)), mnd = Number(idag.slice(5, 7));
  const aarsmaal = d.maal ?? 6000;
  const maal = aarsmaal / 12;
  const [endrer, setEndrer] = useState(false);
  const [nytt, setNytt] = useState("");
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(nytt.replace(/\s/g, "").replace(",", "."));
    if (await kjor(() => api.settMaal(n), `Nytt mål: ${t2(n)} timer i året`)) setEndrer(false);
  };
  const per = fakturertPerMnd(d.timer, aar);
  const hittil = per.slice(0, mnd).reduce((a, b) => a + b, 0);
  const denne = per[mnd - 1];
  const maks = Math.max(maal, ...per);
  return (
    <section className="panel maal">
      <h2 style={{ margin: 0 }}>Fakturerbare timer {aar}</h2>
      <div className="legend">
        <div><span className="label">{MND[mnd - 1]}</span><span className="v" style={denne < maal ? { color: "var(--warn)" } : undefined}>{t2(denne)} / {t2(maal)}</span></div>
        <div><span className="label">Hittil i år</span><span className="v">{t2(hittil)} / {t2(maal * mnd)}</span></div>
        <div><span className="label">Mål for året</span><span className="v">{t2(aarsmaal)}</span>
          {leder && !endrer && <button className="btn sm" style={{ marginTop: 4 }} onClick={() => { setNytt(String(aarsmaal)); setEndrer(true); }}>Endre mål</button>}</div>
      </div>
      {endrer && (
        <form className="row" onSubmit={lagre}>
          <label className="field" style={{ margin: 0 }}><span className="label">Fakturerte timer i året</span>
            <input inputMode="numeric" value={nytt} onChange={(e) => setNytt(e.target.value)} autoFocus style={{ width: 120 }} /></label>
          <span className="small muted">= {t2((Number(nytt.replace(/\s/g, "").replace(",", ".")) || 0) / 12)} i måneden</span>
          <button className="btn primary sm" disabled={!(Number(nytt.replace(/\s/g, "").replace(",", ".")) > 0)}>Lagre</button>
          <button type="button" className="btn sm" onClick={() => setEndrer(false)}>Avbryt</button>
        </form>
      )}
      <div className="maal-mnd" role="img" aria-label="Fakturerbare timer per måned">
        {per.map((n, i) => <div key={i} className={i < mnd && n < maal ? "under" : ""} style={{ height: `${(n / maks) * 100}%`, opacity: i < mnd ? 1 : 0.35 }} title={`${MND[i]}: ${t2(n)} t`} />)}
      </div>
      <div className="maal-akse">{MND.map((m) => <span key={m}>{m.slice(0, 3)}</span>)}</div>
      <p className="small muted" style={{ margin: 0 }}>Teller timer ført på prosjekt og merket fakturerbart i ByggLogg. Grønt = nådd målet på {t2(maal)} t, gult = under.</p>
    </section>
  );
}
