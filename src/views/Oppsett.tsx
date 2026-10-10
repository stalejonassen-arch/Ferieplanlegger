import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { sorterAnsatte, type Ansatt } from "../lib/ferie";
import { kr } from "../lib/utstyr";

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
        <p className="small muted">Brukes i lønnsgrunnlaget. Overtid regnes når uka går over normaltiden. Ansatte med lunsjtrekk får lunsj trukket på dager over 5,5 timer der lunsj ikke er registrert. Ansattnr er det samme nummeret som i Svenn og følger med i lønnsfilene. «I timerapport» styrer hvem som telles i oversikten over kundetimer og interntid (snekkere og allround).</p>
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Ansatt</th><th>Ansattnr (Svenn)</th><th>Normaltid per uke</th><th>Lunsjtrekk</th><th>Lunsj (min)</th><th>I timerapport</th></tr></thead>
            <tbody>
              {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => (
                <tr key={`${a.id}-${a.normaltid_uke}-${a.lunsjtrekk}-${a.lunsj_min}-${a.i_timerapport}-${a.ansattnr}`}>
                  <td>{a.navn}</td>
                  <td><input type="text" inputMode="numeric" aria-label={`Ansattnr ${a.navn}`} style={{ width: 90 }} defaultValue={a.ansattnr ?? ""}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.ansattnr ?? "")) lagre(a, { ansattnr: v || null }); }} /></td>
                  <td><select aria-label={`Normaltid ${a.navn}`} value={String(a.normaltid_uke ?? 37.5)} onChange={(e) => lagre(a, { normaltid_uke: Number(e.target.value) })}>
                    <option value="37.5">37,5 timer</option><option value="40">40 timer</option></select></td>
                  <td><input type="checkbox" aria-label={`Lunsjtrekk ${a.navn}`} checked={!!a.lunsjtrekk} onChange={(e) => lagre(a, { lunsjtrekk: e.target.checked })} /></td>
                  <td><input type="number" aria-label={`Lunsj minutter ${a.navn}`} min={0} max={120} step={5} style={{ width: 80 }} defaultValue={a.lunsj_min ?? 30}
                    onBlur={(e) => { const v = Math.max(0, Math.min(120, Number(e.target.value) || 0)); if (v !== (a.lunsj_min ?? 30)) lagre(a, { lunsj_min: v }); }} /></td>
                  <td><input type="checkbox" aria-label={`I timerapport ${a.navn}`} checked={a.i_timerapport !== false} onChange={(e) => lagre(a, { i_timerapport: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <UtstyrOppsett lagre={lagre} />
    </>
  );
}

/** Utstyrskonto per ansatt (prosjektet i Visma der verktøy og arbeidstøy føres) og grenser per år */
function UtstyrOppsett({ lagre }: { lagre: (a: Ansatt, e: Partial<Ansatt>) => Promise<boolean> }) {
  const { d, kjor } = useApp();
  const g = d.utstyrGrenser ?? { arbeidstoy: null, verktoy: null, sammeMnd: 6 };
  const [at, setAt] = useState(String(g.arbeidstoy ?? ""));
  const [vt, setVt] = useState(String(g.verktoy ?? ""));
  const [mnd, setMnd] = useState(String(g.sammeMnd));
  const tall = (s: string) => Math.max(0, Number(s.replace(/\s/g, "").replace(",", ".")) || 0);
  const kontoer = d.prosjekter.filter((p) => /utstyr|verkt|arbeidskl|arbeidst/i.test(p.navn) || d.ansatte.some((a) => a.utstyr_prosjekt_id === p.id));
  return (
    <section className="panel">
      <h2>Utstyr: verktøy og arbeidstøy</h2>
      <p className="small muted">Hver ansatt har en utstyrskonto i Visma. Det som føres der, hentes inn i ByggLogg med dato og pris og sorteres som verktøy, arbeidstøy eller forbruk. Grensen gjelder per ansatt per kalenderår (utsalgspris eks. mva). La feltet stå tomt for ingen grense.</p>
      <form className="row" style={{ alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); kjor(() => api.settUtstyrGrenser(tall(at), tall(vt), Math.round(tall(mnd))), "Grensene er lagret"); }}>
        <label className="field kort"><span className="label">Arbeidstøy, kr per år</span><input inputMode="numeric" value={at} onChange={(e) => setAt(e.target.value)} placeholder="Ingen grense" /></label>
        <label className="field kort"><span className="label">Verktøy, kr per år</span><input inputMode="numeric" value={vt} onChange={(e) => setVt(e.target.value)} placeholder="Ingen grense" /></label>
        <label className="field kort"><span className="label">Varsle samme vare igjen innen (mnd)</span><input inputMode="numeric" value={mnd} onChange={(e) => setMnd(e.target.value)} /></label>
        <button className="btn">Lagre grenser</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>Nå: arbeidstøy {g.arbeidstoy ? kr(g.arbeidstoy) : "ingen grense"}, verktøy {g.verktoy ? kr(g.verktoy) : "ingen grense"}, varsel ved samme vare innen {g.sammeMnd} måneder.</p>
      <div className="scroll" style={{ border: 0 }}>
        <table className="tbl">
          <thead><tr><th>Ansatt</th><th>Utstyrskonto i Visma</th></tr></thead>
          <tbody>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => (
              <tr key={`${a.id}-${a.utstyr_prosjekt_id}`}>
                <td>{a.navn}</td>
                <td><select aria-label={`Utstyrskonto ${a.navn}`} value={a.utstyr_prosjekt_id ?? ""} onChange={(e) => lagre(a, { utstyr_prosjekt_id: e.target.value || null })}>
                  <option value="">Ingen</option>
                  {kontoer.map((p) => <option key={p.id} value={p.id} disabled={d.ansatte.some((x) => x.id !== a.id && x.utstyr_prosjekt_id === p.id)}>{p.visma_nr ? `${p.visma_nr} ` : ""}{p.navn}</option>)}
                </select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Mangler en konto i lista? Opprett prosjektet i Visma med «utstyr» eller «arbeidsklær» i navnet, så dukker det opp her innen et kvarter.</p>
    </section>
  );
}
