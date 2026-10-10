import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { MND } from "../lib/ferie";
import { fakturertPerMnd, t2 } from "../lib/timer";
import { fakturertVismaPerMnd, ikkeFakturert, fastprisBeregning } from "../lib/faktura";

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
  const harVisma = (d.fakturerteTimer ?? []).some((x) => x.fakturadato?.startsWith(`${aar}-`));
  const [kilde, setKilde] = useState<"visma" | "registrert">(harVisma ? "visma" : "registrert");
  const visma = kilde === "visma";
  const arbeid = fakturertVismaPerMnd(d.fakturerteTimer ?? [], aar);
  const fast = fastprisBeregning(d, aar);
  const registrert = fakturertPerMnd(d.timer, aar);
  // Fakturert = Arbeid i Visma + beregnede timer på fastprisjobber
  const per = visma ? arbeid.map((n, i) => Math.round((n + fast.perMnd[i]) * 10) / 10) : registrert;
  const sumTil = (x: number[]) => x.slice(0, mnd).reduce((a, b) => a + b, 0);
  const regHittil = sumTil(registrert), faktHittil = sumTil(arbeid) + sumTil(fast.perMnd);
  const aapent = ikkeFakturert(d.fakturerteTimer ?? []);
  const hittil = per.slice(0, mnd).reduce((a, b) => a + b, 0);
  const denne = per[mnd - 1];
  const maks = Math.max(maal, ...per);
  return (
    <section className="panel maal">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>{visma ? "Fakturerte timer" : "Fakturerbare timer"} {aar}</h2>
        {harVisma && (
          <div className="filter" role="group" aria-label="Hva som telles">
            <button type="button" className="btn sm" aria-pressed={visma} onClick={() => setKilde("visma")}>Fakturert i Visma</button>
            <button type="button" className="btn sm" aria-pressed={!visma} onClick={() => setKilde("registrert")}>Registrert fakturerbart</button>
          </div>
        )}
      </div>
      <div className="legend">
        <div><span className="label">{MND[mnd - 1]}</span><span className="v" style={denne < maal ? { color: "var(--warn)" } : undefined}>{t2(Math.round(denne))} / {t2(Math.round(maal))}</span></div>
        <div><span className="label">Hittil i år</span><span className="v">{t2(Math.round(hittil))} / {t2(Math.round(maal * mnd))} <span className="small">({Math.round((hittil / (maal * mnd || 1)) * 100)} %)</span></span></div>
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
      <div className="maal-mnd" role="img" aria-label={visma ? "Fakturerte timer per måned" : "Fakturerbare timer per måned"}>
        {per.map((n, i) => (
          <div key={i} className={i < mnd && n < maal ? "under" : ""} style={{ height: `${(n / maks) * 100}%`, opacity: i < mnd ? 1 : 0.35 }}
            title={visma && fast.perMnd[i] ? `${MND[i]}: ${t2(n)} t (${t2(arbeid[i])} Arbeid + ${t2(fast.perMnd[i])} fastpris)` : `${MND[i]}: ${t2(n)} t`}>
            {visma && fast.perMnd[i] > 0 && n > 0 && <span className="fastdel" style={{ height: `${(fast.perMnd[i] / n) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="maal-akse">{MND.map((m) => <span key={m}>{m.slice(0, 3)}</span>)}</div>
      {harVisma && (
        <div className="legend">
          <div><span className="label">Arbeid fakturert</span><span className="v">{t2(Math.round(sumTil(arbeid)))}</span></div>
          <div><span className="label">Fastpris, beregnet</span><span className="v">{t2(Math.round(sumTil(fast.perMnd)))}</span>
            <span className="small muted">{fast.prosjekter.length ? `${fast.prosjekter.length} prosjekter à ${t2(fast.pris)} kr/t` : "Ingen prosjekter merket fastpris"}</span></div>
          <div><span className="label">Registrert fakturerbart</span><span className="v">{t2(Math.round(regHittil))}</span></div>
          <div><span className="label">Fakturert av registrert</span><span className="v">{Math.round((faktHittil / (regHittil || 1)) * 100)} %</span></div>
          <div><span className="label">På åpne ordrer</span><span className="v">{t2(Math.round(aapent))}</span></div>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        {visma ? "Teller «Arbeid» fakturert i Visma (etter fakturadato), pluss beregnede timer på fastprisjobber: fakturert kunden minus kostpris på materialene på N L-ordrene, delt på timeprisen. Den lyse delen av søylen er fastpris." : "Teller timer ført på prosjekt og merket fakturerbart i ByggLogg."}{" "}
        Grønt = nådd målet på {t2(Math.round(maal))} t, gult = under.</p>
    </section>
  );
}
