// Materialliste på prosjektet, delt opp i leveranser i den rekkefølgen de skal komme.
// Leder og prosjektleder bygger listen (eller henter den fra varene i Visma); alle kan hake av det som er kommet.
import { useState } from "react";
import { useApp } from "../App";
import { api, nobbLenke } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { LEVERANSE_STATUS, grupperMateriell, nyeFraVisma, type Leveranse, type LeveranseStatus, type Materiale, type NyLeveranse } from "../lib/plan";
import { t2, type Prosjekt } from "../lib/timer";
import { usePlanlegger } from "./Plan";

const STATUS_CHIP: Record<LeveranseStatus, string> = { planlagt: "demo", bestilt: "venter", levert: "godkjent" };
const tall = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;

function LeveranseSkjema({ start, ferdig }: { start: NyLeveranse; ferdig: () => void }) {
  const { kjor } = useApp();
  const [f, setF] = useState(start);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.navn.trim()) return;
    if (await kjor(() => api.lagreLeveranse(f), f.id ? "Leveransen er endret" : "Leveransen er lagt til")) ferdig();
  };
  const slett = async () => { if (f.id && await kjor(() => api.slettLeveranse(f.id!), "Leveransen er slettet. Linjene ligger igjen uten leveranse.")) ferdig(); };
  return (
    <form onSubmit={lagre} style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Leveranse</span>
          <input id="leveranse-navn" value={f.navn} onChange={(e) => setF({ ...f, navn: e.target.value })} placeholder="F.eks. Bjelkelag, Kledning og vinduer, Innredning" maxLength={200} required /></label>
        <label className="field kort"><span className="label">Skal komme</span>
          <input id="leveranse-dato" type="date" value={f.dato ?? ""} onChange={(e) => setF({ ...f, dato: e.target.value || null })} /></label>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <label className="field"><span className="label">Leverandør (valgfritt)</span>
          <input id="leveranse-leverandor" value={f.leverandor} onChange={(e) => setF({ ...f, leverandor: e.target.value })} placeholder="Eget lager, leverandør …" /></label>
        <label className="field"><span className="label">Merknad (valgfritt)</span>
          <input id="leveranse-notat" value={f.notat} onChange={(e) => setF({ ...f, notat: e.target.value })} placeholder="F.eks. kran på bilen, ring kunden før levering" /></label>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!f.navn.trim()}>{f.id ? "Lagre" : "Legg til leveranse"}</button>
        <button type="button" className="btn" onClick={ferdig}>Avbryt</button>
        {f.id && <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={slett}>Slett leveranse</button>}
      </div>
    </form>
  );
}

/** Legg til én linje i en leveranse */
function NyLinje({ p, leveranse, neste }: { p: Prosjekt; leveranse: string | null; neste: number }) {
  const { kjor } = useApp();
  const [f, setF] = useState({ beskrivelse: "", antall: "", enhet: "stk", nobb: "" });
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.beskrivelse.trim()) return;
    const ok = await kjor(() => api.lagreMaterialer([{ prosjekt_id: p.id, leveranse_id: leveranse, beskrivelse: f.beskrivelse, antall: tall(f.antall), enhet: f.enhet, nobb_nr: f.nobb.trim(), varenr: f.nobb.trim(), rekkefolge: neste }]));
    if (ok) setF({ beskrivelse: "", antall: "", enhet: f.enhet, nobb: "" });
  };
  return (
    <form onSubmit={lagre} className="row mat-ny" style={{ gap: 6, alignItems: "end" }}>
      <label className="field" style={{ flex: "3 1 200px" }}><span className="label">Vare</span>
        <input value={f.beskrivelse} onChange={(e) => setF({ ...f, beskrivelse: e.target.value })} placeholder="F.eks. Konstruksjonsvirke 48x198" maxLength={300} /></label>
      <label className="field" style={{ flex: "0 1 80px" }}><span className="label">Antall</span>
        <input inputMode="decimal" value={f.antall} onChange={(e) => setF({ ...f, antall: e.target.value })} /></label>
      <label className="field" style={{ flex: "0 1 80px" }}><span className="label">Enhet</span>
        <input value={f.enhet} onChange={(e) => setF({ ...f, enhet: e.target.value })} list="enheter" /></label>
      <label className="field" style={{ flex: "0 1 110px" }}><span className="label">NOBB (valgfritt)</span>
        <input inputMode="numeric" value={f.nobb} onChange={(e) => setF({ ...f, nobb: e.target.value })} /></label>
      <button className="btn" disabled={!f.beskrivelse.trim()}>Legg til</button>
    </form>
  );
}

