import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { kvarter, LUNSJGRENSE, sisteProsjekter } from "../lib/timer";

const timerSiden = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 3600000);

/** Logg inn når arbeidet begynner, bytt når du flytter deg, logg ut når prosjektet eller dagen er ferdig. */
export function Stempling() {
  const { d, meg, idag, kjor } = useApp();
  const s = d.stempling.find((x) => x.ansatt_id === meg.id);
  const siste = sisteProsjekter(d.timer, meg.id).filter((id) => d.prosjekter.some((p) => p.id === id && p.aktiv));
  const [prosjekt, setProsjekt] = useState<string>(() => siste[0] ?? "");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [til, setTil] = useState("");
  const [venter, setVenter] = useState(false);
  const [, tikk] = useState(0);
  useEffect(() => { const i = setInterval(() => tikk((n) => n + 1), 20000); return () => clearInterval(i); }, []);

  const navn = (id: string | null) => {
    if (!id) return "Internt arbeid";
    const p = d.prosjekter.find((x) => x.id === id);
    return p ? `${p.visma_nr ? p.visma_nr + " · " : ""}${p.navn}` : "Ukjent prosjekt";
  };
  const aktive = d.prosjekter.filter((p) => p.aktiv);

  // Lunsj: foreslås når dagen blir over 5,5 timer og lunsj ikke er ført i dag
  const iDag = d.timer.filter((t) => t.ansatt_id === meg.id && t.dato === idag);
  const dagTimer = iDag.reduce((n, t) => n + Number(t.timer), 0) + (s && s.dato === idag ? timerSiden(s.startet) : 0);
  const lunsjFort = iDag.some((t) => t.lunsj_min > 0);
  const [lunsj, setLunsj] = useState(false);
  useEffect(() => { setLunsj(!!meg.lunsjtrekk && dagTimer > LUNSJGRENSE && !lunsjFort); }, [s?.startet, lunsjFort]); // eslint-disable-line react-hooks/exhaustive-deps
  const lunsjMin = lunsj ? (meg.lunsj_min ?? 30) : 0;

  const gammel = s && s.dato < idag;
  const kjorStempel = async (handling: "inn" | "bytt" | "ut", melding: string) => {
    setVenter(true);
    const ok = await kjor(() => api.stemple(handling, { prosjekt: prosjekt || null, beskrivelse, lunsj: handling === "inn" ? 0 : lunsjMin, til: gammel ? til : undefined }), melding);
    setVenter(false);
    if (ok) { setBeskrivelse(""); setTil(""); }
  };

  const velger = (
    <>
      {siste.length > 0 && (
        <div className="hurtig" aria-label="Siste prosjekter">
          {siste.map((id) => { const p = d.prosjekter.find((x) => x.id === id)!; return (
            <button type="button" key={id} aria-pressed={prosjekt === id} onClick={() => setProsjekt(id)} title={navn(id)}>{p.visma_nr ? `${p.visma_nr} ` : ""}{p.navn}</button>
          ); })}
          <button type="button" aria-pressed={prosjekt === ""} onClick={() => setProsjekt("")}>Internt</button>
        </div>
      )}
      <select value={prosjekt} onChange={(e) => setProsjekt(e.target.value)} aria-label="Prosjekt">
        <option value="">Internt arbeid (butikk, lager, verksted)</option>
        {aktive.map((p) => <option key={p.id} value={p.id}>{navn(p.id)}</option>)}
      </select>
    </>
  );

  if (!s) {
    return (
      <section className="stempel" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Logg inn på jobb</h2>
          <div className="klokke">{kvarter(new Date())}</div>
          <div className="small muted" style={{ marginTop: 4 }}>Tida rundes til nærmeste kvarter.</div>
        </div>
        {velger}
        <button className="btn primary stor" disabled={venter} onClick={() => kjorStempel("inn", `Logget inn på ${navn(prosjekt || null)}`)}>
          Logg inn nå · {prosjekt ? d.prosjekter.find((p) => p.id === prosjekt)?.navn : "internt"}
        </button>
      </section>
    );
  }

  const timer = timerSiden(s.startet);
  return (
    <section className="stempel inne" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div>
        <div className="label">Logget inn {gammel ? kortDato(s.dato) + " " : ""}kl. {s.fra}</div>
        {!gammel && <div className="klokke">{Math.floor(timer)}<small>t</small> {String(Math.floor((timer % 1) * 60)).padStart(2, "0")}<small>min</small></div>}
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{navn(s.prosjekt_id)}</div>
        {gammel && <p className="small" style={{ color: "var(--warn)", margin: "4px 0 0" }}>Du ble ikke logget ut {kortDato(s.dato)}. Skriv inn når du sluttet, så lagres dagen.</p>}
        {!gammel && timer > 10 && <p className="small" style={{ color: "var(--warn)", margin: "4px 0 0" }}>Du har vært logget inn i over 10 timer. Glemt å logge ut?</p>}
      </div>
      {gammel && (
        <label className="field kort" style={{ maxWidth: 180 }}><span className="label">Sluttet kl.</span>
          <input type="time" step={900} value={til} onChange={(e) => setTil(e.target.value)} /></label>
      )}
      <label className="field"><span className="label">Hva ble gjort</span>
        <input type="text" value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} placeholder="F.eks. montert vinduer 2. etasje" /></label>
      {meg.lunsjtrekk && (
        <label className="row small"><input type="checkbox" checked={lunsj} onChange={(e) => setLunsj(e.target.checked)} /> Hadde lunsj ({meg.lunsj_min ?? 30} min trekkes){lunsjFort ? " – lunsj er alt ført i dag" : ""}</label>
      )}
      <div className="row">
        <button className="btn primary stor" style={{ flex: 1 }} disabled={venter || (gammel && !til)} onClick={() => kjorStempel("ut", "Logget ut – timene er lagret")}>Logg ut – dagen er ferdig</button>
      </div>
      <details>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Ferdig her – bytt til et annet prosjekt</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {velger}
          <button className="btn" disabled={venter || (gammel && !til) || prosjekt === (s.prosjekt_id ?? "")} onClick={() => kjorStempel("bytt", `Byttet til ${navn(prosjekt || null)}`)}>
            Bytt til {prosjekt ? d.prosjekter.find((p) => p.id === prosjekt)?.navn : "internt"}
          </button>
        </div>
      </details>
    </section>
  );
}

