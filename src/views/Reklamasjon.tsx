// Reklamasjon: kunden melder feil eller mangel på en ferdig jobb.
// Registreres på originaljobben. Utbedringen planlegges og timene føres på bedriftens faste
// reklamasjonsprosjekt, merket med hvilken reklamasjon de gjelder (aldri fakturerbare).
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, sorterAnsatte } from "../lib/ferie";
import {
  REKLAMASJON_CHIP, REKLAMASJON_STATUS, aapenReklamasjon, aarEtterOverlevering, reklamasjonTimer, reklamasjonerIAar,
  type Reklamasjon as R, type ReklamasjonStatus,
} from "../lib/reklamasjon";
import { prosjektTekst } from "../lib/prosjektsok";
import { t2, type Prosjekt } from "../lib/timer";
import { Bilder } from "./Bilder";
import { OppgaveSkjema, usePlanlegger } from "./Plan";
import { ProsjektVelger } from "./ProsjektVelger";

type Filter = "aapne" | "alle";

/** Liste over reklamasjoner – på ett prosjekt, eller alle (for butikk/prosjektleder) */
export function Reklamasjoner({ p }: { p?: Prosjekt }) {
  const { d, meg, idag } = useApp();
  const planlegger = usePlanlegger();
  const [filter, setFilter] = useState<Filter>(p ? "alle" : "aapne");
  const [ny, setNy] = useState(false);
  const [apen, setApen] = useState<string | null>(null);
  const alle = d.reklamasjoner ?? [];
  const liste = alle
    .filter((r) => !p || r.prosjekt_id === p.id)
    .filter((r) => filter === "alle" || aapenReklamasjon(r) || (r.status === "utbedret" && !r.signatur && r.ansvarlig_id === meg.id))
    .sort((a, b) => Number(aapenReklamasjon(b)) - Number(aapenReklamasjon(a)) || b.meldt_dato.localeCompare(a.meldt_dato));
  const aar = Number(idag.slice(0, 4));
  const sum = reklamasjonerIAar(alle, d.timer, aar);
  const rp = d.prosjekter.find((x) => x.id === d.reklamasjonProsjekt);

  return (
    <section className="panel">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>{p ? "Reklamasjon" : "Reklamasjoner"}</h2>
        <div className="filter">
          {([["aapne", "Åpne"], ["alle", "Alle"]] as [Filter, string][]).map(([f, t]) => (
            <button key={f} className="btn sm" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t}</button>
          ))}
          {!ny && <button className="btn sm primary" onClick={() => setNy(true)}>+ Ny reklamasjon</button>}
        </div>
      </div>
      {!p && planlegger && (
        <p className="small muted" style={{ margin: 0 }}>
          I år: {sum.antall} reklamasjon{sum.antall === 1 ? "" : "er"}{sum.avvist ? ` (${sum.avvist} avvist)` : ""} · {t2(sum.timer)} timer
          {sum.materiell ? ` · materiell kr ${sum.materiell.toLocaleString("nb-NO")}` : ""}
          {rp ? <> · timene føres på <b>{prosjektTekst(rp)}</b></> : " · velg reklamasjonsprosjekt i Oppsett"}
        </p>
      )}
      {ny && <NyReklamasjon p={p} lukk={(id) => { setNy(false); if (id) setApen(id); }} />}
      {!ny && p && !liste.length && (
        <p className="muted small" style={{ margin: 0 }}>
          Har kunden meldt fra om feil eller mangel på jobben? Registrer det her, så blir det vurdert, planlagt og fulgt opp.
        </p>
      )}
      {liste.length > 0 && (
        <div className="list">
          {liste.map((r) => <ReklamasjonRad key={r.id} r={r} visProsjekt={!p} apen={apen === r.id} veksle={() => setApen(apen === r.id ? null : r.id)} />)}
        </div>
      )}
      {!p && !liste.length && !ny && <div className="empty">{filter === "aapne" ? "Ingen åpne reklamasjoner." : "Ingen reklamasjoner."}</div>}
    </section>
  );
}

