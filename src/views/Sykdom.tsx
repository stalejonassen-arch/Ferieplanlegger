import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, langDato, sorterAnsatte } from "../lib/ferie";
import { arbeidsgiverperiode, egenmeldinger, FRAVAER_TYPE, kalenderdager, syktBarnDager, type FravaerType } from "../lib/fravaer";

/** Egenmelding, sykt barn og sykmelding. Den ansatte ser bare sitt eget, leder ser alle. */
export function Sykdom() {
  const { d, meg, leder, idag, kjor } = useApp();
  const regler = d.egenmelding ?? { maksDager: 3, maksGanger: 4 };
  const [hvemId, setHvemId] = useState(meg.id);
  const hvem = d.ansatte.find((a) => a.id === hvemId) ?? meg;
  const meSelv = hvem.id === meg.id;
  const [f, setF] = useState({ type: "egenmelding" as FravaerType, fra: idag, til: idag, grad: "100", merknad: "" });
  const lengde = f.fra && f.til && f.til >= f.fra ? kalenderdager(f.fra, f.til) : 0;
  const em = egenmeldinger(d.fravaer, hvem.id, idag);
  const aar = Number(idag.slice(0, 4));
  const barn = syktBarnDager(d.fravaer, hvem.id, aar);
  const agp = arbeidsgiverperiode(d.fravaer, hvem.id);
  const egne = d.fravaer.filter((x) => x.ansatt_id === hvem.id);
  const forLang = f.type === "egenmelding" && lengde > regler.maksDager && !leder;
  const kanSlette = (opprettet: string) => leder || Date.now() - Date.parse(opprettet) < 14 * 864e5;

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lengde || forLang) return;
    const ok = await kjor(() => api.lagreFravaer({ ansatt_id: hvem.id, type: f.type, fra: f.fra, til: f.til, grad: f.type === "sykmelding" ? Number(f.grad) || 100 : 100, merknad: f.merknad.trim() }),
      `${FRAVAER_TYPE[f.type]} registrert${meSelv ? ". God bedring!" : ""}`);
    if (ok) setF({ ...f, merknad: "" });
  };

  return (
    <>
      {leder && (
        <div className="row">
          <label className="label" htmlFor="syk-for">Viser for</label>
          <select id="syk-for" value={hvemId} onChange={(e) => setHvemId(e.target.value)}>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.id === meg.id ? `${a.navn} (meg)` : a.navn}</option>)}
          </select>
        </div>
      )}
      <div className="grid2">
        <form className="panel" onSubmit={lagre}>
          <h2 style={{ margin: 0 }}>{meSelv ? "Meld fravær" : `Meld fravær for ${hvem.navn}`}</h2>
          <div className="hurtig" role="radiogroup" aria-label="Type fravær">
            {(Object.keys(FRAVAER_TYPE) as FravaerType[]).map((t) => (
              <button type="button" key={t} role="radio" aria-checked={f.type === t} aria-pressed={f.type === t} onClick={() => setF({ ...f, type: t })}>{FRAVAER_TYPE[t]}</button>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {f.type === "egenmelding" && `Når du selv er syk. Høyst ${regler.maksDager} kalenderdager om gangen og ${regler.maksGanger} ganger på 12 måneder. Lengre fravær krever sykmelding fra lege.`}
            {f.type === "sykt_barn" && "Når barnet ditt er sykt og du må være hjemme. Rett på 10 dager i året (15 med mer enn to barn, dobbelt for alenemor/-far)."}
            {f.type === "sykmelding" && "Når legen har sykmeldt deg. Legg inn perioden og graden som står på sykmeldingen."}
          </p>
          <div className="row">
            <label className="field"><span className="label">Fra og med</span>
              <input type="date" value={f.fra} onChange={(e) => setF({ ...f, fra: e.target.value, til: f.til < e.target.value ? e.target.value : f.til })} required /></label>
            <label className="field"><span className="label">Til og med</span>
              <input type="date" value={f.til} min={f.fra} onChange={(e) => setF({ ...f, til: e.target.value })} required /></label>
            {f.type === "sykmelding" && (
              <label className="field kort"><span className="label">Grad %</span>
                <input type="number" min={1} max={100} step={10} value={f.grad} onChange={(e) => setF({ ...f, grad: e.target.value })} /></label>
            )}
          </div>
          <label className="field"><span className="label">Merknad (valgfritt)</span>
            <input type="text" value={f.merknad} onChange={(e) => setF({ ...f, merknad: e.target.value })} placeholder="F.eks. tilbake mandag" /></label>
          <p className="small muted" style={{ margin: 0 }}>Ikke skriv hva du er syk av – det har ikke arbeidsgiver krav på å vite.</p>
          {forLang && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>Egenmelding kan gjelde høyst {regler.maksDager} dager. Lengre fravær krever sykmelding fra lege.</p>}
          {f.type === "egenmelding" && em.ganger >= regler.maksGanger && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>Du har brukt egenmelding {em.ganger} ganger de siste 12 månedene. Snakk med leder – det kan kreves sykmelding.</p>}
          <div><button className="btn primary" disabled={!lengde || forLang}>Registrer {FRAVAER_TYPE[f.type].toLowerCase()}{lengde ? ` · ${lengde} ${lengde === 1 ? "dag" : "dager"}` : ""}</button></div>
        </form>

        <section className="panel">
          <h2 style={{ margin: 0 }}>{meSelv ? "Ditt fravær" : hvem.navn}</h2>
          <div className="legend">
            <div><span className="label">Egenmelding</span><span className="v" style={em.ganger >= regler.maksGanger ? { color: "var(--warn)" } : undefined}>{em.ganger} / {regler.maksGanger}</span></div>
            <div><span className="label">Dager, 12 mnd</span><span className="v">{em.dager}</span></div>
            <div><span className="label">Sykt barn {aar}</span><span className="v">{barn} / 10</span></div>
          </div>
          {agp && leder && agp.til >= kortTilbake(idag) && (
            <p className="small" style={{ margin: 0 }}>
              <b>Arbeidsgiverperioden</b> (fravær fra {kortDato(agp.fra)}): {agp.dager} av 16 dager brukt.
              {agp.navFra ? ` NAV betaler sykepenger fra ${langDato(agp.navFra)}. Husk inntektsmelding til NAV.` : " Arbeidsgiver betaler."}
            </p>
          )}
          {egne.length === 0 ? <p className="small muted">Ingen fravær registrert.</p> : (
            <div className="list">
              {egne.map((x) => (
                <div key={x.id} className={`item ${x.type === "sykmelding" ? "avslatt" : "venter"}`}>
                  <div>
                    <div className="t">{FRAVAER_TYPE[x.type]}{x.type === "sykmelding" && x.grad < 100 ? ` ${x.grad} %` : ""} · {x.fra === x.til ? langDato(x.fra) : `${kortDato(x.fra)} – ${langDato(x.til)}`}</div>
                    <div className="s">{kalenderdager(x.fra, x.til)} {kalenderdager(x.fra, x.til) === 1 ? "dag" : "dager"}{x.merknad ? ` · ${x.merknad}` : ""}</div>
                  </div>
                  <div className="acts">
                    {kanSlette(x.opprettet) && <button className="btn sm no" onClick={() => window.confirm("Slette registreringen?") && kjor(() => api.slettFravaer(x.id), "Slettet")}>Slett</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {leder && <FravaerOversikt />}
    </>
  );
}

/** Siste 60 dager – for å vise arbeidsgiverperioden bare når fraværet er ferskt */
const kortTilbake = (idag: string) => { const t = new Date(idag + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - 60); return t.toISOString().slice(0, 10); };

/** Leder: alle ansatte – hvem som er borte nå, egenmeldinger og sykt barn. */
function FravaerOversikt() {
  const { d, idag } = useApp();
  const regler = d.egenmelding ?? { maksDager: 3, maksGanger: 4 };
  const aar = Number(idag.slice(0, 4));
  const borteNaa = d.fravaer.filter((x) => x.fra <= idag && x.til >= idag);
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Fravær – oversikt</h2>
      {borteNaa.length > 0 && <p className="small" style={{ margin: 0 }}><b>Borte i dag:</b> {borteNaa.map((x) => `${d.ansatte.find((a) => a.id === x.ansatt_id)?.navn} (${FRAVAER_TYPE[x.type].toLowerCase()} til ${kortDato(x.til)})`).join(", ")}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="tbl"><thead><tr><th>Ansatt</th><th>Egenmelding 12 mnd</th><th>Sykt barn {aar}</th><th>Sykmeldt {aar}</th></tr></thead><tbody>
          {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => {
            const em = egenmeldinger(d.fravaer, a.id, idag);
            const syk = d.fravaer.filter((x) => x.ansatt_id === a.id && x.type === "sykmelding" && x.til.startsWith(`${aar}`)).reduce((n, x) => n + kalenderdager(x.fra, x.til), 0);
            return (
              <tr key={a.id}><td>{a.navn}</td>
                <td style={em.ganger >= regler.maksGanger ? { color: "var(--warn)" } : undefined}>{em.ganger ? `${em.ganger} ganger · ${em.dager} d` : ""}</td>
                <td>{syktBarnDager(d.fravaer, a.id, aar) || ""}</td>
                <td>{syk ? `${syk} d` : ""}</td></tr>
            );
          })}
        </tbody></table>
      </div>
    </section>
  );
}
