// Serviceoppdrag: små betalte oppdrag hos en kunde, gjort på en dag (maks to).
// Butikk/leder, snekkere eller kunden selv (skjema på nettet) registrerer. Leder/prosjektleder deler ut,
// den ansvarlige fører timer og materiell, melder ferdig og kan få kunden til å kvittere.
// Ferdige oppdrag ligger i «Til fakturering» til de er merket fakturert med ordrenummer fra Visma.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, sorterAnsatte } from "../lib/ferie";
import { telLenke } from "../lib/kart";
import {
  PRIORITET, PRIORITET_IKON, SERVICE_CHIP, SERVICE_STATUS, aapenService, drarUt, grunnlag, kundeNavn, serviceTimer, sisteDag, sorterService,
  type NyService, type ServiceMateriell, type ServicePrioritet, type ServiceStatus, type Serviceoppdrag as S,
} from "../lib/service";
import { t2, varighet, type Kunde } from "../lib/timer";
import { Bilder } from "./Bilder";
import { usePlanlegger } from "./Plan";

type Filter = "aapne" | "faktura" | "alle";
/** Oppdraget som skal åpnes når man kommer fra «Dine serviceoppdrag» på startsiden */
let apneNeste: string | null = null;
const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
const tall = (x: string) => Number(x.replace(",", ".").replace(/\s/g, "")) || 0;

