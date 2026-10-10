import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { kvarter, LUNSJGRENSE, sisteProsjekter } from "../lib/timer";

const timerSiden = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 3600000);
const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hilsen = (t: number) => (t < 10 ? "God morgen" : t < 17 ? "Hei" : "God kveld");

/** Dagen lagt ut på en tommestokk fra 06 til 18: hver økt er en bit, den pågående vokser mens du er inne. */
function Dagstokk({ okter, navn }: { okter: { fra: string; til: string; prosjekt_id: string | null; pagar?: boolean }[]; navn: (id: string | null) => string }) {
  const start = Math.min(6 * 60, ...okter.map((o) => Math.floor(min(o.fra) / 60) * 60));
  const slutt = Math.max(18 * 60, ...okter.map((o) => Math.ceil(min(o.til) / 60) * 60));
  const pst = (m: number) => ((m - start) / (slutt - start)) * 100;
  const prosjekter = [...new Set(okter.map((o) => o.prosjekt_id ?? ""))];
  const timer = Array.from({ length: (slutt - start) / 60 + 1 }, (_, i) => start / 60 + i);
  return (
    <div className="dagstokk" role="img" aria-label={`Dagen: ${okter.map((o) => `${o.fra}–${o.til} ${navn(o.prosjekt_id)}`).join(", ") || "ingen økter ennå"}`}>
      <div className="stokk">
        {okter.map((o, i) => (
          <span key={i} className={`okt farge${prosjekter.indexOf(o.prosjekt_id ?? "") % 4}${o.pagar ? " pagar" : ""}`}
            style={{ left: `${pst(min(o.fra))}%`, width: `${Math.max(0.8, pst(min(o.til)) - pst(min(o.fra)))}%` }} title={`${o.fra}–${o.til} · ${navn(o.prosjekt_id)}`} />
        ))}
      </div>
      <div className="tall">{timer.map((t) => <span key={t} style={{ left: `${pst(t * 60)}%` }}>{t % 2 === 0 ? String(t).padStart(2, "0") : ""}</span>)}</div>
    </div>
  );
}

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
  const naa = new Date();
  const naaHHMM = `${String(naa.getHours()).padStart(2, "0")}:${String(naa.getMinutes()).padStart(2, "0")}`;
  const okter = [
    ...iDag.map((t) => ({ fra: t.fra.slice(0, 5), til: t.til.slice(0, 5), prosjekt_id: t.prosjekt_id })),
    ...(s && s.dato === idag ? [{ fra: s.fra, til: naaHHMM > s.fra ? naaHHMM : s.fra, prosjekt_id: s.prosjekt_id, pagar: true }] : []),
  ].sort((a, b) => a.fra.localeCompare(b.fra));
  const fornavn = meg.navn.split(" ")[0];
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
          <h2 style={{ margin: "0 0 4px" }}>{hilsen(naa.getHours())}, {fornavn}</h2>
          <div className="klokke">{kvarter(naa)}</div>
          <div className="small dempet" style={{ marginTop: 4 }}>Logger du inn nå, står du inne fra {kvarter(naa)}.</div>
        </div>
        {okter.length > 0 && <Dagstokk okter={okter} navn={navn} />}
        {velger}
        <button className="btn gul stor" disabled={venter} onClick={() => kjorStempel("inn", `Logget inn på ${navn(prosjekt || null)}`)}>
          Logg inn nå · {prosjekt ? d.prosjekter.find((p) => p.id === prosjekt)?.navn : "internt"}
        </button>
      </section>
    );
  }

  const timer = timerSiden(s.startet);
  // Kolleger på samme prosjekt (databasen viser andre bare når prosjektet er det samme)
  const kolleger = s.prosjekt_id ? d.stempling.filter((x) => x.ansatt_id !== meg.id && x.prosjekt_id === s.prosjekt_id).sort((a, b) => a.fra.localeCompare(b.fra)) : [];
  return (
    <section className="stempel inne" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div>
        <div className="small dempet">Logget inn {gammel ? kortDato(s.dato) + " " : ""}kl. {s.fra}</div>
        {!gammel && <div className="klokke">{Math.floor(timer)}<small>t</small> {String(Math.floor((timer % 1) * 60)).padStart(2, "0")}<small>min</small></div>}
        <div style={{ fontSize: 19, fontWeight: 700, marginTop: 6 }}>{navn(s.prosjekt_id)}</div>
        {kolleger.length > 0 && (
          <div className="kolleger">
            Også inne her: {kolleger.map((k, i) => <span key={k.ansatt_id}>{i > 0 ? ", " : ""}<b>{d.ansatte.find((a) => a.id === k.ansatt_id)?.navn.split(" ")[0] ?? "?"}</b> fra {k.fra}</span>)}
          </div>
        )}
        {!gammel && <Dagstokk okter={okter} navn={navn} />}
        {gammel && <p className="small varsel" style={{ margin: "8px 0 0" }}>Du ble ikke logget ut {kortDato(s.dato)}. Skriv inn når du sluttet, så lagres dagen.</p>}
        {!gammel && timer > 10 && <p className="small varsel" style={{ margin: "8px 0 0" }}>Du har vært logget inn i over 10 timer. Glemt å logge ut?</p>}
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
        <button className="btn gul stor" style={{ flex: 1 }} disabled={venter || (gammel && !til)} onClick={() => kjorStempel("ut", "Logget ut – timene er lagret")}>Logg ut – dagen er ferdig</button>
      </div>
      <details>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Ferdig her – bytt til et annet prosjekt</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {velger}
          <button className="btn lys" disabled={venter || (gammel && !til) || prosjekt === (s.prosjekt_id ?? "")} onClick={() => kjorStempel("bytt", `Byttet til ${navn(prosjekt || null)}`)}>
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