/** Materiallisten på prosjektet */
export function Materialliste({ p }: { p: Prosjekt }) {
  const { d, kjor } = useApp();
  const planlegger = usePlanlegger();
  const lev = (d.leveranser ?? []).filter((l) => l.prosjekt_id === p.id);
  const mat = (d.materialer ?? []).filter((m) => m.prosjekt_id === p.id);
  const grupper = grupperMateriell(lev, mat);
  const [skjema, setSkjema] = useState<NyLeveranse | null>(null);
  const [aapen, setAapen] = useState<string | null>(null);
  const [henter, setHenter] = useState(false);
  const kommet = mat.filter((m) => m.levert).length;
  const rekke = grupper.map((g) => g.leveranse).filter((l): l is Leveranse => !!l);
  /** Flytter en leveranse ett steg opp eller ned, og nummererer alle på nytt */
  const flytt = (i: number, retning: -1 | 1) => kjor(async () => {
    const ny = [...rekke];
    [ny[i], ny[i + retning]] = [ny[i + retning]!, ny[i]!];
    for (const [n, l] of ny.entries()) if (l.rekkefolge !== n + 1) await api.lagreLeveranse({ ...l, rekkefolge: n + 1 });
  });

  const hentFraVisma = async () => {
    setHenter(true);
    try {
      const { varer } = await api.fdv(p.id);
      const nye = nyeFraVisma(varer.filter((v) => !v.skjul), mat);
      if (!nye.length) { await kjor(async () => {}, "Ingen nye varer fra Visma på prosjektet."); return; }
      await kjor(() => api.lagreMaterialer(nye.map((v, i) => ({ prosjekt_id: p.id, leveranse_id: null, beskrivelse: v.beskrivelse || v.varenr, antall: v.antall, enhet: v.enhet.toLowerCase(), varenr: v.varenr, nobb_nr: v.nobb_nr, rekkefolge: 1000 + i }))),
        `${nye.length} varer hentet fra Visma. Fordel dem på leveransene.`);
    } finally { setHenter(false); }
  };

  const linjer = (liste: Materiale[], l: Leveranse | null) => (
    <ul className="mat-liste">
      {liste.map((m) => (
        <li key={m.id} className={m.levert ? "levert" : ""}>
          <label className="mat-hake">
            <input type="checkbox" checked={m.levert} aria-label={`${m.beskrivelse} er kommet`}
              onChange={(e) => kjor(() => api.settMaterialeLevert(m.id, e.target.checked))} />
            <span className="mat-navn">{m.beskrivelse}</span>
          </label>
          <span className="mat-antall">{m.antall ? `${t2(m.antall)} ${m.enhet}` : m.enhet}</span>
          {m.nobb_nr && <a className="small" href={nobbLenke(m.nobb_nr)} target="_blank" rel="noopener">NOBB</a>}
          {planlegger && (
            <span className="mat-verktoy">
              <select aria-label={`Flytt ${m.beskrivelse} til leveranse`} value={m.leveranse_id ?? ""}
                onChange={(e) => kjor(() => api.flyttMaterialer([m.id], e.target.value || null))}>
                <option value="">Uten leveranse</option>
                {grupper.filter((g) => g.leveranse).map((g, i) => <option key={g.leveranse!.id} value={g.leveranse!.id}>{i + 1}. {g.leveranse!.navn}</option>)}
              </select>
              <button className="linkbtn small" onClick={() => kjor(() => api.slettMateriale(m.id), "Linjen er fjernet")}>Fjern</button>
            </span>
          )}
        </li>
      ))}
      {!liste.length && <li className="small muted">Ingen varer i denne leveransen ennå.</li>}
      {planlegger && aapen === (l?.id ?? "uten") && <li style={{ display: "block" }}><NyLinje p={p} leveranse={l?.id ?? null} neste={liste.length} /></li>}
    </ul>
  );

  return (
    <section className="panel">
      <datalist id="enheter">{["stk", "m", "lm", "m2", "m3", "pk", "rull", "sekk", "spann", "kg", "liter"].map((e) => <option key={e} value={e} />)}</datalist>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Materialliste</h2>
        {mat.length > 0 && <span className="small muted">{kommet} av {mat.length} varer er kommet</span>}
      </div>
      {!grupper.length && !skjema && (
        <p className="muted small" style={{ margin: 0 }}>{planlegger ? "Del materiellet opp i leveranser i den rekkefølgen det trengs på byggeplassen, og legg varene inn under hver leveranse." : "Det er ikke lagt inn noen materialliste på prosjektet ennå."}</p>
      )}
      {grupper.map((g, i) => {
        const l = g.leveranse;
        if (l && skjema?.id === l.id) return <div key={l.id} className="leveranse"><LeveranseSkjema start={skjema} ferdig={() => setSkjema(null)} /></div>;
        const alleKommet = g.linjer.length > 0 && g.linjer.every((m) => m.levert);
        return (
          <div key={l?.id ?? "uten"} className={`leveranse${l?.status === "levert" ? " levert" : ""}`}>
            <div className="leveranse-topp">
              <span className="leveranse-nr">{l ? i + 1 : "–"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{l ? l.navn : "Uten leveranse"}</b>
                {l && <div className="small muted">{[l.dato ? `Skal komme ${kortDato(l.dato)}` : "Ingen dato", l.leverandor, l.notat].filter(Boolean).join(" · ")}</div>}
              </div>
              {l && planlegger && (
                <span className="row" style={{ gap: 2 }}>
                  <button className="btn sm" aria-label={`Flytt ${l.navn} opp`} disabled={i === 0} onClick={() => flytt(i, -1)}>↑</button>
                  <button className="btn sm" aria-label={`Flytt ${l.navn} ned`} disabled={i >= rekke.length - 1} onClick={() => flytt(i, 1)}>↓</button>
                </span>
              )}
              {l && (planlegger ? (
                <select aria-label={`Status for ${l.navn}`} value={l.status} onChange={(e) => kjor(() => api.settLeveranseStatus(l.id, e.target.value as LeveranseStatus))}>
                  {(Object.keys(LEVERANSE_STATUS) as LeveranseStatus[]).map((s) => <option key={s} value={s}>{LEVERANSE_STATUS[s]}</option>)}
                </select>
              ) : (
                l.status === "levert" ? <span className="chip godkjent">Levert</span>
                  : <button className="btn sm" onClick={() => kjor(() => api.settLeveranseStatus(l.id, "levert"), "Meldt som levert")}>Meld levert</button>
              ))}
              {l && !planlegger && l.status !== "levert" && <span className={`chip ${STATUS_CHIP[l.status]}`}>{LEVERANSE_STATUS[l.status]}</span>}
            </div>
            {linjer(g.linjer, l)}
            {planlegger && (
              <div className="row" style={{ gap: 6 }}>
                {aapen !== (l?.id ?? "uten") && <button className="btn sm" onClick={() => setAapen(l?.id ?? "uten")}>+ Vare</button>}
                {l && <button className="btn sm" onClick={() => setSkjema({ ...l })}>Endre leveranse</button>}
                {l && !alleKommet && g.linjer.length > 0 && l.status === "levert" && (
                  <button className="btn sm" onClick={() => kjor(async () => { for (const m of g.linjer) if (!m.levert) await api.settMaterialeLevert(m.id, true); }, "Alle varene er haket av")}>Hak av alle</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {planlegger && (skjema && !skjema.id
        ? <LeveranseSkjema start={skjema} ferdig={() => setSkjema(null)} />
        : !skjema && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={() => setSkjema({ prosjekt_id: p.id, navn: "", dato: null, leverandor: "", notat: "", rekkefolge: lev.length ? Math.max(...lev.map((x) => x.rekkefolge)) + 1 : 1 })}>+ Ny leveranse</button>
            <button className="btn" disabled={henter} onClick={hentFraVisma}>{henter ? "Henter …" : "Hent varer fra Visma"}</button>
          </div>
        ))}
    </section>
  );
}

/** For butikk og prosjektleder: leveranser som skal ut de neste ukene, på tvers av prosjektene. */
export function Leveranseoversikt() {
  const { d, kjor, idag } = useApp();
  const [alle, setAlle] = useState(false);
  const liste = (d.leveranser ?? [])
    .filter((l) => l.status !== "levert" && (alle || !l.dato || l.dato <= addDager(idag, 21)))
    .sort((a, b) => (a.dato ?? "9999").localeCompare(b.dato ?? "9999") || a.rekkefolge - b.rekkefolge);
  const prosjekt = (id: string) => d.prosjekter.find((p) => p.id === id);
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Leveranser som skal ut</h2>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> Vis alle, ikke bare de neste tre ukene</label>
      </div>
      {liste.length ? (
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Dato</th><th>Prosjekt</th><th>Leveranse</th><th>Varer</th><th>Status</th></tr></thead>
            <tbody>
              {liste.map((l) => {
                const p = prosjekt(l.prosjekt_id);
                const varer = (d.materialer ?? []).filter((m) => m.leveranse_id === l.id);
                const sen = l.dato && l.dato < idag;
                return (
                  <tr key={l.id}>
                    <td className={sen ? "feil" : ""}>{l.dato ? kortDato(l.dato) : "–"}{sen ? " (passert)" : ""}</td>
                    <td>{p ? `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}` : "–"}{p?.adresse ? <div className="small muted">{p.adresse}</div> : null}</td>
                    <td>{l.navn}{l.leverandor ? <div className="small muted">{l.leverandor}</div> : null}</td>
                    <td className="small">{varer.length ? varer.slice(0, 4).map((m) => `${m.antall ? `${t2(m.antall)} ${m.enhet} ` : ""}${m.beskrivelse}`).join(", ") + (varer.length > 4 ? ` og ${varer.length - 4} til` : "") : "–"}</td>
                    <td>
                      <select aria-label={`Status for ${l.navn}`} value={l.status} onChange={(e) => kjor(() => api.settLeveranseStatus(l.id, e.target.value as LeveranseStatus))}>
                        {(Object.keys(LEVERANSE_STATUS) as LeveranseStatus[]).map((s) => <option key={s} value={s}>{LEVERANSE_STATUS[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>Ingen leveranser som venter{alle ? "" : " de neste tre ukene"}.</p>}
    </section>
  );
}

const addDager = (iso: string, n: number) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
