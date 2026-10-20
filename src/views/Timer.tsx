import { ProsjektForbruk } from "./ProsjektForbruk";
import { useEffect, useMemo, useState } from "react";
import { Dagslogg } from "./Dagslogg";
import { Fordeling } from "./Fordeling";
import { useApp } from "../App";
import { api } from "../lib/api";
import { addDays, helligdag, kortDato, sorterAnsatte } from "../lib/ferie";
import { dagerUtenTimer, hhmm, lonnsdager, mandag, normaltid, sisteProsjekter, t2, ukenr, varighet, type Time } from "../lib/timer";
import { InneNaa, Stempling } from "./Stempling";
import { ProsjektVelger } from "./ProsjektVelger";
import { TilleggValg, tilleggFor } from "./TilleggValg";
import { ReklamasjonValg } from "./Reklamasjon";
import { ServiceValg } from "./Service";
import { bruker } from "../lib/moduler";

const DAG = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

export function Timer() {
  const { d, meg, leder, idag, kjor, kjorKo } = useApp();
  const [hvemId, setHvemId] = useState(meg.id);
  const [uke, setUke] = useState(() => mandag(idag));
  const hvem = d.ansatte.find((a) => a.id === hvemId) ?? meg;
  const meSelv = hvem.id === meg.id;
  const lunsjStd = hvem.lunsjtrekk ? (hvem.lunsj_min ?? 30) : 0;

  const tom = (a = hvem) => ({ id: undefined as string | undefined, dato: idag, prosjekt_id: "", fra: "07:00", til: "15:30", lunsj: !!a.lunsjtrekk, km: "", reisetid: "", beskrivelse: "", fakturerbar: true, reklamasjon_id: "", tillegg_id: "", service_id: "" });
  const [f, setF] = useState(tom);
  // Reklamasjon: timene føres på det faste reklamasjonsprosjektet (eller originaljobben) og faktureres ikke
  const rp = bruker(d, "reklamasjon") ? d.reklamasjonProsjekt ?? null : null;
  const aapneRekl = (pid: string) => bruker(d, "reklamasjon") ? (d.reklamasjoner ?? []).filter((r) => (r.status === "godkjent" || r.status === "ny") && (pid === rp || r.prosjekt_id === pid)) : [];
  const visRekl = !!f.prosjekt_id && (f.prosjekt_id === rp || aapneRekl(f.prosjekt_id).length > 0 || !!f.reklamasjon_id);
  const velgProsjekt = (id: string) => {
    const mine = aapneRekl(id).filter((r) => r.ansvarlig_id === hvem.id && r.status === "godkjent");
    sett({ prosjekt_id: id, reklamasjon_id: id === rp && mine.length === 1 ? mine[0]!.id : id === f.prosjekt_id ? f.reklamasjon_id : "", tillegg_id: id === f.prosjekt_id ? f.tillegg_id : "" });
  };
  const erRekl = !!f.prosjekt_id && (f.prosjekt_id === rp || !!f.reklamasjon_id);
  // Serviceoppdrag: timer på serviceprosjektet må gjelde et bestemt oppdrag
  const erService = bruker(d, "service") && !!f.prosjekt_id && f.prosjekt_id === d.serviceProsjekt;
  const visTillegg = !!f.prosjekt_id && !erRekl && !erService && tilleggFor(d, f.prosjekt_id, f.tillegg_id).length > 0;
  const sett = (x: Partial<ReturnType<typeof tom>>) => setF({ ...f, ...x });
  // Manuell føring er for det man glemte å logge; vises når man ber om det, endrer, eller leder fører for andre
  const [manuell, setManuell] = useState(false);
  const visSkjema = manuell || !!f.id || !meSelv;
  const siste = sisteProsjekter(d.timer, hvem.id).filter((id) => d.prosjekter.some((p) => p.id === id && p.aktiv));
  const mangler = dagerUtenTimer(hvem.id, d, mandag(idag), idag, helligdag);

  // Dagen som vises i dagsloggen følger datoen i skjemaet, og kan velges fra ukelista
  const [valgtDag, setValgtDag] = useState(idag);
  useEffect(() => { if (f.dato) setValgtDag(f.dato); }, [f.dato]);

  const aktive = d.prosjekter.filter((p) => p.aktiv || p.id === f.prosjekt_id);
  const kunde = (id: string | null) => d.kunder.find((k) => k.id === id)?.navn;
  const prosjektNavn = (id: string | null) => {
    if (!id) return "Internt arbeid";
    const p = d.prosjekter.find((x) => x.id === id);
    return p ? `${p.visma_nr ? p.visma_nr + " · " : ""}${p.navn}${kunde(p.kunde_id) ? " – " + kunde(p.kunde_id) : ""}` : "Ukjent prosjekt";
  };

  const dager = Array.from({ length: 7 }, (_, i) => addDays(uke, i));
  const ukeTimer = d.timer.filter((t) => t.ansatt_id === hvem.id && t.dato >= uke && t.dato <= dager[6]);
  const lonn = useMemo(() => lonnsdager(hvem, d.timer, uke, dager[6]), [hvem, d.timer, uke]);
  const sum = (k: "timer" | "normal" | "ot50" | "ot100" | "lunsjtrekk" | "km") => lonn.reduce((n, x) => n + x[k], 0);
  const ikkeGodkjent = ukeTimer.filter((t) => t.status !== "godkjent").map((t) => t.id);
  const lunsjMin = f.lunsj ? (hvem.lunsj_min ?? 30) : 0;
  const lengde = f.fra && f.til ? varighet(f.fra, f.til, lunsjMin) : 0;
  const gyldig = !!f.dato && !!f.fra && !!f.til && lengde > 0 && (!erService || !!f.service_id);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gyldig) return;
    const ok = await kjorKo({ type: "time", time: {
      id: f.id, ansatt_id: hvem.id, prosjekt_id: f.prosjekt_id || null, dato: f.dato, fra: f.fra, til: f.til,
      lunsj_min: lunsjMin, km: Number(f.km.replace(",", ".")) || 0, reisetid: Number(f.reisetid.replace(",", ".")) || 0, beskrivelse: f.beskrivelse.trim(), fakturerbar: !!f.prosjekt_id && f.fakturerbar && !erRekl,
      ...(visRekl || f.id ? { reklamasjon_id: visRekl ? f.reklamasjon_id || null : null } : {}),
      ...(f.tillegg_id || f.id ? { tillegg_id: visTillegg ? f.tillegg_id || null : null } : {}),
      ...(erService || f.service_id ? { service_id: erService ? f.service_id || null : null } : {}),
    } }, f.id ? "Timene er endret" : `${t2(lengde)} timer registrert`);
    if (ok) { setF({ ...tom(), dato: f.dato, prosjekt_id: f.prosjekt_id, reklamasjon_id: f.reklamasjon_id, tillegg_id: f.tillegg_id, service_id: f.service_id, fra: f.til, til: f.til < "15:30" ? "15:30" : f.til }); if (f.dato < uke || f.dato > dager[6]) setUke(mandag(f.dato)); }
  };
  const rediger = (t: Time) => setF({ id: t.id, dato: t.dato, prosjekt_id: t.prosjekt_id ?? "", fra: hhmm(t.fra), til: hhmm(t.til), lunsj: t.lunsj_min > 0, km: t.km ? String(t.km) : "", reisetid: t.reisetid ? String(t.reisetid) : "", beskrivelse: t.beskrivelse, fakturerbar: t.fakturerbar !== false, reklamasjon_id: t.reklamasjon_id ?? "", tillegg_id: t.tillegg_id ?? "", service_id: t.service_id ?? "" });
  const kanEndre = (t: Time) => leder || t.status !== "godkjent";

  return (
    <>
      {leder && (
        <div className="row">
          <label className="label" htmlFor="timer-for">Viser for</label>
          <select id="timer-for" value={hvemId} onChange={(e) => { setHvemId(e.target.value); setF(tom(d.ansatte.find((a) => a.id === e.target.value) ?? meg)); }}>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.id === meg.id ? `${a.navn} (meg)` : a.navn}</option>)}
          </select>
        </div>
      )}
      {meSelv && <Stempling />}
      {meSelv && !d.stempling.some((x) => x.ansatt_id === meg.id) && (
        <div className="small" style={{ textAlign: "right" }}><a href="#syk">Syk i dag? Meld egenmelding</a></div>
      )}
      {leder && meSelv && <InneNaa />}
      {mangler.length > 0 && (
        <div className="banner"><span><b>Mangler timer</b> {meSelv ? "" : `for ${hvem.navn} `}denne uka: {mangler.map((x) => DAG[new Date(x + "T00:00:00Z").getUTCDay()].toLowerCase() + " " + kortDato(x)).join(", ").replace(/\.$/, "")}.</span>
          <button className="btn sm" onClick={() => { setManuell(true); sett({ dato: mangler[0] }); }}>Før for {kortDato(mangler[0])}</button></div>
      )}
      <div className="grid2">
        {!visSkjema ? (
          <section className="panel">
            <h2 style={{ margin: 0 }}>Glemt å logge inn?</h2>
            <p className="small muted">Timer skal helst logges inn og ut i sanntid. Har du glemt det, kan du føre timene manuelt. De merkes da som «ført etterpå».</p>
            <div><button className="btn" onClick={() => setManuell(true)}>Før timer manuelt</button></div>
          </section>
        ) : (
        <form className="panel" onSubmit={lagre}>
          <h2>{f.id ? "Endre timer" : meSelv ? "Før timer" : `Før timer for ${hvem.navn}`}</h2>
          <div className="row">
            <label className="field"><span className="label">Dato</span>
              <input type="date" value={f.dato} onChange={(e) => {
                const sistTil = d.timer.filter((t) => t.ansatt_id === hvem.id && t.dato === e.target.value).map((t) => hhmm(t.til)).sort().pop();
                sett(sistTil && !f.id ? { dato: e.target.value, fra: sistTil, til: sistTil < "15:30" ? "15:30" : sistTil } : { dato: e.target.value });
              }} required /></label>
            <label className="field kort"><span className="label">Fra</span>
              <input type="time" step={900} value={f.fra} onChange={(e) => sett({ fra: e.target.value })} required /></label>
            <label className="field kort"><span className="label">Til</span>
              <input type="time" step={900} value={f.til} onChange={(e) => sett({ til: e.target.value })} required /></label>
          </div>
          <ProsjektVelger value={f.prosjekt_id} onChange={velgProsjekt} prosjekter={aktive} tom="Internt arbeid (butikk, lager, verksted)"
            forslag={{ tittel: "Siste prosjekter", ider: siste }} />
          {siste.length > 0 && (
            <div className="hurtig" aria-label="Siste prosjekter">
              {siste.map((id) => { const p = d.prosjekter.find((x) => x.id === id)!; return (
                <button type="button" key={id} aria-pressed={f.prosjekt_id === id} onClick={() => velgProsjekt(id)} title={prosjektNavn(id)}>{p.visma_nr ? `${p.visma_nr} ` : ""}{p.navn}</button>
              ); })}
              <button type="button" aria-pressed={f.prosjekt_id === ""} onClick={() => sett({ prosjekt_id: "" })}>Internt</button>
            </div>
          )}
          {f.prosjekt_id && <ProsjektForbruk prosjektId={f.prosjekt_id} />}
          {visRekl && <ReklamasjonValg value={f.reklamasjon_id} onChange={(id) => sett({ reklamasjon_id: id })} prosjektId={f.prosjekt_id === rp ? undefined : f.prosjekt_id} />}
          {erService && <ServiceValg value={f.service_id} onChange={(id) => sett({ service_id: id })} />}
          {visTillegg && <TilleggValg prosjektId={f.prosjekt_id} value={f.tillegg_id} onChange={(id) => sett({ tillegg_id: id })} />}
          {f.prosjekt_id && !erRekl && (
            <label className="row small"><input type="checkbox" checked={f.fakturerbar} onChange={(e) => sett({ fakturerbar: e.target.checked })} /> Fakturerbart (faktureres kunden)</label>
          )}
          {erRekl && <p className="small muted" style={{ margin: 0 }}>Timer på reklamasjon faktureres ikke.</p>}
          {hvem.lunsjtrekk && (
            <label className="row small"><input type="checkbox" checked={f.lunsj} onChange={(e) => sett({ lunsj: e.target.checked })} /> Hadde lunsj ({hvem.lunsj_min ?? 30} min trekkes)</label>
          )}
          <div className="row">
            <label className="field"><span className="label">Kjøring (km)</span>
              <input type="text" inputMode="decimal" value={f.km} onChange={(e) => sett({ km: e.target.value })} placeholder="0" /></label>
            <label className="field"><span className="label">Reisetid (timer)</span>
              <input type="text" inputMode="decimal" value={f.reisetid} onChange={(e) => sett({ reisetid: e.target.value })} placeholder="0" /></label>
          </div>
          <label className="field"><span className="label">Hva ble gjort</span>
            <input type="text" value={f.beskrivelse} onChange={(e) => sett({ beskrivelse: e.target.value })} placeholder="F.eks. montert vinduer 2. etasje" /></label>
          <div className="row">
            <button className="btn primary" disabled={!gyldig}>{f.id ? "Lagre endring" : "Registrer"}{gyldig ? ` · ${t2(lengde)} t` : ""}</button>
            {f.id && <button type="button" className="btn" onClick={() => setF(tom())}>Avbryt</button>}
            {!f.id && meSelv && manuell && <button type="button" className="btn" onClick={() => setManuell(false)}>Lukk</button>}
          </div>
          {f.fra && f.til && !gyldig && <p className="small" style={{ color: "var(--warn)" }}>Sluttid må være etter starttid.</p>}
        </form>
        )}

        <section className="panel">
          <div className="cal-head">
            <h2 style={{ margin: 0 }}>Uke {ukenr(uke)}</h2>
            <div className="cal-nav">
              <button className="btn sm" aria-label="Forrige uke" onClick={() => setUke(addDays(uke, -7))}>‹</button>
              <span className="small muted">{kortDato(uke)} – {kortDato(dager[6])}</span>
              <button className="btn sm" aria-label="Neste uke" onClick={() => setUke(addDays(uke, 7))}>›</button>
            </div>
          </div>
          <div className="legend">
            <div><span className="label">Timer</span><span className="v">{t2(sum("timer") - sum("lunsjtrekk"))}</span></div>
            <div><span className="label">Normaltid</span><span className="v">{t2(sum("normal"))} / {t2(normaltid(hvem))}</span></div>
            <div><span className="label">Overtid 50 %</span><span className="v">{t2(sum("ot50"))}</span></div>
            <div><span className="label">Overtid 100 %</span><span className="v">{t2(sum("ot100"))}</span></div>
          </div>
          <div className="list">
            {dager.map((dato) => {
              const rader = ukeTimer.filter((t) => t.dato === dato);
              const dag = lonn.find((x) => x.dato === dato);
              const hd = helligdag(dato);
              if (!rader.length && (new Date(dato).getUTCDay() % 6 === 0 || hd)) return null;
              return (
                <div key={dato}>
                  <div className="small" style={{ fontWeight: 600, margin: "4px 0", cursor: "pointer" }} onClick={() => setValgtDag(dato)} title="Vis hele dagen">
                    <span style={dato === valgtDag ? { textDecoration: "underline" } : undefined}>{DAG[new Date(dato + "T00:00:00Z").getUTCDay()]} {kortDato(dato)}</span>{hd ? ` · ${hd}` : ""}
                    {dag && <span className="muted"> · {t2(dag.timer - dag.lunsjtrekk)} t</span>}
                  </div>
                  {dag?.lunsjavvik && <div className="small" style={{ color: "var(--warn)" }}>Lunsj er ikke registrert – {lunsjStd} min trekkes.</div>}
                  {rader.length ? rader.map((t) => (
                    <div key={t.id} className={`item ${t.status === "godkjent" ? "godkjent" : "venter"}`}>
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{hhmm(t.fra)}–{hhmm(t.til)} · {t2(t.timer)} t</div>
                        <div className="s">{prosjektNavn(t.prosjekt_id)}{t.reklamasjon_id ? ` · reklamasjon: ${(d.reklamasjoner ?? []).find((r) => r.id === t.reklamasjon_id)?.tittel ?? ""}` : t.tillegg_id ? ` · tillegg: ${d.tillegg.find((x) => x.id === t.tillegg_id)?.tittel ?? ""}` : t.prosjekt_id && t.fakturerbar === false ? " · ikke fakturerbart" : ""}{t.lunsj_min ? ` · lunsj ${t.lunsj_min} min` : ""}{t.km ? ` · ${t2(t.km)} km` : ""}{t.reisetid ? ` · reise ${t2(t.reisetid)} t` : ""}</div>
                        {t.beskrivelse && <div className="s">{t.beskrivelse}</div>}
                      </div>
                      <div className="acts">
                        {t.kilde === "manuell" && <span className="chip demo" title="Ført i etterkant, ikke logget inn/ut">Ført etterpå</span>}
                        {t.kilde === "endret" && <span className="chip demo" title="Logget inn/ut, men tidene er rettet etterpå">Rettet</span>}
                        {t.kilde === "svenn" && <span className="chip demo" title="Importert fra Svenn">Fra Svenn</span>}
                        <span className={`chip ${t.status === "godkjent" ? "godkjent" : "venter"}`}>{t.status === "godkjent" ? "Godkjent" : "Levert"}</span>
                        {kanEndre(t) && <button className="btn sm" onClick={() => rediger(t)}>Endre</button>}
                        {kanEndre(t) && <button className="btn sm no" onClick={() => kjor(() => api.slettTime(t.id), "Slettet")}>Slett</button>}
                      </div>
                    </div>
                  )) : <div className="small muted">Ingen timer.</div>}
                </div>
              );
            })}
          </div>
          {leder && ukeTimer.length > 0 && (
            <div className="row">
              {ikkeGodkjent.length
                ? <button className="btn ok" onClick={() => kjor(() => api.settTimestatus(ikkeGodkjent, "godkjent"), `Uke ${ukenr(uke)} godkjent for ${hvem.navn}`)}>Godkjenn uke {ukenr(uke)}</button>
                : <button className="btn" onClick={() => kjor(() => api.settTimestatus(ukeTimer.map((t) => t.id), "levert"), "Åpnet for endring")}>Åpne uka for endring</button>}
            </div>
          )}
        </section>
      </div>
      <Dagslogg dato={valgtDag} setDato={setValgtDag} ansattId={hvem.id} />
      {!leder && <Fordeling />}
    </>
  );
}