/** Liste over serviceoppdrag (øverst under Prosjekter) */
export function ServiceOppdrag() {
  const { d, meg, idag } = useApp();
  const planlegger = usePlanlegger();
  const alle = d.serviceoppdrag ?? [];
  const tilFaktura = alle.filter((s) => s.status === "ferdig");
  const [filter, setFilter] = useState<Filter>("aapne");
  const [ny, setNy] = useState(false);
  const [apen, setApen] = useState<string | null>(() => { const a = apneNeste; apneNeste = null; return a; });
  useEffect(() => { if (apen) setTimeout(() => document.getElementById(`service-${apen}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const liste = alle
    .filter((s) => filter === "alle" || (filter === "faktura" ? s.status === "ferdig" : aapenService(s) || (s.status === "ferdig" && s.ansvarlig_id === meg.id && !s.signatur && s.ferdig_tid?.slice(0, 10) === idag)))
    .sort(sorterService);
  const haster = alle.filter((s) => aapenService(s) && s.prioritet === "haster").length;

  return (
    <section className="panel service" id="service">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Serviceoppdrag{haster ? <span className="chip avslatt" style={{ marginLeft: 8 }}>🔴 {haster} haster</span> : null}</h2>
        <div className="filter">
          {([["aapne", "Åpne"], ...(planlegger ? [["faktura", `Til fakturering${tilFaktura.length ? ` (${tilFaktura.length})` : ""}`]] : []), ["alle", "Alle"]] as [Filter, string][]).map(([f, t]) => (
            <button key={f} className="btn sm" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t}</button>
          ))}
          {!ny && <button className="btn sm primary" onClick={() => setNy(true)}>+ Nytt serviceoppdrag</button>}
        </div>
      </div>
      {!d.serviceProsjekt && planlegger && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>Velg serviceprosjekt under Oppsett, så kan timene føres på oppdragene.</p>}
      {ny && <NyServiceSkjema lukk={(id) => { setNy(false); if (id) { setApen(id); setFilter("aapne"); } }} />}
      {liste.length > 0 ? (
        <div className="list">
          {liste.map((s) => <ServiceRad key={s.id} s={s} apen={apen === s.id} veksle={() => setApen(apen === s.id ? null : s.id)} />)}
        </div>
      ) : !ny && (
        <div className="empty">{filter === "faktura" ? "Ingenting venter på fakturering." : filter === "aapne" ? "Ingen åpne serviceoppdrag." : "Ingen serviceoppdrag ennå."}</div>
      )}
    </section>
  );
}

/** Søk i kundene fra Visma, eller skriv inn en ny kunde */
function KundeVelger({ kundeId, navn, onVelg }: { kundeId: string | null; navn: string; onVelg: (k: Kunde | null, navn: string) => void }) {
  const { d } = useApp();
  const [q, setQ] = useState("");
  const valgt = kundeId ? d.kunder.find((k) => k.id === kundeId) : null;
  const treff = useMemo(() => {
    const t = q.trim().toLowerCase(), siffer = q.replace(/\D/g, "");
    if (t.length < 2) return [];
    return d.kunder.filter((k) => k.navn.toLowerCase().includes(t) || (siffer.length >= 4 && k.telefon.replace(/\D/g, "").includes(siffer)) || String(k.visma_nr ?? "") === t).slice(0, 8);
  }, [q, d.kunder]);
  if (valgt) return (
    <div className="field"><span className="label">Kunde</span>
      <div className="row" style={{ gap: 8, alignItems: "center" }}><b>{valgt.navn}</b>{valgt.visma_nr ? <span className="small muted">kundenr {valgt.visma_nr}</span> : null}
        <button type="button" className="linkbtn small" onClick={() => onVelg(null, "")}>Bytt</button></div></div>
  );
  return (
    <div className="field" style={{ display: "grid", gap: 6 }}>
      <span className="label">Kunde</span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk på navn, telefon eller kundenr i Visma" />
      {treff.length > 0 && (
        <div className="kunde-treff">
          {treff.map((k) => <button type="button" key={k.id} className="btn sm" onClick={() => { onVelg(k, ""); setQ(""); }}>{k.navn}{k.telefon ? <span className="small muted"> · {k.telefon}</span> : null}</button>)}
        </div>
      )}
      <label className="field" style={{ margin: 0 }}><span className="label small muted">…eller ny kunde (ikke i Visma ennå)</span>
        <input value={navn} onChange={(e) => onVelg(null, e.target.value)} placeholder="Kundens navn" maxLength={200} /></label>
    </div>
  );
}

function NyServiceSkjema({ lukk }: { lukk: (id?: string) => void }) {
  const { d, meg, idag, kjor } = useApp();
  const planlegger = usePlanlegger();
  const [f, setF] = useState<NyService>({ tittel: "", beskrivelse: "", kunde_id: null, kunde_navn: "", telefon: "", adresse: "", prioritet: "uke", dager: 1, dato: idag, ansvarlig_id: planlegger ? null : meg.id });
  const [selv, setSelv] = useState(!planlegger);
  const [filer, setFiler] = useState<FileList | null>(null);
  const [sender, setSender] = useState(false);
  const sett = (x: Partial<NyService>) => setF({ ...f, ...x });
  const kanLagre = f.tittel.trim() && (f.kunde_id || f.kunde_navn?.trim());
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kanLagre) return;
    setSender(true);
    let id = "";
    const ansvarlig = planlegger ? f.ansvarlig_id || null : selv ? meg.id : null;
    const ok = await kjor(async () => {
      id = await api.lagreService({ ...f, tittel: f.tittel.trim(), beskrivelse: (f.beskrivelse ?? "").trim(), kunde_navn: (f.kunde_navn ?? "").trim(),
        ansvarlig_id: ansvarlig, status: ansvarlig && f.dato ? "planlagt" : "ny", dato: ansvarlig ? f.dato : null });
      for (const fil of Array.from(filer ?? [])) await api.lastOppBilde(fil, { service_id: id, prosjekt_id: d.serviceProsjekt ?? null });
    }, "Serviceoppdraget er registrert");
    setSender(false);
    if (ok) lukk(id);
  };
  return (
    <form onSubmit={send} className="panel" style={{ background: "var(--sunk)", display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>Nytt serviceoppdrag</h3>
      <KundeVelger kundeId={f.kunde_id ?? null} navn={f.kunde_navn ?? ""} onVelg={(k, navn) => sett(k
        ? { kunde_id: k.id, kunde_navn: "", telefon: f.telefon || k.telefon, adresse: f.adresse || [k.adresse, [k.postnr, k.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ") }
        : { kunde_id: null, kunde_navn: navn })} />
      <div className="row">
        <label className="field"><span className="label">Telefon</span><input type="tel" value={f.telefon ?? ""} onChange={(e) => sett({ telefon: e.target.value })} maxLength={40} /></label>
        <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Adresse</span><input value={f.adresse ?? ""} onChange={(e) => sett({ adresse: e.target.value })} maxLength={300} /></label>
      </div>
      <label className="field"><span className="label">Hva skal gjøres?</span>
        <input value={f.tittel} onChange={(e) => sett({ tittel: e.target.value })} placeholder="Kort, f.eks. «Ytterdør går ikke i lås»" maxLength={200} required /></label>
      <label className="field"><span className="label">Beskrivelse</span>
        <textarea rows={3} value={f.beskrivelse ?? ""} onChange={(e) => sett({ beskrivelse: e.target.value })} placeholder="Detaljer, materiell som trengs, nøkkel, når kunden er hjemme …" maxLength={5000} /></label>
      <PrioritetValg verdi={f.prioritet as ServicePrioritet} onChange={(p) => sett({ prioritet: p })} />
      {planlegger ? (
        <div className="row">
          <label className="field"><span className="label">Hvem gjør det?</span>
            <select value={f.ansvarlig_id ?? ""} onChange={(e) => sett({ ansvarlig_id: e.target.value || null })}>
              <option value="">Ikke bestemt ennå</option>
              {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
            </select></label>
          {f.ansvarlig_id && <DatoDager dato={f.dato ?? idag} dager={f.dager ?? 1} onChange={(x) => sett(x)} />}
        </div>
      ) : (
        <>
          <label className="hake"><input type="checkbox" checked={selv} onChange={(e) => setSelv(e.target.checked)} /><span>Jeg tar oppdraget selv</span></label>
          {selv && <DatoDager dato={f.dato ?? idag} dager={f.dager ?? 1} onChange={(x) => sett(x)} />}
        </>
      )}
      <div className="row">
        <label className="btn sm">{filer?.length ? `${filer.length} bilde${filer.length > 1 ? "r" : ""} valgt` : "Legg ved bilder"}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => setFiler(e.target.files)} /></label>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!kanLagre || sender}>{sender ? "Lagrer …" : "Registrer"}</button>
        <button type="button" className="btn" onClick={() => lukk()}>Avbryt</button>
      </div>
    </form>
  );
}

function PrioritetValg({ verdi, onChange }: { verdi: ServicePrioritet; onChange: (p: ServicePrioritet) => void }) {
  return (
    <div className="field"><span className="label">Hvor mye haster det?</span>
      <div className="filter" role="radiogroup">
        {(Object.keys(PRIORITET) as ServicePrioritet[]).map((p) => (
          <button type="button" key={p} role="radio" aria-checked={verdi === p} className="btn sm" aria-pressed={verdi === p} onClick={() => onChange(p)}>{PRIORITET_IKON[p]} {PRIORITET[p]}</button>
        ))}
      </div>
    </div>
  );
}

function DatoDager({ dato, dager, onChange }: { dato: string; dager: number; onChange: (x: { dato?: string; dager?: number }) => void }) {
  return (
    <>
      <label className="field kort"><span className="label">Dato</span><input type="date" value={dato} onChange={(e) => onChange({ dato: e.target.value })} required /></label>
      <label className="field kort"><span className="label">Varighet</span>
        <select value={dager} onChange={(e) => onChange({ dager: Number(e.target.value) })}><option value={1}>1 dag</option><option value={2}>2 dager (maks)</option></select></label>
    </>
  );
}

function ServiceRad({ s, apen, veksle }: { s: S; apen: boolean; veksle: () => void }) {
  const { d, meg, idag, kjor, leder } = useApp();
  const planlegger = usePlanlegger();
  const navn = (id: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const ansvarlig = s.ansvarlig_id === meg.id;
  const timer = serviceTimer(d.timer, s.id);
  const sent = drarUt(s, idag);
  const [signer, setSigner] = useState(false);
  const lagre = (x: Partial<NyService>, tekst: string) => kjor(() => api.lagreService({ id: s.id, tittel: s.tittel, ...x }).then(() => {}), tekst);
  const naar = s.dato ? `${kortDato(s.dato)}${s.dager > 1 ? `–${kortDato(sisteDag(s)!)}` : ""}` : "";

  return (
    <div id={`service-${s.id}`} className={`item ${SERVICE_CHIP[s.status]}${s.prioritet === "haster" && aapenService(s) ? " haster" : ""}`}>
      <div style={{ minWidth: 0, cursor: "pointer" }} onClick={veksle}>
        <div className="t">{PRIORITET_IKON[s.prioritet]} {s.tittel}</div>
        <div className="s">{kundeNavn(s, d.kunder)}{s.adresse ? ` · ${s.adresse}` : ""}</div>
        <div className="s">
          {s.ansvarlig_id ? navn(s.ansvarlig_id).split(" ")[0] : "Ikke delt ut"}{naar ? ` · ${naar}` : ""}{timer ? ` · ${t2(timer)} t` : ""}
          {s.kilde === "skjema" && s.status === "ny" ? " · fra nettskjema" : ""}
        </div>
        {sent && <div className="s" style={{ color: "var(--warn)" }}>Drar ut – var planlagt ferdig {kortDato(sisteDag(s)!)}</div>}
      </div>
      <div className="acts">
        <span className={`chip ${SERVICE_CHIP[s.status]}`}>{SERVICE_STATUS[s.status]}</span>
        <button className="btn sm" onClick={veksle}>{apen ? "Skjul" : "Vis"}</button>
      </div>
      {apen && (
        <div className="full" style={{ display: "grid", gap: 10 }}>
          <div className="small">
            {s.telefon && <div>📞 <a href={telLenke(s.telefon)}>{s.telefon}</a>{s.epost ? ` · ${s.epost}` : ""}</div>}
            {s.adresse && <div>📍 <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.adresse)}`} target="_blank" rel="noreferrer">{s.adresse}</a></div>}
            <div className="muted">Registrert {kortDato(s.opprettet.slice(0, 10))} {s.kilde === "skjema" ? "av kunden på nettskjemaet" : `av ${navn(s.registrert_av) || "ukjent"}`}
              {!s.kunde_id && " · ikke koblet til kunde i Visma"}</div>
          </div>
          {s.beskrivelse && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{s.beskrivelse}</p>}
          <Bilder bilder={d.bilder.filter((b) => b.service_id === s.id)} til={{ service_id: s.id, prosjekt_id: d.serviceProsjekt ?? null }} tittel="Bilder" />

          {!planlegger && s.status === "ny" && !s.ansvarlig_id && (
            <div><button className="btn primary sm" onClick={() => lagre({ ansvarlig_id: meg.id, status: "planlagt", dato: s.dato && s.dato >= idag ? s.dato : idag, dager: s.dager }, "Oppdraget er ditt")}>Jeg tar oppdraget</button></div>
          )}
          {(ansvarlig || planlegger) && s.status !== "ny" && s.status !== "avvist" && <TimerDel s={s} />}
          {(ansvarlig || planlegger) && s.status !== "ny" && s.status !== "avvist" && <MateriellDel s={s} kanEndre={planlegger || s.status === "planlagt"} />}

          {ansvarlig && s.status === "planlagt" && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary sm" disabled={!timer} title={timer ? undefined : "Før timene først"} onClick={() => lagre({ status: "ferdig" }, "Meldt ferdig – går til fakturering")}>✓ Oppdraget er ferdig</button>
              {!timer && <span className="small muted">Før timene før du melder ferdig.</span>}
            </div>
          )}
          {s.signatur ? (
            <div className="small">Kunden kvitterte {s.signert_tid ? kortDato(s.signert_tid.slice(0, 10)) : ""}: <b>{s.signert_navn}</b>
              <div><img src={s.signatur} alt={`Signatur ${s.signert_navn}`} style={{ maxWidth: 220, background: "#fff", border: "1px solid var(--line)", borderRadius: 6 }} /></div></div>
          ) : (s.status === "ferdig" || s.status === "fakturert") && (ansvarlig || planlegger) && (
            <div><button className="btn sm" onClick={() => setSigner(true)}>Kunden kvitterer for jobben</button></div>
          )}
          {signer && <Kvittering s={s} lukk={() => setSigner(false)} />}

          {planlegger && <Behandling s={s} />}
          {planlegger && (s.status === "ferdig" || s.status === "fakturert") && <Fakturering s={s} />}
          {leder && <div><button className="btn sm no" onClick={() => { if (confirm("Slette serviceoppdraget?")) kjor(() => api.slettService(s.id), "Slettet"); }}>Slett</button></div>}
        </div>
      )}
    </div>
  );
}