function NyReklamasjon({ p, lukk }: { p?: Prosjekt; lukk: (id?: string) => void }) {
  const { d, idag, kjor } = useApp();
  const [f, setF] = useState({ prosjekt_id: p?.id ?? "", meldt_dato: idag, kontakt: "", tittel: "", beskrivelse: "" });
  const [filer, setFiler] = useState<FileList | null>(null);
  const [sender, setSender] = useState(false);
  const prosjekter = d.prosjekter.filter((x) => x.id !== d.reklamasjonProsjekt);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.prosjekt_id || !f.tittel.trim()) return;
    setSender(true);
    let id = "";
    const ok = await kjor(async () => {
      id = await api.lagreReklamasjon({ ...f, tittel: f.tittel.trim(), beskrivelse: f.beskrivelse.trim(), kontakt: f.kontakt.trim() });
      for (const fil of Array.from(filer ?? [])) await api.lastOppBilde(fil, { reklamasjon_id: id, prosjekt_id: f.prosjekt_id });
    }, "Reklamasjonen er registrert");
    setSender(false);
    if (ok) lukk(id);
  };
  return (
    <form onSubmit={send} className="panel" style={{ background: "var(--sunk)", display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>Ny reklamasjon</h3>
      {!p && <ProsjektVelger label="Hvilken jobb gjelder det?" value={f.prosjekt_id} onChange={(id) => setF({ ...f, prosjekt_id: id })} prosjekter={prosjekter} required />}
      <div className="row">
        <label className="field kort"><span className="label">Kunden meldte fra</span>
          <input type="date" value={f.meldt_dato} max={idag} onChange={(e) => setF({ ...f, meldt_dato: e.target.value })} required /></label>
        <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Hvem meldte, og hvordan</span>
          <input value={f.kontakt} onChange={(e) => setF({ ...f, kontakt: e.target.value })} placeholder="F.eks. Kari ringte butikken" maxLength={300} /></label>
      </div>
      <label className="field"><span className="label">Hva er feil?</span>
        <input value={f.tittel} onChange={(e) => setF({ ...f, tittel: e.target.value })} placeholder="Kort, f.eks. «Dør på bad går tregt»" maxLength={200} required /></label>
      <label className="field"><span className="label">Beskrivelse</span>
        <textarea rows={3} value={f.beskrivelse} onChange={(e) => setF({ ...f, beskrivelse: e.target.value })} placeholder="Hvor, når det ble oppdaget, og hva kunden sier" maxLength={5000} /></label>
      <div className="row">
        <label className="btn sm">{filer?.length ? `${filer.length} bilde${filer.length > 1 ? "r" : ""} valgt` : "Legg ved bilder"}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => setFiler(e.target.files)} /></label>
        {!!filer?.length && <button type="button" className="linkbtn small" onClick={() => setFiler(null)}>Fjern</button>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!f.prosjekt_id || !f.tittel.trim() || sender}>{sender ? "Lagrer …" : "Registrer reklamasjon"}</button>
        <button type="button" className="btn" onClick={() => lukk()}>Avbryt</button>
      </div>
    </form>
  );
}

