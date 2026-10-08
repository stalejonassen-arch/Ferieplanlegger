import { useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { HOVEDFERIE, ferierett, harFeil, regelsjekk, saldo, sorterAnsatte } from "../lib/ferie";
import { Sjekkliste, SoknadRad } from "./felles";
import { lagIcs, lastNedIcs } from "../lib/ics";

export function MinFerie() {
  const { d, meg, leder, aar, idag, kjor } = useApp();
  const [forId, setForId] = useState(meg.id);
  const [fra, setFra] = useState("");
  const [til, setTil] = useState("");
  const [merknad, setMerknad] = useState("");
  const [sender, setSender] = useState(false);

  const hvem = d.ansatte.find((a) => a.id === forId) ?? meg;
  const meSelv = hvem.id === meg.id;
  const sd = saldo(hvem, aar, d);
  const rett = ferierett(hvem, aar, d.ferieaar);
  const sjekk = useMemo(() => (fra && til ? regelsjekk(d, hvem, fra, til, idag, { du: meSelv }) : []), [d, hvem, fra, til, idag, meSelv]);
  const kanSende = !!fra && !!til && !harFeil(sjekk) && !sender;
  const mine = d.soknader
    .filter((s) => s.ansatt_id === hvem.id && (s.fra.startsWith(`${aar}`) || s.til.startsWith(`${aar}`)))
    .sort((a, b) => a.fra.localeCompare(b.fra));
  const godkjente = mine.filter((s) => s.status === "godkjent");
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / Math.max(sd.total, 1)) * 100))}%`;
  const avd = d.avdelinger.find((x) => x.id === hvem.avdeling_id)?.navn ?? "";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kanSende) return;
    setSender(true);
    const ok = await kjor(() => api.lagreSoknad({ ansatt_id: hvem.id, fra, til, merknad: merknad.trim() }), meSelv ? "Søknaden er sendt" : `Ferie registrert for ${hvem.navn}`);
    setSender(false);
    if (ok) { setFra(""); setTil(""); setMerknad(""); }
  };

  return (
    <>
      {leder && (
        <div className="row">
          <label className="label" htmlFor="for">Viser for</label>
          <select id="for" value={forId} onChange={(e) => { setForId(e.target.value); setFra(""); setTil(""); }}>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.id === meg.id ? `${a.navn} (meg)` : a.navn}</option>)}
          </select>
        </div>
      )}
      <div className="grid2">
        <section className="panel" aria-label="Saldo">
          <div className="label">Saldo {aar} · {avd}</div>
          <div className="saldo-top">
            <span className="big num">{sd.igjen}</span>
            <span className="muted">feriedager igjen av <b className="num">{sd.total}</b></span>
          </div>
          <div className="bar" aria-hidden="true">
            <span className="bg-approved" style={{ width: pct(sd.godkjent) }} />
            <span className="stripe" style={{ width: pct(sd.venter) }} />
          </div>
          <div className="legend">
            <div><span className="label"><i className="dot bg-approved" />Godkjent</span><span className="v">{sd.godkjent}</span></div>
            <div><span className="label"><i className="dot stripe" />Venter</span><span className="v">{sd.venter}</span></div>
            <div><span className="label">Hovedferie</span><span className="v">{Math.min(sd.hovedferie, HOVEDFERIE)}<span className="muted"> / {HOVEDFERIE}</span></span></div>
          </div>
          <p className="small muted">
            Rett: {rett.grunn} feriedager{rett.ekstra60 ? ` + ${rett.ekstra60} (over 60)` : ""}{rett.overfort ? ` + ${rett.overfort} overført fra ${aar - 1}` : ""}. Feriedager telles mandag–fredag, så en uke ferie er 5 dager.
          </p>
        </section>

        <form className="panel" onSubmit={send}>
          <h2>{meSelv ? "Søk ferie" : `Registrer ferie for ${hvem.navn}`}</h2>
          <div className="row">
            <label className="field"><span className="label">Fra og med</span>
              <input id="fra" type="date" value={fra} min={`${aar}-01-01`} max={`${aar}-12-31`}
                onChange={(e) => { setFra(e.target.value); if (!til || til < e.target.value) setTil(e.target.value); }} />
            </label>
            <label className="field"><span className="label">Til og med</span>
              <input id="til" type="date" value={til} min={fra || `${aar}-01-01`} max={`${aar}-12-31`} onChange={(e) => setTil(e.target.value)} />
            </label>
          </div>
          <label className="field"><span className="label">Merknad (valgfritt)</span>
            <textarea id="merknad" rows={2} value={merknad} onChange={(e) => setMerknad(e.target.value)} placeholder="F.eks. hytteferie, kan nås på telefon" />
          </label>
          {fra && til ? <Sjekkliste liste={sjekk} /> : <p className="small muted">Velg datoer, så sjekker appen saldo, varsel, hovedferie og bemanning med en gang.</p>}
          <div><button className="btn primary" disabled={!kanSende}>{sender ? "Sender …" : meSelv ? "Send søknad" : "Registrer"}</button></div>
        </form>
      </div>

      <section className="panel">
        <div className="cal-head">
          <h2>{meSelv ? "Mine søknader" : `Søknader for ${hvem.navn}`} {aar}</h2>
          {godkjente.length > 1 && (
            <button className="btn sm" onClick={() => lastNedIcs(lagIcs(godkjente, hvem.navn), `ferie-${aar}.ics`)}>Legg all ferie {aar} i kalenderen</button>
          )}
        </div>
        {mine.length ? (
          <div className="list">
            {mine.map((s) => (
              <SoknadRad key={s.id} s={s} handlinger={
                s.status === "venter" && (meSelv || leder)
                  ? <button className="btn sm" onClick={() => kjor(() => api.slettSoknad(s.id), "Søknaden er trukket")}>Trekk</button>
                  : s.status === "godkjent"
                    ? <button className="btn sm" onClick={() => lastNedIcs(lagIcs([s], hvem.navn), `ferie-${s.fra}.ics`)}>Legg i kalender</button>
                    : null
              } />
            ))}
          </div>
        ) : <div className="empty">Ingen søknader for {aar}.</div>}
      </section>
    </>
  );
}