/** Leder/prosjektleder: kunde, hastegrad, hvem og når */
function Behandling({ s }: { s: S }) {
  const { d, idag, kjor } = useApp();
  const fra = () => ({ kunde_id: s.kunde_id, kunde_navn: s.kunde_navn, prioritet: s.prioritet, ansvarlig_id: s.ansvarlig_id, dato: s.dato ?? idag, dager: s.dager, status: s.status, merknad: s.merknad, tittel: s.tittel, beskrivelse: s.beskrivelse, telefon: s.telefon, adresse: s.adresse });
  const [e, setE] = useState(fra);
  useEffect(() => setE(fra()), [s.endret]); // eslint-disable-line react-hooks/exhaustive-deps
  const sett = (x: Partial<typeof e>) => setE({ ...e, ...x });
  const lagre = () => {
    const status: ServiceStatus = e.status === "ny" && e.ansvarlig_id ? "planlagt" : e.status === "planlagt" && !e.ansvarlig_id ? "ny" : e.status;
    return kjor(() => api.lagreService({ id: s.id, ...e, status, dato: e.ansvarlig_id ? e.dato : null }).then(() => {}), status === "avvist" ? "Avvist" : "Lagret");
  };
  return (
    <details className="panel" style={{ background: "var(--sunk)" }} open={s.status === "ny"}>
      <summary><b>{s.status === "ny" ? "Del ut oppdraget" : "Endre oppdraget"}</b></summary>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {!s.kunde_id && <KundeVelger kundeId={e.kunde_id} navn={e.kunde_navn} onVelg={(k, navn) => sett(k ? { kunde_id: k.id } : { kunde_id: null, kunde_navn: navn || s.kunde_navn })} />}
        {s.kunde_id && <div className="small">Kunde: <b>{kundeNavn(s, d.kunder)}</b> <button type="button" className="linkbtn small" onClick={() => sett({ kunde_id: null })}>Bytt</button></div>}
        {!e.kunde_id && s.kunde_id && <KundeVelger kundeId={null} navn={e.kunde_navn} onVelg={(k, navn) => sett(k ? { kunde_id: k.id } : { kunde_id: null, kunde_navn: navn })} />}
        <PrioritetValg verdi={e.prioritet} onChange={(p) => sett({ prioritet: p })} />
        <div className="row">
          <label className="field"><span className="label">Hvem gjør det?</span>
            <select value={e.ansvarlig_id ?? ""} onChange={(x) => sett({ ansvarlig_id: x.target.value || null })}>
              <option value="">Ikke bestemt ennå</option>
              {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
            </select></label>
          {e.ansvarlig_id && <DatoDager dato={e.dato} dager={e.dager} onChange={(x) => sett(x)} />}
        </div>
        <div className="row">
          <label className="field kort"><span className="label">Status</span>
            <select value={e.status} onChange={(x) => sett({ status: x.target.value as ServiceStatus })}>
              {(Object.keys(SERVICE_STATUS) as ServiceStatus[]).map((k) => <option key={k} value={k}>{SERVICE_STATUS[k]}</option>)}
            </select></label>
          <label className="field"><span className="label">Intern merknad</span>
            <input value={e.merknad} onChange={(x) => sett({ merknad: x.target.value })} maxLength={2000} placeholder={e.status === "avvist" ? "Hvorfor vi ikke tar oppdraget" : "Valgfritt"} /></label>
        </div>
        <div><button className="btn primary sm" onClick={lagre}>Lagre</button></div>
      </div>
    </details>
  );
}

/** Timer på oppdraget: liste og rask føring */
function TimerDel({ s }: { s: S }) {
  const { d, meg, idag, kjor } = useApp();
  const planlegger = usePlanlegger();
  const [vis, setVis] = useState(false);
  const [f, setF] = useState({ ansatt_id: s.ansvarlig_id ?? meg.id, dato: s.dato && s.dato <= idag ? s.dato : idag, fra: "08:00", til: "11:00", lunsj: false });
  const liste = d.timer.filter((t) => t.service_id === s.id).sort((a, b) => a.dato.localeCompare(b.dato) || a.fra.localeCompare(b.fra));
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn.split(" ")[0] ?? "";
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await kjor(() => api.lagreTime({ ansatt_id: f.ansatt_id, prosjekt_id: d.serviceProsjekt ?? null, dato: f.dato, fra: f.fra, til: f.til, lunsj_min: f.lunsj ? 30 : 0, km: 0, reisetid: 0, beskrivelse: `Service: ${s.tittel}`.slice(0, 200), service_id: s.id }), "Timene er ført");
    if (ok) setVis(false);
  };
  return (
    <div className="small" style={{ display: "grid", gap: 6 }}>
      <div><b>Timer: {t2(liste.reduce((n, t) => n + Number(t.timer), 0))}</b>
        {liste.length > 0 && <span className="muted"> – {liste.map((t) => `${kortDato(t.dato)} ${navn(t.ansatt_id)} ${t2(t.timer)} t`).join(" · ")}</span>}</div>
      {s.status !== "fakturert" && (vis ? (
        <form onSubmit={lagre} className="row" style={{ alignItems: "flex-end" }}>
          {planlegger && (
            <label className="field kort"><span className="label">Hvem</span>
              <select value={f.ansatt_id} onChange={(e) => setF({ ...f, ansatt_id: e.target.value })}>
                {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
              </select></label>
          )}
          <label className="field kort"><span className="label">Dato</span><input type="date" value={f.dato} max={idag} onChange={(e) => setF({ ...f, dato: e.target.value })} /></label>
          <label className="field kort"><span className="label">Fra</span><input type="time" step={900} value={f.fra} onChange={(e) => setF({ ...f, fra: e.target.value })} /></label>
          <label className="field kort"><span className="label">Til</span><input type="time" step={900} value={f.til} onChange={(e) => setF({ ...f, til: e.target.value })} /></label>
          <label className="hake"><input type="checkbox" checked={f.lunsj} onChange={(e) => setF({ ...f, lunsj: e.target.checked })} /><span>Lunsj</span></label>
          <span className="muted">= {t2(varighet(f.fra, f.til, f.lunsj ? 30 : 0))} t</span>
          <button className="btn primary sm" disabled={!d.serviceProsjekt || f.til <= f.fra}>Før timer</button>
          <button type="button" className="btn sm" onClick={() => setVis(false)}>Avbryt</button>
        </form>
      ) : <div><button className="btn sm" onClick={() => setVis(true)} disabled={!d.serviceProsjekt} title={d.serviceProsjekt ? undefined : "Leder må velge serviceprosjekt i Oppsett"}>+ Før timer</button></div>)}
    </div>
  );
}

/** Materiell brukt på oppdraget (faktureres kunden) */
function MateriellDel({ s, kanEndre }: { s: S; kanEndre: boolean }) {
  const { kjor } = useApp();
  const [rader, setRader] = useState<{ beskrivelse: string; antall: string; enhet: string; pris: string }[]>(() => s.materiell.map((m) => ({ beskrivelse: m.beskrivelse, antall: String(m.antall).replace(".", ","), enhet: m.enhet, pris: m.pris ? String(m.pris).replace(".", ",") : "" })));
  const [endrer, setEndrer] = useState(false);
  const linjer: ServiceMateriell[] = rader.filter((r) => r.beskrivelse.trim()).map((r) => ({ beskrivelse: r.beskrivelse.trim(), antall: tall(r.antall) || 1, enhet: r.enhet.trim() || "stk", ...(tall(r.pris) ? { pris: tall(r.pris) } : {}) }));
  const lagre = async () => { if (await kjor(() => api.lagreService({ id: s.id, tittel: s.tittel, materiell: linjer }).then(() => {}), "Materiell lagret")) setEndrer(false); };
  if (!endrer) return (
    <div className="small">
      <b>Materiell:</b> {s.materiell.length ? s.materiell.map((m) => `${t2(m.antall)} ${m.enhet} ${m.beskrivelse}${m.pris ? ` (${kr(m.pris * m.antall)})` : ""}`).join(" · ") : <span className="muted">ingenting ført</span>}
      {kanEndre && <> <button className="linkbtn small" onClick={() => { setRader([...rader, { beskrivelse: "", antall: "1", enhet: "stk", pris: "" }]); setEndrer(true); }}>{s.materiell.length ? "Endre" : "+ Legg til"}</button></>}
    </div>
  );
  return (
    <div className="small" style={{ display: "grid", gap: 6 }}>
      <b>Materiell brukt</b>
      {rader.map((r, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <input style={{ flex: "3 1 160px" }} placeholder="Vare" value={r.beskrivelse} onChange={(e) => setRader(rader.map((x, n) => (n === i ? { ...x, beskrivelse: e.target.value } : x)))} />
          <input style={{ width: 64 }} inputMode="decimal" placeholder="Antall" value={r.antall} onChange={(e) => setRader(rader.map((x, n) => (n === i ? { ...x, antall: e.target.value } : x)))} />
          <input style={{ width: 64 }} placeholder="Enhet" value={r.enhet} onChange={(e) => setRader(rader.map((x, n) => (n === i ? { ...x, enhet: e.target.value } : x)))} />
          <input style={{ width: 90 }} inputMode="decimal" placeholder="Pris/stk" value={r.pris} onChange={(e) => setRader(rader.map((x, n) => (n === i ? { ...x, pris: e.target.value } : x)))} />
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={() => setRader([...rader, { beskrivelse: "", antall: "1", enhet: "stk", pris: "" }])}>+ Linje</button>
        <button type="button" className="btn primary sm" onClick={lagre}>Lagre materiell</button>
        <button type="button" className="btn sm" onClick={() => setEndrer(false)}>Avbryt</button>
      </div>
    </div>
  );
}

/** Grunnlag for faktura og «Merk fakturert» */
function Fakturering({ s }: { s: S }) {
  const { d, kjor } = useApp();
  const g = grunnlag(s, d.timer, d.timepris ?? null);
  const [nr, setNr] = useState(s.visma_ordrenr);
  return (
    <div className="panel" style={{ background: "var(--sunk)", display: "grid", gap: 8 }}>
      <b>{s.status === "fakturert" ? `Fakturert ${s.fakturert_tid ? kortDato(s.fakturert_tid.slice(0, 10)) : ""}${s.visma_ordrenr ? ` · ordre ${s.visma_ordrenr}` : ""}` : "Klar til fakturering"}</b>
      <div className="small">
        Kunde: <b>{kundeNavn(s, d.kunder)}</b>{!s.kunde_id && <span style={{ color: "var(--warn)" }}> – koble til kunden i Visma (under «Endre oppdraget») før fakturering</span>}<br />
        Arbeid: {t2(g.timer)} t{g.arbeid != null ? ` × ${kr(d.timepris!)} = ${kr(g.arbeid)}` : " (sett timepris i Oppsett for å regne ut beløpet)"}<br />
        Materiell: {g.materiell ? kr(g.materiell) : s.materiell.length ? "uten pris – hentes fra Visma" : "ingen"}<br />
        {g.sum > 0 && <b>Sum eks. mva: {kr(g.sum)}</b>}
      </div>
      {s.status === "ferdig" && (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field kort"><span className="label">Ordrenr i Visma</span><input value={nr} onChange={(e) => setNr(e.target.value)} maxLength={40} inputMode="numeric" /></label>
          <button className="btn primary sm" disabled={!s.kunde_id} onClick={() => kjor(() => api.lagreService({ id: s.id, tittel: s.tittel, status: "fakturert", visma_ordrenr: nr.trim() }).then(() => {}), "Merket som fakturert")}>Merk fakturert</button>
        </div>
      )}
    </div>
  );
}

function Kvittering({ s, lukk }: { s: S; lukk: () => void }) {
  const { kjor } = useApp();
  const c = useRef<HTMLCanvasElement>(null);
  const [navn, setNavn] = useState(s.kunde_navn);
  const [tegnet, setTegnet] = useState(false);
  const tegner = useRef(false);
  useEffect(() => {
    const cv = c.current!, b = cv.getBoundingClientRect();
    cv.width = b.width * devicePixelRatio; cv.height = b.height * devicePixelRatio;
    const g = cv.getContext("2d")!; g.scale(devicePixelRatio, devicePixelRatio); g.lineWidth = 2.2; g.lineCap = "round"; g.strokeStyle = "#111";
  }, []);
  const pos = (e: React.PointerEvent) => { const b = c.current!.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const start = (e: React.PointerEvent) => { tegner.current = true; c.current!.setPointerCapture(e.pointerId); const g = c.current!.getContext("2d")!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); };
  const flytt = (e: React.PointerEvent) => { if (!tegner.current) return; const g = c.current!.getContext("2d")!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); setTegnet(true); };
  const godkjenn = async () => {
    const cv = c.current!, hvit = document.createElement("canvas"); hvit.width = cv.width; hvit.height = cv.height;
    const g = hvit.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, hvit.width, hvit.height); g.drawImage(cv, 0, 0);
    if (await kjor(() => api.lagreService({ id: s.id, tittel: s.tittel, signert_navn: navn.trim(), signatur: hvit.toDataURL("image/png") }).then(() => {}), "Kunden har kvittert")) lukk();
  };
  return (
    <div className="lysboks" role="dialog" aria-label="Kundens kvittering">
      <div className="panel" style={{ width: "min(560px, 100%)", color: "var(--fg)" }}>
        <h2 style={{ margin: 0 }}>Serviceoppdrag utført</h2>
        <p style={{ margin: 0 }}><b>{s.tittel}</b></p>
        <p className="small" style={{ margin: 0 }}>Med signaturen bekrefter kunden at jobben er gjort.</p>
        <label className="field"><span className="label">Kundens navn</span><input value={navn} onChange={(e) => setNavn(e.target.value)} autoComplete="off" /></label>
        <span className="label">Signer med fingeren</span>
        <canvas ref={c} className="signatur" onPointerDown={start} onPointerMove={flytt} onPointerUp={() => { tegner.current = false; }} onPointerLeave={() => { tegner.current = false; }} />
        <div className="row">
          <button className="btn primary" disabled={!navn.trim() || !tegnet} onClick={godkjenn}>Bekreft</button>
          <button className="btn" onClick={() => { const cv = c.current!; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); setTegnet(false); }}>Tøm</button>
          <button className="btn" onClick={lukk}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

/** Velg serviceoppdrag når timer føres eller man logger inn på serviceprosjektet */
export function ServiceValg({ value, onChange, label = "Hvilket serviceoppdrag?" }: { value: string; onChange: (id: string) => void; label?: string }) {
  const { d, meg } = useApp();
  const liste = (d.serviceoppdrag ?? []).filter((s) => s.id === value || s.status === "planlagt" || (s.status === "ny" && !s.ansvarlig_id))
    .sort((a, b) => Number(b.ansvarlig_id === meg.id) - Number(a.ansvarlig_id === meg.id) || sorterService(a, b));
  return (
    <label className="field"><span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Velg oppdrag</option>
        {liste.map((s) => <option key={s.id} value={s.id}>{PRIORITET_IKON[s.prioritet]} {s.tittel} – {kundeNavn(s, d.kunder)}{s.ansvarlig_id === meg.id ? " (ditt)" : ""}</option>)}
      </select></label>
  );
}

/** På startsiden: dine serviceoppdrag i dag og de som haster */
export function MineServiceoppdrag() {
  const { d, meg, idag } = useApp();
  const mine = (d.serviceoppdrag ?? []).filter((s) => s.ansvarlig_id === meg.id && s.status === "planlagt" && s.dato && s.dato <= idag).sort(sorterService);
  if (!mine.length) return null;
  return (
    <section className="panel" style={{ borderLeft: "4px solid var(--accent)" }}>
      <h2 style={{ margin: 0 }}>Dine serviceoppdrag</h2>
      <div className="list">
        {mine.map((s) => (
          <a key={s.id} className="item" href="#prosjekter" onClick={() => { apneNeste = s.id; }}>
            <div><div className="t">{PRIORITET_IKON[s.prioritet]} {s.tittel}</div><div className="s">{kundeNavn(s, d.kunder)}{s.adresse ? ` · ${s.adresse}` : ""}{drarUt(s, idag) ? " · drar ut" : ""}</div></div>
          </a>
        ))}
      </div>
    </section>
  );
}