function ReklamasjonRad({ r, visProsjekt, apen, veksle }: { r: R; visProsjekt: boolean; apen: boolean; veksle: () => void }) {
  const { d, meg, idag, kjor, leder } = useApp();
  const planlegger = usePlanlegger();
  const [e, setE] = useState({ status: r.status, vurdering: r.vurdering, ansvarlig_id: r.ansvarlig_id ?? "", frist: r.frist ?? "", materiell: r.materiell_kost == null ? "" : String(r.materiell_kost).replace(".", ",") });
  useEffect(() => {
    setE({ status: r.status, vurdering: r.vurdering, ansvarlig_id: r.ansvarlig_id ?? "", frist: r.frist ?? "", materiell: r.materiell_kost == null ? "" : String(r.materiell_kost).replace(".", ",") });
  }, [r.endret]); // eslint-disable-line react-hooks/exhaustive-deps
  const [plan, setPlan] = useState(false);
  const [signer, setSigner] = useState(false);
  const p = d.prosjekter.find((x) => x.id === r.prosjekt_id);
  const kunde = d.kunder.find((k) => k.id === p?.kunde_id);
  const navn = (id: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const timer = reklamasjonTimer(d.timer, r.id);
  const forsinket = r.frist && aapenReklamasjon(r) && r.frist < idag;
  const aar = aarEtterOverlevering(p?.slutt, r.meldt_dato);
  const ansvarlig = r.ansvarlig_id === meg.id;
  const oppgaver = (d.oppgaver ?? []).filter((o) => o.reklamasjon_id === r.id);
  const lagre = (x: Parameters<typeof api.lagreReklamasjon>[0], tekst: string) => kjor(() => api.lagreReklamasjon(x).then(() => {}), tekst);
  const lagreBehandling = () => lagre({
    id: r.id, prosjekt_id: r.prosjekt_id, status: e.status, vurdering: e.vurdering.trim(), ansvarlig_id: e.ansvarlig_id || null, frist: e.frist || null,
    materiell_kost: e.materiell.trim() ? Number(e.materiell.replace(",", ".").replace(/\s/g, "")) || 0 : null,
  }, e.status === "avvist" ? "Reklamasjonen er avvist" : e.status === "utbedret" ? "Meldt utbedret" : "Lagret");

  return (
    <div className={`item ${REKLAMASJON_CHIP[r.status]}`}>
      <div style={{ minWidth: 0, cursor: "pointer" }} onClick={veksle}>
        <div className="t">{r.tittel}</div>
        <div className="s">
          {visProsjekt && p ? `${prosjektTekst(p)}${kunde ? ` – ${kunde.navn}` : ""} · ` : ""}meldt {kortDato(r.meldt_dato)}
          {r.ansvarlig_id ? ` · ${navn(r.ansvarlig_id)}` : ""}{timer ? ` · ${t2(timer)} t` : ""}
        </div>
        {r.frist && aapenReklamasjon(r) && <div className="s" style={forsinket ? { color: "var(--warn)" } : undefined}>Frist {kortDato(r.frist)}{forsinket ? " (forsinket)" : ""}</div>}
      </div>
      <div className="acts">
        <span className={`chip ${REKLAMASJON_CHIP[r.status]}`}>{REKLAMASJON_STATUS[r.status]}</span>
        <button className="btn sm" onClick={veksle}>{apen ? "Skjul" : "Vis"}</button>
      </div>
      {apen && (
        <div className="full" style={{ display: "grid", gap: 10 }}>
          <div className="small">
            {r.kontakt && <div>{r.kontakt}</div>}
            <div className="muted">Registrert av {navn(r.meldt_av) || "ukjent"} {kortDato(r.opprettet.slice(0, 10))}
              {p?.slutt ? ` · jobben ble avsluttet ${kortDato(p.slutt)}` : ""}{aar != null && aar >= 1 ? ` (${aar} år før kunden meldte fra)` : ""}</div>
            {aar != null && aar >= 5 && <div style={{ color: "var(--warn)" }}>Kunden meldte fra mer enn fem år etter at jobben var ferdig. Sjekk om reklamasjonen er kommet for sent.</div>}
          </div>
          {r.beskrivelse && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.beskrivelse}</p>}
          {r.vurdering && !planlegger && <p className="small" style={{ margin: 0 }}><b>Vurdering:</b> {r.vurdering}</p>}
          <Bilder bilder={d.bilder.filter((b) => b.reklamasjon_id === r.id)} til={{ reklamasjon_id: r.id, prosjekt_id: r.prosjekt_id }} tittel="Bilder" />
          {timer > 0 && <TimerListe id={r.id} />}
          {oppgaver.length > 0 && (
            <div className="small"><b>Planlagt:</b> {oppgaver.map((o) => `${kortDato(o.fra)}${o.til !== o.fra ? `–${kortDato(o.til)}` : ""} (${o.ansatte.map((a) => navn(a).split(" ")[0]).join(", ") || "ikke delt ut"})`).join(" · ")}</div>
          )}
          {r.signatur && (
            <div className="small">Kunden kvitterte {r.signert_tid ? kortDato(r.signert_tid.slice(0, 10)) : ""}: <b>{r.signert_navn}</b>
              <div><img src={r.signatur} alt={`Signatur ${r.signert_navn}`} style={{ maxWidth: 220, background: "#fff", border: "1px solid var(--line)", borderRadius: 6 }} /></div></div>
          )}

          {planlegger && (
            <div className="panel" style={{ background: "var(--sunk)", display: "grid", gap: 10 }}>
              <div className="row">
                <label className="field"><span className="label">Status</span>
                  <select value={e.status} onChange={(x) => setE({ ...e, status: x.target.value as ReklamasjonStatus })}>
                    {Object.entries(REKLAMASJON_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></label>
                <label className="field"><span className="label">Ansvarlig</span>
                  <select value={e.ansvarlig_id} onChange={(x) => setE({ ...e, ansvarlig_id: x.target.value })}>
                    <option value="">Ingen</option>
                    {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
                  </select></label>
                <label className="field kort"><span className="label">Frist</span>
                  <input type="date" value={e.frist} onChange={(x) => setE({ ...e, frist: x.target.value })} /></label>
              </div>
              <label className="field"><span className="label">Vurdering og svar til kunden</span>
                <textarea rows={2} value={e.vurdering} onChange={(x) => setE({ ...e, vurdering: x.target.value })} maxLength={5000}
                  placeholder={e.status === "avvist" ? "Hvorfor reklamasjonen ikke godtas (f.eks. normal slitasje, feil bruk, meldt for sent)" : "Hva vi gjør, og når"} /></label>
              <label className="field kort"><span className="label">Materiell (kr, valgfritt)</span>
                <input inputMode="decimal" value={e.materiell} onChange={(x) => setE({ ...e, materiell: x.target.value })} placeholder="0" /></label>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary sm" onClick={lagreBehandling}>Lagre</button>
                {r.status !== "avvist" && !plan && <button className="btn sm" onClick={() => setPlan(true)}>Planlegg utbedring</button>}
                {leder && <button className="btn sm no" onClick={() => kjor(() => api.slettReklamasjon(r.id), "Reklamasjonen er slettet")}>Slett</button>}
              </div>
            </div>
          )}
          {plan && (
            <div className="panel" style={{ background: "var(--sunk)" }}>
              <OppgaveSkjema ferdig={() => setPlan(false)} start={{
                prosjekt_id: d.reklamasjonProsjekt ?? r.prosjekt_id, fra: r.frist && r.frist >= idag ? r.frist : idag, til: r.frist && r.frist >= idag ? r.frist : idag,
                ansatte: r.ansvarlig_id ? [r.ansvarlig_id] : [], reklamasjon_id: r.id,
                tittel: `Reklamasjon: ${r.tittel}`.slice(0, 200),
                beskrivelse: [p ? `${prosjektTekst(p)}${kunde ? ` – ${kunde.navn}` : ""}` : "", p?.adresse ?? "", p?.kontakt_telefon ? `Tlf. ${p.kontakt_telefon}` : "", r.beskrivelse].filter(Boolean).join("\n"),
              }} />
            </div>
          )}
          {!planlegger && ansvarlig && r.status === "godkjent" && (
            <div><button className="btn primary sm" onClick={() => lagre({ id: r.id, prosjekt_id: r.prosjekt_id, status: "utbedret" }, "Meldt utbedret")}>Meld utbedret</button></div>
          )}
          {r.status === "utbedret" && !r.signatur && (planlegger || ansvarlig) && (
            <div><button className="btn sm" onClick={() => setSigner(true)}>Kunden kvitterer for utbedringen</button></div>
          )}
          {signer && <KundeKvittering r={r} lukk={() => setSigner(false)} />}
        </div>
      )}
    </div>
  );
}

function TimerListe({ id }: { id: string }) {
  const { d } = useApp();
  const navn = (a: string) => d.ansatte.find((x) => x.id === a)?.navn ?? "";
  const liste = d.timer.filter((t) => t.reklamasjon_id === id).sort((a, b) => a.dato.localeCompare(b.dato));
  return (
    <details className="small">
      <summary>Timer brukt: {t2(liste.reduce((n, t) => n + Number(t.timer), 0))}</summary>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {liste.map((t) => <li key={t.id}>{kortDato(t.dato)} · {navn(t.ansatt_id)} · {t2(t.timer)} t{t.beskrivelse ? ` – ${t.beskrivelse}` : ""}</li>)}
      </ul>
    </details>
  );
}

/** Kunden signerer på skjermen at feilen er rettet */
function KundeKvittering({ r, lukk }: { r: R; lukk: () => void }) {
  const { kjor } = useApp();
  const c = useRef<HTMLCanvasElement>(null);
  const [navn, setNavn] = useState("");
  const [tegnet, setTegnet] = useState(false);
  const tegner = useRef(false);
  useEffect(() => {
    const cv = c.current!;
    const b = cv.getBoundingClientRect();
    cv.width = b.width * devicePixelRatio; cv.height = b.height * devicePixelRatio;
    const g = cv.getContext("2d")!;
    g.scale(devicePixelRatio, devicePixelRatio); g.lineWidth = 2.2; g.lineCap = "round"; g.strokeStyle = "#111";
  }, []);
  const pos = (e: React.PointerEvent) => { const b = c.current!.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const start = (e: React.PointerEvent) => { tegner.current = true; c.current!.setPointerCapture(e.pointerId); const g = c.current!.getContext("2d")!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); };
  const flytt = (e: React.PointerEvent) => { if (!tegner.current) return; const g = c.current!.getContext("2d")!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); setTegnet(true); };
  const slipp = () => { tegner.current = false; };
  const tom = () => { const cv = c.current!; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); setTegnet(false); };
  const godkjenn = async () => {
    const cv = c.current!;
    const hvit = document.createElement("canvas"); hvit.width = cv.width; hvit.height = cv.height;
    const g = hvit.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, hvit.width, hvit.height); g.drawImage(cv, 0, 0);
    const ok = await kjor(() => api.lagreReklamasjon({ id: r.id, prosjekt_id: r.prosjekt_id, signert_navn: navn.trim(), signatur: hvit.toDataURL("image/png") }).then(() => {}), "Kunden har kvittert");
    if (ok) lukk();
  };
  return (
    <div className="lysboks" role="dialog" aria-label="Kundens kvittering">
      <div className="panel" style={{ width: "min(560px, 100%)", color: "var(--fg)" }}>
        <h2 style={{ margin: 0 }}>Reklamasjon utbedret</h2>
        <p style={{ margin: 0 }}><b>{r.tittel}</b></p>
        {r.vurdering && <p className="small" style={{ margin: 0 }}>{r.vurdering}</p>}
        <p className="small" style={{ margin: 0 }}>Med signaturen bekrefter kunden at feilen er rettet.</p>
        <label className="field"><span className="label">Kundens navn</span><input type="text" value={navn} onChange={(e) => setNavn(e.target.value)} autoComplete="off" /></label>
        <span className="label">Signer med fingeren</span>
        <canvas ref={c} className="signatur" onPointerDown={start} onPointerMove={flytt} onPointerUp={slipp} onPointerLeave={slipp} />
        <div className="row">
          <button className="btn primary" disabled={!navn.trim() || !tegnet} onClick={godkjenn}>Bekreft</button>
          <button className="btn" onClick={tom}>Tøm</button>
          <button className="btn" onClick={lukk}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

/** Velg reklamasjon når man fører timer eller logger inn på reklamasjonsprosjektet */
export function ReklamasjonValg({ value, onChange, label = "Gjelder det en reklamasjon?", prosjektId }: { value: string; onChange: (id: string) => void; label?: string; prosjektId?: string }) {
  const { d, meg } = useApp();
  const liste = (d.reklamasjoner ?? []).filter((r) => r.id === value || ((r.status === "godkjent" || r.status === "ny") && (!prosjektId || r.prosjekt_id === prosjektId)))
    .sort((a, b) => Number(b.ansvarlig_id === meg.id) - Number(a.ansvarlig_id === meg.id) || a.meldt_dato.localeCompare(b.meldt_dato));
  const tekst = (r: R) => { const p = d.prosjekter.find((x) => x.id === r.prosjekt_id); return `${r.tittel}${p ? ` – ${p.navn}` : ""}`; };
  return (
    <label className="field"><span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{prosjektId ? "Nei, vanlig arbeid" : "Ikke knyttet til en bestemt reklamasjon"}</option>
        {liste.map((r) => <option key={r.id} value={r.id}>{tekst(r)}{r.ansvarlig_id === meg.id ? " (din)" : ""}</option>)}
      </select></label>
  );
}
