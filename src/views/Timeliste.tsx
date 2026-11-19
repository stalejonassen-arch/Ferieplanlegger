// Timeliste for leder: alle timene til én ansatt for en uke eller måned på ett sted.
// Endre, legge til og slette føringer, godkjenne perioden, og overstyre lønnsgrunnlaget for en dag (med begrunnelse).
import { useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { addDays, helligdag, kortDato, sorterAnsatte } from "../lib/ferie";
import { hhmm, lonnsdager, mandag, t2, ukenr, varighet, type Dag, type Time } from "../lib/timer";
import { ProsjektVelger } from "./ProsjektVelger";

const DAG = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const ukedag = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const tall = (s: string) => { const n = Number(s.replace(",", ".").trim()); return s.trim() === "" || Number.isNaN(n) ? null : n; };

type Skjema = { id?: string; dato: string; fra: string; til: string; prosjekt_id: string; lunsj: boolean; fakturerbar: boolean; km: string; reisetid: string; beskrivelse: string };
type Over = { dato: string; normal: string; ot50: string; ot100: string; lunsjtrekk: string; grunn: string };

export function Timeliste({ startAnsatt }: { startAnsatt?: string }) {
  const { d, meg, idag, kjor } = useApp();
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  const [hvemId, setHvemId] = useState(startAnsatt ?? ansatte.find((a) => a.id !== meg.id)?.id ?? meg.id);
  const [periode, setPeriode] = useState<"uke" | "mnd">("uke");
  const [start, setStart] = useState(() => mandag(idag));
  const [skjema, setSkjema] = useState<Skjema | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const hvem = d.ansatte.find((a) => a.id === hvemId) ?? meg;

  // Periode: uke (man–søn) eller kalendermåned
  const fra = periode === "uke" ? mandag(start) : `${start.slice(0, 7)}-01`;
  const til = periode === "uke" ? addDays(fra, 6) : addDays(`${addDays(`${start.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  const flytt = (n: number) => setStart(periode === "uke" ? addDays(fra, 7 * n) : (() => { const [y, m] = fra.split("-").map(Number); const x = new Date(Date.UTC(y!, m! - 1 + n, 1)); return x.toISOString().slice(0, 10); })());
  const dager = useMemo(() => { const ut: string[] = []; for (let x = fra; x <= til; x = addDays(x, 1)) ut.push(x); return ut; }, [fra, til]);

  const timer = d.timer.filter((t) => t.ansatt_id === hvem.id && t.dato >= fra && t.dato <= til);
  const lonn = useMemo(() => lonnsdager(hvem, d.timer, fra, til, d.overstyringer ?? []), [hvem, d.timer, fra, til, d.overstyringer]);
  const dagLonn = (dato: string): Dag | undefined => lonn.find((x) => x.dato === dato);
  const sum = (k: "timer" | "normal" | "ot50" | "ot100" | "lunsjtrekk" | "km" | "reisetid") => lonn.reduce((n, x) => n + x[k], 0);
  const ikkeGodkjent = timer.filter((t) => t.status !== "godkjent").map((t) => t.id);
  const overstyrte = lonn.filter((x) => x.overstyrt).length;

  const prosjektNavn = (id: string | null) => {
    if (!id) return "Internt arbeid";
    const p = d.prosjekter.find((x) => x.id === id);
    return p ? `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}` : "Ukjent prosjekt";
  };

  const nyFor = (dato: string): Skjema => {
    const sist = timer.filter((t) => t.dato === dato).map((t) => hhmm(t.til)).sort().pop();
    return { dato, fra: sist ?? "07:00", til: sist && sist > "15:30" ? sist : "15:30", prosjekt_id: "", lunsj: !!hvem.lunsjtrekk, fakturerbar: true, km: "", reisetid: "", beskrivelse: "" };
  };
  const endre = (t: Time) => setSkjema({ id: t.id, dato: t.dato, fra: hhmm(t.fra), til: hhmm(t.til), prosjekt_id: t.prosjekt_id ?? "", lunsj: t.lunsj_min > 0, fakturerbar: t.fakturerbar !== false,
    km: t.km ? String(t.km) : "", reisetid: t.reisetid ? String(t.reisetid) : "", beskrivelse: t.beskrivelse });

  const lunsjMin = (s: Skjema) => (s.lunsj ? (hvem.lunsj_min ?? 30) : 0);
  const lengde = skjema && skjema.fra && skjema.til ? varighet(skjema.fra, skjema.til, lunsjMin(skjema)) : 0;
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skjema || lengde <= 0) return;
    const ok = await kjor(() => api.lagreTime({
      id: skjema.id, ansatt_id: hvem.id, prosjekt_id: skjema.prosjekt_id || null, dato: skjema.dato, fra: skjema.fra, til: skjema.til, lunsj_min: lunsjMin(skjema),
      km: tall(skjema.km) ?? 0, reisetid: tall(skjema.reisetid) ?? 0, beskrivelse: skjema.beskrivelse.trim(), fakturerbar: !!skjema.prosjekt_id && skjema.fakturerbar,
    }), skjema.id ? "Timene er endret" : `${t2(lengde)} t ført for ${hvem.navn.split(" ")[0]}`);
    if (ok) setSkjema(null);
  };

  const startOver = (dato: string) => {
    const l = dagLonn(dato);
    const o = (d.overstyringer ?? []).find((x) => x.ansatt_id === hvem.id && x.dato === dato);
    const v = (n: number | null | undefined, std: number) => t2(n ?? std).replace(/\s/g, "");
    setOver({ dato, normal: v(o?.normal, l?.normal ?? 0), ot50: v(o?.ot50, l?.ot50 ?? 0), ot100: v(o?.ot100, l?.ot100 ?? 0), lunsjtrekk: v(o?.lunsjtrekk, l?.lunsjtrekk ?? 0), grunn: o?.grunn ?? "" });
  };
  const lagreOver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!over || !over.grunn.trim()) return;
    const ok = await kjor(() => api.lagreOverstyring({ ansatt_id: hvem.id, dato: over.dato, normal: tall(over.normal), ot50: tall(over.ot50), ot100: tall(over.ot100), lunsjtrekk: tall(over.lunsjtrekk), grunn: over.grunn.trim() }),
      `Lønnsgrunnlaget for ${kortDato(over.dato)} er overstyrt`);
    if (ok) setOver(null);
  };

  const tittel = periode === "uke" ? `Uke ${ukenr(fra)} · ${kortDato(fra)} – ${kortDato(til)}` : new Date(`${fra}T12:00:00Z`).toLocaleDateString("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="panel timeliste" id="timeliste">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Timeliste – rediger og overstyr</h2>
        <div className="row">
          <select aria-label="Ansatt" value={hvem.id} onChange={(e) => { setHvemId(e.target.value); setSkjema(null); setOver(null); }}>
            {ansatte.map((a) => <option key={a.id} value={a.id}>{a.id === meg.id ? `${a.navn} (meg)` : a.navn}</option>)}
          </select>
          <div className="filter">
            <button className="btn sm" aria-pressed={periode === "uke"} onClick={() => setPeriode("uke")}>Uke</button>
            <button className="btn sm" aria-pressed={periode === "mnd"} onClick={() => setPeriode("mnd")}>Måned</button>
          </div>
        </div>
      </div>
      <div className="cal-nav">
        <button className="btn sm" aria-label="Forrige" onClick={() => flytt(-1)}>‹</button>
        <b>{periode === "mnd" ? tittel.charAt(0).toUpperCase() + tittel.slice(1) : tittel}</b>
        <button className="btn sm" aria-label="Neste" onClick={() => flytt(1)}>›</button>
        {(fra > idag || til < idag) && <button className="linkbtn small" onClick={() => setStart(mandag(idag))}>I dag</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Alle føringene til {hvem.navn.split(" ")[0]} i perioden. Du kan endre, legge til og slette – også godkjente timer og timer fra Svenn.
        Stemmer ikke normaltid, overtid eller lunsjtrekk for en dag, trykk «Overstyr» og skriv hvorfor. Føringene står da urørt, men lønnsgrunnlaget bruker tallene dine.
      </p>

      <div className="legend">
        <div><span className="label">Timer</span><span className="v">{t2(sum("timer") - sum("lunsjtrekk"))}</span></div>
        <div><span className="label">Normaltid</span><span className="v">{t2(sum("normal"))}</span></div>
        <div><span className="label">Overtid 50 %</span><span className="v">{t2(sum("ot50"))}</span></div>
        <div><span className="label">Overtid 100 %</span><span className="v">{t2(sum("ot100"))}</span></div>
        {sum("lunsjtrekk") > 0 && <div><span className="label">Lunsjtrekk</span><span className="v">{t2(sum("lunsjtrekk"))}</span></div>}
        {sum("km") > 0 && <div><span className="label">Km</span><span className="v">{t2(sum("km"))}</span></div>}
      </div>
      {overstyrte > 0 && <p className="small" style={{ margin: 0 }}><span className="chip venter">{overstyrte} {overstyrte === 1 ? "dag er overstyrt" : "dager er overstyrt"}</span></p>}

      <div className="timeliste-dager">
        {dager.map((dato) => {
          const rader = timer.filter((t) => t.dato === dato).sort((a, b) => a.fra.localeCompare(b.fra));
          const l = dagLonn(dato);
          const hd = helligdag(dato);
          const helg = ukedag(dato) % 6 === 0;
          if (!rader.length && !l && (helg || hd) && skjema?.dato !== dato) return null;
          return (
            <div key={dato} className={`tl-dag${helg || hd ? " helg" : ""}${dato === idag ? " idag" : ""}`}>
              <div className="tl-hode">
                <b>{DAG[ukedag(dato)]} {kortDato(dato)}</b>{hd && <span className="small muted"> · {hd}</span>}
                {l ? (
                  <span className="tl-lonn small">
                    {l.normal > 0 && <span>{t2(l.normal)} t normal</span>}
                    {l.ot50 > 0 && <span>{t2(l.ot50)} t 50 %</span>}
                    {l.ot100 > 0 && <span>{t2(l.ot100)} t 100 %</span>}
                    {l.lunsjtrekk > 0 && <span className={l.lunsjavvik ? "advar" : ""}>−{t2(l.lunsjtrekk)} lunsj</span>}
                  </span>
                ) : !helg && !hd && dato <= idag ? <span className="small" style={{ color: "var(--warn)" }}>Ingen timer</span> : null}
                <span className="tl-knapper">
                  <button className="btn sm" onClick={() => { setOver(null); setSkjema(nyFor(dato)); }}>+ Før</button>
                  {(l || rader.length > 0) && <button className="btn sm" onClick={() => { setSkjema(null); startOver(dato); }}>{l?.overstyrt ? "Endre overstyring" : "Overstyr"}</button>}
                </span>
              </div>
              {l?.overstyrt && (
                <div className="small tl-overstyrt">
                  <span className="chip venter">Overstyrt</span> {l.overstyrt.grunn}
                  <span className="muted"> · regnet ut: {t2(l.overstyrt.beregnet.normal)} t normal / {t2(l.overstyrt.beregnet.ot50)} t 50 % / {t2(l.overstyrt.beregnet.ot100)} t 100 % / {t2(l.overstyrt.beregnet.lunsjtrekk)} lunsj</span>
                  {" "}<button className="linkbtn small" onClick={() => kjor(() => api.slettOverstyring(hvem.id, dato), "Overstyringen er fjernet")}>Fjern</button>
                </div>
              )}
              {rader.map((t) => (
                <div key={t.id} className={`item ${t.status === "godkjent" ? "godkjent" : "venter"}`}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{hhmm(t.fra)}–{hhmm(t.til)} · {t2(t.timer)} t <span className="muted" style={{ fontWeight: 400 }}>· {prosjektNavn(t.prosjekt_id)}</span></div>
                    <div className="s">{[t.prosjekt_id && t.fakturerbar === false ? "ikke fakturerbart" : "", t.lunsj_min ? `lunsj ${t.lunsj_min} min` : "", t.km ? `${t2(t.km)} km` : "", t.reisetid ? `reise ${t2(t.reisetid)} t` : "", t.beskrivelse].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="acts">
                    {t.kilde === "manuell" && <span className="chip demo" title="Ført i etterkant">Ført etterpå</span>}
                    {t.kilde === "endret" && <span className="chip demo" title="Stemplet, men rettet etterpå">Rettet</span>}
                    {t.kilde === "svenn" && <span className="chip demo">Fra Svenn</span>}
                    <span className={`chip ${t.status === "godkjent" ? "godkjent" : "venter"}`}>{t.status === "godkjent" ? "Godkjent" : "Levert"}</span>
                    <button className="btn sm" onClick={() => { setOver(null); endre(t); }}>Endre</button>
                    <button className="btn sm no" onClick={() => window.confirm(`Slette ${hhmm(t.fra)}–${hhmm(t.til)} ${kortDato(t.dato)} for ${hvem.navn}?`) && kjor(() => api.slettTime(t.id), "Slettet")}>Slett</button>
                  </div>
                </div>
              ))}

              {skjema && skjema.dato === dato && (
                <form className="tl-skjema" onSubmit={lagre}>
                  <div className="row">
                    <label className="field kort"><span className="label">Dato</span><input type="date" value={skjema.dato} onChange={(e) => setSkjema({ ...skjema, dato: e.target.value || skjema.dato })} required /></label>
                    <label className="field kort"><span className="label">Fra</span><input type="time" step={900} value={skjema.fra} onChange={(e) => setSkjema({ ...skjema, fra: e.target.value })} required /></label>
                    <label className="field kort"><span className="label">Til</span><input type="time" step={900} value={skjema.til} onChange={(e) => setSkjema({ ...skjema, til: e.target.value })} required /></label>
                  </div>
                  <ProsjektVelger value={skjema.prosjekt_id} onChange={(id) => setSkjema({ ...skjema, prosjekt_id: id })}
                    prosjekter={d.prosjekter.filter((p) => p.aktiv || p.id === skjema.prosjekt_id)} tom="Internt arbeid (butikk, lager, verksted)" />
                  <div className="row" style={{ gap: "6px 16px" }}>
                    {skjema.prosjekt_id && <label className="row small"><input type="checkbox" checked={skjema.fakturerbar} onChange={(e) => setSkjema({ ...skjema, fakturerbar: e.target.checked })} /> Fakturerbart</label>}
                    <label className="row small"><input type="checkbox" checked={skjema.lunsj} onChange={(e) => setSkjema({ ...skjema, lunsj: e.target.checked })} /> Lunsj ({hvem.lunsj_min ?? 30} min)</label>
                  </div>
                  <div className="row">
                    <label className="field kort"><span className="label">Km</span><input inputMode="decimal" value={skjema.km} onChange={(e) => setSkjema({ ...skjema, km: e.target.value })} placeholder="0" /></label>
                    <label className="field kort"><span className="label">Reisetid (t)</span><input inputMode="decimal" value={skjema.reisetid} onChange={(e) => setSkjema({ ...skjema, reisetid: e.target.value })} placeholder="0" /></label>
                    <label className="field" style={{ flex: "2 1 200px" }}><span className="label">Hva ble gjort</span><input value={skjema.beskrivelse} onChange={(e) => setSkjema({ ...skjema, beskrivelse: e.target.value })} /></label>
                  </div>
                  <div className="row">
                    <button className="btn primary" disabled={lengde <= 0}>{skjema.id ? "Lagre endring" : "Før timene"}{lengde > 0 ? ` · ${t2(lengde)} t` : ""}</button>
                    <button type="button" className="btn" onClick={() => setSkjema(null)}>Avbryt</button>
                    {lengde <= 0 && <span className="small" style={{ color: "var(--warn)" }}>Sluttid må være etter starttid.</span>}
                  </div>
                </form>
              )}

              {over && over.dato === dato && (
                <form className="tl-skjema" onSubmit={lagreOver}>
                  <div className="small muted">Overstyr lønnsgrunnlaget for {DAG[ukedag(dato)]} {kortDato(dato)} (timer). Tomt felt = bruk det som er regnet ut.</div>
                  <div className="row">
                    <label className="field kort"><span className="label">Normaltid</span><input inputMode="decimal" value={over.normal} onChange={(e) => setOver({ ...over, normal: e.target.value })} /></label>
                    <label className="field kort"><span className="label">Overtid 50 %</span><input inputMode="decimal" value={over.ot50} onChange={(e) => setOver({ ...over, ot50: e.target.value })} /></label>
                    <label className="field kort"><span className="label">Overtid 100 %</span><input inputMode="decimal" value={over.ot100} onChange={(e) => setOver({ ...over, ot100: e.target.value })} /></label>
                    <label className="field kort"><span className="label">Lunsjtrekk</span><input inputMode="decimal" value={over.lunsjtrekk} onChange={(e) => setOver({ ...over, lunsjtrekk: e.target.value })} /></label>
                  </div>
                  <label className="field"><span className="label">Hvorfor (vises for den ansatte)</span>
                    <input value={over.grunn} onChange={(e) => setOver({ ...over, grunn: e.target.value })} placeholder="F.eks. avtalt utrykning – betales som 100 %" maxLength={300} required autoFocus /></label>
                  <div className="row">
                    <button className="btn primary" disabled={!over.grunn.trim()}>Lagre overstyring</button>
                    <button type="button" className="btn" onClick={() => setOver(null)}>Avbryt</button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {timer.length > 0 && (
        <div className="row">
          {ikkeGodkjent.length
            ? <button className="btn ok" onClick={() => kjor(() => api.settTimestatus(ikkeGodkjent, "godkjent"), `Godkjent for ${hvem.navn}`)}>Godkjenn {periode === "uke" ? "uka" : "måneden"} ({ikkeGodkjent.length})</button>
            : <button className="btn" onClick={() => kjor(() => api.settTimestatus(timer.map((t) => t.id), "levert"), "Åpnet for endring")}>Åpne for endring</button>}
          <span className="small muted">{t2(sum("timer") - sum("lunsjtrekk"))} t · {timer.length} føringer</span>
        </div>
      )}
    </section>
  );
}

