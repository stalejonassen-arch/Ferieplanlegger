import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { sorterAnsatte, type Ansatt } from "../lib/ferie";

export function Oppsett() {
  const { d, aar, kjor } = useApp();
  const [nyNavn, setNyNavn] = useState("");
  const [nyEpost, setNyEpost] = useState("");
  const [nyAvd, setNyAvd] = useState(d.avdelinger[0]?.id ?? 0);

  const lagre = (a: Ansatt, endring: Partial<Ansatt>) =>
    kjor(() => api.lagreAnsatt({ id: a.id, navn: a.navn, avdeling_id: a.avdeling_id, ...endring }), "Lagret");
  const overfort = (a: Ansatt) => d.ferieaar.find((f) => f.ansatt_id === a.id && f.aar === aar)?.overfort ?? 0;

  const leggTil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nyNavn.trim()) return;
    const ok = await kjor(() => api.lagreAnsatt({ navn: nyNavn.trim(), epost: nyEpost.trim() || null, avdeling_id: nyAvd, rekkefolge: 99 }), `${nyNavn.trim()} er lagt til`);
    if (ok) { setNyNavn(""); setNyEpost(""); }
  };

  return (
    <>
      <section className="panel">
        <h2>Ansatte</h2>
        <p className="small muted">Endringer lagres når du går ut av feltet. E-posten er den ansatte bruker for å logge inn. «Dager» er feriedager per år regnet mandag–fredag: 25 er 5 uker, 21 er lovens minimum. «Overført» er ferie avtalt flyttet fra {aar - 1} til {aar}.</p>
        <div className="staff">
          <div className="staff-row staff-head">
            <span>Navn</span><span>E-post</span><span>Avdeling</span><span>Rolle</span><span>Dager</span><span>Overført {aar}</span><span>Over 60</span><span>Aktiv</span>
          </div>
          {sorterAnsatte(d).map((a) => (
            <div key={`${a.id}-${a.navn}-${a.epost}-${overfort(a)}`} className={`staff-row${a.aktiv ? "" : " inaktiv"}`}>
              <span className="lbl" data-l="Navn">
                <input type="text" id={`navn-${a.id}`} aria-label="Navn" defaultValue={a.navn}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.navn) lagre(a, { navn: v }); }} />
              </span>
              <span className="lbl" data-l="E-post">
                <input type="email" id={`epost-${a.id}`} aria-label="E-post" defaultValue={a.epost ?? ""} placeholder="Mangler – kan ikke logge inn"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.epost ?? "")) lagre(a, { epost: v || null }); }} />
              </span>
              <span className="lbl" data-l="Avdeling">
                <select id={`avd-${a.id}`} aria-label="Avdeling" value={a.avdeling_id} onChange={(e) => lagre(a, { avdeling_id: Number(e.target.value) })}>
                  {d.avdelinger.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
                </select>
              </span>
              <span className="lbl" data-l="Rolle">
                <select id={`rolle-${a.id}`} aria-label="Rolle" value={a.rolle} onChange={(e) => lagre(a, { rolle: e.target.value as Ansatt["rolle"] })}>
                  <option value="ansatt">Ansatt</option><option value="leder">Leder</option>
                </select>
              </span>
              <span className="lbl" data-l="Dager">
                <select id={`dager-${a.id}`} aria-label="Feriedager" value={a.dager} onChange={(e) => lagre(a, { dager: Number(e.target.value) })}>
                  <option value={21}>21</option><option value={25}>25</option>
                </select>
              </span>
              <span className="lbl" data-l={`Overført ${aar}`}>
                <input type="number" id={`overfort-${a.id}`} aria-label={`Overført til ${aar}`} min={0} max={60} defaultValue={overfort(a)}
                  onBlur={(e) => { const v = Math.max(0, Math.min(60, Number(e.target.value) || 0)); if (v !== overfort(a)) kjor(() => api.lagreOverfort(a.id, aar, v), "Lagret"); }} />
              </span>
              <span className="lbl" data-l="Over 60">
                <input type="checkbox" id={`over60-${a.id}`} aria-label="Over 60 år" checked={a.over60} onChange={(e) => lagre(a, { over60: e.target.checked })} />
              </span>
              <span className="lbl" data-l="Aktiv">
                <input type="checkbox" id={`aktiv-${a.id}`} aria-label="Aktiv" checked={a.aktiv} onChange={(e) => lagre(a, { aktiv: e.target.checked })} />
              </span>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={leggTil} style={{ alignItems: "flex-end" }}>
          <label className="field"><span className="label">Ny ansatt</span>
            <input type="text" id="ny-navn" value={nyNavn} onChange={(e) => setNyNavn(e.target.value)} placeholder="Navn" />
          </label>
          <label className="field"><span className="label">E-post</span>
            <input type="email" id="ny-epost" value={nyEpost} onChange={(e) => setNyEpost(e.target.value)} placeholder="navn@austnes.no" />
          </label>
          <label className="field"><span className="label">Avdeling</span>
            <select id="ny-avd" value={nyAvd} onChange={(e) => setNyAvd(Number(e.target.value))}>
              {d.avdelinger.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
            </select>
          </label>
          <button className="btn" disabled={!nyNavn.trim()}>Legg til</button>
        </form>
        <p className="small muted">Ansatte som slutter, setter du til ikke aktiv. Da forsvinner de fra kalenderen og mister tilgang, men historikken beholdes.</p>
      </section>

      <section className="panel">
        <h2>Bemanning</h2>
        <p className="small muted">Hvor mange i hver avdeling som kan være borte samme dag før appen varsler.</p>
        <div className="row">
          {d.avdelinger.map((g) => (
            <label key={`${g.id}-${g.maks_borte}`} className="field"><span className="label">{g.navn}</span>
              <input type="number" id={`maks-${g.id}`} min={0} max={50} defaultValue={g.maks_borte}
                onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== g.maks_borte) kjor(() => api.lagreAvdeling({ id: g.id, maks_borte: v }), "Lagret"); }} />
            </label>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Arbeidstid og lunsj</h2>
        <p className="small muted">Brukes i lønnsgrunnlaget. Overtid regnes når uka går over normaltiden. Ansatte med lunsjtrekk får lunsj trukket på dager over 5,5 timer der lunsj ikke er registrert.</p>
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Ansatt</th><th>Normaltid per uke</th><th>Lunsjtrekk</th><th>Lunsj (min)</th></tr></thead>
            <tbody>
              {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => (
                <tr key={`${a.id}-${a.normaltid_uke}-${a.lunsjtrekk}-${a.lunsj_min}`}>
                  <td>{a.navn}</td>
                  <td><select aria-label={`Normaltid ${a.navn}`} value={String(a.normaltid_uke ?? 37.5)} onChange={(e) => lagre(a, { normaltid_uke: Number(e.target.value) })}>
                    <option value="37.5">37,5 timer</option><option value="40">40 timer</option></select></td>
                  <td><input type="checkbox" aria-label={`Lunsjtrekk ${a.navn}`} checked={!!a.lunsjtrekk} onChange={(e) => lagre(a, { lunsjtrekk: e.target.checked })} /></td>
                  <td><input type="number" aria-label={`Lunsj minutter ${a.navn}`} min={0} max={120} step={5} style={{ width: 80 }} defaultValue={a.lunsj_min ?? 30}
                    onBlur={(e) => { const v = Math.max(0, Math.min(120, Number(e.target.value) || 0)); if (v !== (a.lunsj_min ?? 30)) lagre(a, { lunsj_min: v }); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