/** Leder: hvem som er logget inn akkurat nå, og hvor. */
export function InneNaa() {
  const { d, meg, idag } = useApp();
  const andre = d.stempling.filter((x) => x.ansatt_id !== meg.id);
  const aktive = d.ansatte.filter((a) => a.aktiv && a.i_timerapport !== false);
  const ute = aktive.filter((a) => a.id !== meg.id && !d.stempling.some((x) => x.ansatt_id === a.id));
  const navn = (id: string | null) => (id ? d.prosjekter.find((p) => p.id === id)?.navn ?? "Ukjent prosjekt" : "Internt");
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Inne nå <span className="small muted">({andre.length})</span></h2>
      {andre.length === 0 ? <p className="small muted">Ingen er logget inn akkurat nå.</p> : (
        <div className="list">
          {andre.sort((a, b) => a.fra.localeCompare(b.fra)).map((x) => (
            <div key={x.ansatt_id} className="item godkjent">
              <div><div className="t">{d.ansatte.find((a) => a.id === x.ansatt_id)?.navn}</div>
                <div className="s">{navn(x.prosjekt_id)} · siden {x.dato !== idag ? kortDato(x.dato) + " " : ""}{x.fra}{x.dato !== idag ? " – ikke logget ut!" : ""}</div></div>
            </div>
          ))}
        </div>
      )}
      {ute.length > 0 && <p className="small muted" style={{ margin: 0 }}>Ikke logget inn: {ute.map((a) => a.navn.split(" ")[0]).join(", ")}</p>}
    </section>
  );
}
