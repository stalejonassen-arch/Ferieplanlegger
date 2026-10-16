import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api, type FdvVare } from "../lib/api";
import { kortDato, langDato } from "../lib/ferie";
import { TILLEGG_STATUS, VAER, type Tillegg, type TilleggStatus } from "../lib/hms";
import { t2, timeStatus, type Prosjekt } from "../lib/timer";
import { Bilder } from "./Bilder";
import { Avvik } from "./Avvik";
import { Sluttdok } from "./Sluttdok";
import { Lonnsomhet } from "./Lonnsomhet";
import { HendelseListe } from "./Dagslogg";
import { Dokumenter, Statistikk } from "./ProsjektDeler";
import { Traad } from "./Chat";
import { prosjektKanal, uleste as ulesteChat } from "../lib/chat";
import { dagHendelser, lokalDato } from "../lib/dag";
import { avstandTekst, finnPunkt, kjoreavstander, telLenke, type Avstand, type Punkt } from "../lib/kart";
import { PROFIL } from "../lib/profil";
import { Kart } from "./Kart";
import { ProsjektPlan } from "./Plan";
import { Materialliste } from "./Materiell";

type Del = "oversikt" | "plan" | "materiell" | "chat" | "historikk" | "dagbok" | "tillegg" | "bilder" | "dokumenter" | "avvik" | "statistikk" | "okonomi" | "sluttdok";

export function ProsjektSide({ p, tilbake }: { p: Prosjekt; tilbake: () => void }) {
  const { d, leder, meg, chat } = useApp();
  const [del, setDel] = useState<Del>("oversikt");
  const k = d.kunder.find((x) => x.id === p.kunde_id);
  const adr = p.adresse || [k?.adresse, [k?.postnr, k?.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const antall = {
    dagbok: d.dagbok.filter((x) => x.prosjekt_id === p.id).length,
    tillegg: d.tillegg.filter((x) => x.prosjekt_id === p.id && x.status !== "avvist").length,
    bilder: d.bilder.filter((x) => x.prosjekt_id === p.id).length,
    avvik: d.avvik.filter((x) => x.prosjekt_id === p.id && x.status !== "lukket").length,
  };
  const [antallDok, setAntallDok] = useState<number | null>(null);
  useEffect(() => { setAntallDok(null); api.fdv(p.id).then((x) => setAntallDok(x.dok.length)).catch(() => {}); }, [p.id]);
  const deler: [Del, string, number | null][] = [
    ["oversikt", "Oversikt", null],
    ["plan", "Plan", (d.oppgaver ?? []).filter((o) => o.prosjekt_id === p.id && o.status !== "ferdig").length || null],
    ["materiell", "Materiell", (d.leveranser ?? []).filter((l) => l.prosjekt_id === p.id && l.status !== "levert").length || null],
    ["chat", "Chat", ulesteChat(chat.meldinger, chat.lest, meg.id).get(prosjektKanal(p.id)) ?? null], ["historikk", "Historikk", null], ["dagbok", "Dagbok", antall.dagbok],
    ["tillegg", "Tillegg", antall.tillegg], ["bilder", "Bilder", antall.bilder], ["dokumenter", "Dokumenter", antallDok],
    ["avvik", "Avvik", antall.avvik], ["statistikk", "Statistikk", null],
    ...(leder ? [["okonomi", "Økonomi", null] as [Del, string, number | null]] : []), ["sluttdok", "Sluttdokumentasjon", null],
  ];


  return (
    <>
      <div><button className="btn sm" onClick={tilbake}>‹ Alle prosjekter</button></div>
      <section className="panel prosjekthode">
        <h2 style={{ margin: 0 }}>{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}</h2>
        <div className="row small" style={{ gap: "4px 14px" }}>
          {k && <span><b>{k.navn}</b>{k.visma_nr ? <span className="muted"> · kundenr {k.visma_nr}</span> : null}</span>}
          {k?.epost && <a href={`mailto:${k.epost}`}>{k.epost}</a>}
        </div>
        <Kontakt p={p} />
        <Ansvar p={p} />
        <TimerStatus p={p} />
        <Adresse p={p} adr={adr} />
        {leder && <SlaaSammen p={p} tilbake={tilbake} />}
      </section>
      <nav className="seksjoner" aria-label="Deler av prosjektet">
        {deler.map(([x, t, n]) => (
          <button key={x} aria-pressed={del === x} onClick={() => setDel(x)}>
            <svg className="ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{DEL_IKON[x]}</svg>
            <span className="t">{t}</span>{n ? <span className="n">{n}</span> : null}
          </button>
        ))}
      </nav>
      {del === "oversikt" && <Oversikt p={p} />}
      {del === "plan" && <ProsjektPlan p={p} />}
      {del === "materiell" && <Materialliste p={p} />}
      {del === "chat" && <section className="panel" style={{ padding: 0, overflow: "hidden" }}><Traad kanal={prosjektKanal(p.id)} hoyde={520} /></section>}
      {del === "historikk" && <Historikk p={p} />}
      {del === "dagbok" && <DagbokDel p={p} />}
      {del === "tillegg" && <TilleggDel p={p} />}
      {del === "bilder" && <section className="panel"><Bilder bilder={d.bilder.filter((b) => b.prosjekt_id === p.id)} til={{ prosjekt_id: p.id }} tittel="Bilder fra prosjektet" /></section>}
      {del === "dokumenter" && <Dokumenter p={p} onEndret={setAntallDok} />}
      {del === "avvik" && <Avvik prosjektId={p.id} />}
      {del === "statistikk" && <Statistikk p={p} />}
      {del === "okonomi" && <Lonnsomhet p={p} />}
      {del === "sluttdok" && <Sluttdok p={p} />}
    </>
  );
}

/** Strekikoner for delene av prosjektet */
const DEL_IKON: Record<string, React.ReactNode> = {
  oversikt: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  plan: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M7 14h6M7 17h9" /></>,
  materiell: <><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  historikk: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  dagbok: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2" /></>,
  tillegg: <><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></>,
  bilder: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></>,
  dokumenter: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  avvik: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /></>,
  statistikk: <><path d="M4 20V14M9 20V9M14 20v-8M19 20V5" /></>,
  okonomi: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  sluttdok: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>,
};

// ------------------------------------------------------------ Materiell (forbruk fra Visma)

/** Varer som er tatt ut på prosjektet i Visma (antall, ikke priser – synlig for alle). */
function Materiell({ p }: { p: Prosjekt }) {
  const [varer, setVarer] = useState<FdvVare[] | null>(null);
  const [alle, setAlle] = useState(false);
  // Sist hentet øverst (varer uten dato til slutt)
  useEffect(() => { api.fdv(p.id).then((x) => setVarer([...x.varer].sort((a, b) => (b.sist_dato ?? "").localeCompare(a.sist_dato ?? "") || a.beskrivelse.localeCompare(b.beskrivelse, "nb")))).catch(() => setVarer([])); }, [p.id]);
  if (!varer?.length) return null;
  const vis = alle ? varer : varer.slice(0, 15);
  return (
    <>
      <h3 style={{ margin: "8px 0 0" }}>Materiell brukt <span className="small muted">({varer.length} varer fra Visma, sist hentet øverst)</span></h3>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl"><thead><tr><th>Vare</th><th>Antall</th><th>Sist hentet</th></tr></thead><tbody>
          {vis.map((v) => <tr key={v.varenr}><td style={{ whiteSpace: "normal" }}>{v.beskrivelse}</td><td>{t2(v.antall)} {v.enhet.toLowerCase()}</td><td className="small">{v.sist_dato ? kortDato(v.sist_dato) : "–"}</td></tr>)}
        </tbody></table>
      </div>
      {varer.length > 15 && <div><button className="btn sm" onClick={() => setAlle(!alle)}>{alle ? "Vis færre" : `Vis alle ${varer.length}`}</button></div>}
    </>
  );
}

// ------------------------------------------------------------ Historikk per dag

const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

/** Alt som har skjedd på prosjektet, dag for dag: hvem som var der, timer, dagbok, bilder, avvik og tillegg. */
function Historikk({ p }: { p: Prosjekt }) {
  const { d } = useApp();
  const [antall, setAntall] = useState(14);
  const alle = new Set(d.ansatte.map((a) => a.id));
  const datoer = [...new Set([
    ...d.timer.filter((t) => t.prosjekt_id === p.id).map((t) => t.dato),
    ...d.dagbok.filter((x) => x.prosjekt_id === p.id).map((x) => x.dato),
    ...d.bilder.filter((b) => b.prosjekt_id === p.id && !b.avvik_id).map((b) => lokalDato(b.opprettet)),
    ...d.avvik.filter((x) => x.prosjekt_id === p.id).map((x) => lokalDato(x.opprettet)),
    ...d.tillegg.filter((x) => x.prosjekt_id === p.id).map((x) => lokalDato(x.opprettet)),
  ])].sort().reverse();
  if (!datoer.length) return <section className="panel"><p className="muted">Ingenting registrert på prosjektet ennå.</p></section>;
  return (
    <>
      {datoer.slice(0, antall).map((dato) => {
        const h = dagHendelser(d, dato, alle).filter((x) => x.prosjekt_id === p.id);
        const folk = [...new Set(h.map((x) => x.ansatt_id))].map((id) => d.ansatte.find((a) => a.id === id)?.navn.split(" ")[0]).filter(Boolean);
        const timer = h.reduce((n, x) => n + (x.type === "timer" ? Number(x.t.timer) : 0), 0);
        return (
          <section key={dato} className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{UKEDAG[new Date(dato + "T00:00:00Z").getUTCDay()]} {langDato(dato)}</h3>
              <span className="small muted">{folk.join(", ")}{timer ? ` · ${t2(timer)} t` : ""}</span>
            </div>
            <HendelseListe h={h} visNavn />
          </section>
        );
      })}
      {datoer.length > antall && <div><button className="btn" onClick={() => setAntall(antall + 14)}>Vis eldre dager ({datoer.length - antall})</button></div>}
    </>
  );
}

// ------------------------------------------------------------ Oversikt og plan

function Oversikt({ p }: { p: Prosjekt }) {
  const { d, leder, kjor } = useApp();
  const egne = d.timer.filter((t) => t.prosjekt_id === p.id);
  const sum = egne.reduce((n, t) => n + Number(t.timer), 0);
  const fakt = egne.filter((t) => t.fakturerbar !== false).reduce((n, t) => n + Number(t.timer), 0);
  const est = p.estimert_timer ? Number(p.estimert_timer) : null;
  const tilleggT = d.tillegg.filter((t) => t.prosjekt_id === p.id && (t.status === "signert" || t.status === "fakturert")).reduce((n, t) => n + (t.timer ?? 0), 0);
  const ramme = est != null ? est + tilleggT : null;
  const pct = ramme ? Math.min(100, (sum / ramme) * 100) : 0;
  const perAnsatt = new Map<string, number>();
  for (const t of egne) perAnsatt.set(t.ansatt_id, (perAnsatt.get(t.ansatt_id) ?? 0) + Number(t.timer));
  const [f, setF] = useState({ estimert: est != null ? String(est) : "", start: p.planlagt_start ?? "", slutt: p.planlagt_slutt ?? "", notat: p.notat ?? "" });
  useEffect(() => setF({ estimert: est != null ? String(est) : "", start: p.planlagt_start ?? "", slutt: p.planlagt_slutt ?? "", notat: p.notat ?? "" }), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const lagre = () => kjor(() => api.lagreProsjekt({
    id: p.id, navn: p.navn, kunde_id: p.kunde_id, estimert_timer: Number(f.estimert.replace(",", ".")) || null,
    planlagt_start: f.start || null, planlagt_slutt: f.slutt || null, notat: f.notat.trim(),
  }), "Planen er lagret");

  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Timer og plan</h2>
      <div className="legend">
        <div><span className="label">Brukt</span><span className="v">{t2(sum)} t</span></div>
        <div><span className="label">Kalkulert</span><span className="v">{est != null ? `${t2(est)} t` : "–"}</span></div>
        {tilleggT > 0 && <div><span className="label">+ tillegg</span><span className="v">{t2(tilleggT)} t</span></div>}
        <div><span className="label">Igjen</span><span className="v" style={ramme != null && sum > ramme ? { color: "var(--warn)" } : undefined}>{ramme != null ? `${t2(ramme - sum)} t` : "–"}</span></div>
        <div><span className="label">Fakturerbart</span><span className="v">{t2(fakt)} t</span></div>
      </div>
      {ramme != null && (
        <div className="bar" aria-label={`${Math.round(pct)} % av kalkulerte timer brukt`}>
          <span className={sum > ramme ? "bg-warn" : "bg-approved"} style={{ width: `${pct}%` }} />
        </div>
      )}
      {(p.planlagt_start || p.planlagt_slutt) && (
        <p className="small" style={{ margin: 0 }}>Planlagt: {p.planlagt_start ? langDato(p.planlagt_start) : "?"} – {p.planlagt_slutt ? langDato(p.planlagt_slutt) : "?"}</p>
      )}
      {p.notat && !leder && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.notat}</p>}
      {perAnsatt.size > 0 && (
        <>
          <h3 style={{ margin: "8px 0 0" }}>Timer per person</h3>
          <div className="legend">{[...perAnsatt].sort((a, b) => b[1] - a[1]).map(([id, n]) => <div key={id}><span className="label">{d.ansatte.find((a) => a.id === id)?.navn}</span><span className="v">{t2(n)}</span></div>)}</div>
        </>
      )}
      <Materiell p={p} />
      {leder && (
        <div className="panel" style={{ background: "var(--sunk)" }}>
          <div className="row">
            <label className="field"><span className="label">Kalkulerte timer</span>
              <input type="text" inputMode="decimal" value={f.estimert} onChange={(e) => setF({ ...f, estimert: e.target.value })} placeholder="F.eks. 120" /></label>
            <label className="field"><span className="label">Planlagt start</span>
              <input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
            <label className="field"><span className="label">Planlagt ferdig</span>
              <input type="date" value={f.slutt} onChange={(e) => setF({ ...f, slutt: e.target.value })} /></label>
          </div>
          <label className="field"><span className="label">Notat til snekkerne</span>
            <textarea rows={2} value={f.notat} onChange={(e) => setF({ ...f, notat: e.target.value })} placeholder="Nøkkel, adkomst, kontaktperson, spesielle hensyn …" /></label>
          <div><button className="btn primary sm" onClick={lagre}>Lagre plan</button></div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Dagbok

function DagbokDel({ p }: { p: Prosjekt }) {
  const { d, meg, leder, idag, kjor } = useApp();
  const [ny, setNy] = useState({ dato: idag, vaer: "", tekst: "", hindringer: "" });
  const [filer, setFiler] = useState<FileList | null>(null);
  const [sender, setSender] = useState(false);
  const liste = d.dagbok.filter((x) => x.prosjekt_id === p.id);
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "";

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ny.tekst.trim()) return;
    setSender(true);
    const ok = await kjor(async () => {
      const id = await api.lagreDagbok({ prosjekt_id: p.id, dato: ny.dato, vaer: ny.vaer, tekst: ny.tekst.trim(), hindringer: ny.hindringer.trim() });
      for (const f of Array.from(filer ?? [])) await api.lastOppBilde(f, { prosjekt_id: p.id, dagbok_id: id });
    }, "Dagboken er oppdatert");
    setSender(false);
    if (ok) { setNy({ dato: idag, vaer: "", tekst: "", hindringer: "" }); setFiler(null); }
  };

  return (
    <>
      <form className="panel" onSubmit={lagre}>
        <h2 style={{ margin: 0 }}>Skriv i dagboken</h2>
        <div className="row">
          <label className="field"><span className="label">Dato</span><input type="date" value={ny.dato} onChange={(e) => setNy({ ...ny, dato: e.target.value })} required /></label>
          <label className="field"><span className="label">Vær</span>
            <select value={ny.vaer} onChange={(e) => setNy({ ...ny, vaer: e.target.value })}>
              <option value="">–</option>{VAER.map((v) => <option key={v}>{v}</option>)}
            </select></label>
        </div>
        <label className="field"><span className="label">Hva ble gjort i dag?</span>
          <textarea rows={3} value={ny.tekst} onChange={(e) => setNy({ ...ny, tekst: e.target.value })} placeholder="F.eks. Montert 6 vinduer i 2. etasje, beslått utvendig." required /></label>
        <label className="field"><span className="label">Hindringer eller ventetid</span>
          <input type="text" value={ny.hindringer} onChange={(e) => setNy({ ...ny, hindringer: e.target.value })} placeholder="F.eks. Venter på levering, kunden ikke hjemme, regn stoppet arbeid" /></label>
        <div className="row">
          <label className="btn sm">{filer?.length ? `${filer.length} bilde${filer.length > 1 ? "r" : ""} valgt` : "Legg ved bilder"}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setFiler(e.target.files)} /></label>
          <button className="btn primary" disabled={!ny.tekst.trim() || sender}>{sender ? "Lagrer …" : "Lagre"}</button>
        </div>
      </form>
      <section className="panel">
        <h2 style={{ margin: 0 }}>Dagbok</h2>
        {liste.length ? (
          <div className="list">
            {liste.map((x) => (
              <div key={x.id} className="item godkjent">
                <div style={{ minWidth: 0 }}>
                  <div className="t">{langDato(x.dato)}{x.vaer ? ` · ${x.vaer}` : ""}</div>
                  <div className="s">{navn(x.ansatt_id)}</div>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{x.tekst}</p>
                  {x.hindringer && <p className="small" style={{ margin: "4px 0 0", color: "var(--warn)" }}>Hindring: {x.hindringer}</p>}
                </div>
                <div className="acts">
                  {(leder || x.ansatt_id === meg.id) && <button className="btn sm no" onClick={() => kjor(() => api.slettDagbok(x.id), "Slettet")}>Slett</button>}
                </div>
                {d.bilder.some((b) => b.dagbok_id === x.id) && (
                  <div className="full"><Bilder bilder={d.bilder.filter((b) => b.dagbok_id === x.id)} til={{ prosjekt_id: p.id, dagbok_id: x.id }} tittel="Bilder" /></div>
                )}
              </div>
            ))}
          </div>
        ) : <div className="empty">Ingen dagbokinnslag ennå.</div>}
      </section>
    </>
  );
}

// ------------------------------------------------------------ Tilleggsarbeid

const tilleggKlasse: Record<TilleggStatus, string> = { utkast: "venter", signert: "godkjent", avvist: "avslatt", fakturert: "godkjent" };

function TilleggDel({ p }: { p: Prosjekt }) {
  const { d, leder, kjor } = useApp();
  const [ny, setNy] = useState({ tittel: "", beskrivelse: "", timer: "", materiell: "", pris: "" });
  const [signer, setSigner] = useState<Tillegg | null>(null);
  const liste = d.tillegg.filter((x) => x.prosjekt_id === p.id);
  const tall = (s: string) => (s.trim() ? Number(s.replace(",", ".")) || null : null);

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ny.tittel.trim()) return;
    const ok = await kjor(() => api.lagreTillegg({ prosjekt_id: p.id, tittel: ny.tittel.trim(), beskrivelse: ny.beskrivelse.trim(), timer: tall(ny.timer), materiell: ny.materiell.trim(), pris: tall(ny.pris) }).then(() => {}), "Tilleggsarbeidet er registrert");
    if (ok) setNy({ tittel: "", beskrivelse: "", timer: "", materiell: "", pris: "" });
  };

  return (
    <>
      <form className="panel" onSubmit={lagre}>
        <h2 style={{ margin: 0 }}>Nytt tilleggsarbeid</h2>
        <p className="small muted">Arbeid som ikke var med i tilbudet. Registrer det med en gang, og la kunden signere på skjermen, så blir det ikke glemt på fakturaen.</p>
        <label className="field"><span className="label">Hva skal gjøres?</span>
          <input type="text" value={ny.tittel} onChange={(e) => setNy({ ...ny, tittel: e.target.value })} placeholder="F.eks. Skifte råtten svill under vindu" required /></label>
        <label className="field"><span className="label">Beskrivelse</span>
          <textarea rows={2} value={ny.beskrivelse} onChange={(e) => setNy({ ...ny, beskrivelse: e.target.value })} /></label>
        <div className="row">
          <label className="field"><span className="label">Timer (anslag)</span><input type="text" inputMode="decimal" value={ny.timer} onChange={(e) => setNy({ ...ny, timer: e.target.value })} /></label>
          <label className="field"><span className="label">Pris eks. mva (valgfritt)</span><input type="text" inputMode="decimal" value={ny.pris} onChange={(e) => setNy({ ...ny, pris: e.target.value })} /></label>
        </div>
        <label className="field"><span className="label">Materiell</span>
          <input type="text" value={ny.materiell} onChange={(e) => setNy({ ...ny, materiell: e.target.value })} placeholder="F.eks. 2 stk 48x148 impregnert, 3 m" /></label>
        <div><button className="btn primary" disabled={!ny.tittel.trim()}>Registrer</button></div>
      </form>

      <section className="panel">
        <h2 style={{ margin: 0 }}>Tilleggsarbeid</h2>
        {liste.length ? (
          <div className="list">
            {liste.map((x) => (
              <div key={x.id} className={`item ${tilleggKlasse[x.status]}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{x.tittel}</div>
                  <div className="s">{[x.timer != null ? `${t2(x.timer)} t` : "", x.pris != null ? `kr ${x.pris.toLocaleString("nb-NO")} eks. mva` : "", x.materiell].filter(Boolean).join(" · ")}</div>
                  {x.beskrivelse && <div className="s">{x.beskrivelse}</div>}
                  {x.signert_tid && <div className="s">Signert av {x.signert_navn} {new Date(x.signert_tid).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}</div>}
                </div>
                <div className="acts">
                  <span className={`chip ${tilleggKlasse[x.status]}`}>{TILLEGG_STATUS[x.status]}</span>
                  {x.status === "utkast" && <button className="btn sm ok" onClick={() => setSigner(x)}>Kunden signerer</button>}
                  {leder && x.status === "signert" && <button className="btn sm" onClick={() => kjor(() => api.lagreTillegg({ id: x.id, prosjekt_id: p.id, tittel: x.tittel, status: "fakturert" }).then(() => {}), "Merket som fakturert")}>Fakturert</button>}
                  {leder && x.status === "utkast" && <button className="btn sm no" onClick={() => kjor(() => api.lagreTillegg({ id: x.id, prosjekt_id: p.id, tittel: x.tittel, status: "avvist" }).then(() => {}), "Avvist")}>Avvis</button>}
                </div>
                {x.signatur && <div className="full"><img src={x.signatur} alt={`Signatur ${x.signert_navn}`} style={{ maxWidth: 240, background: "#fff", border: "1px solid var(--line)", borderRadius: 6 }} /></div>}
              </div>
            ))}
          </div>
        ) : <div className="empty">Ingen tilleggsarbeid registrert.</div>}
      </section>
      {signer && <SignerDialog t={signer} lukk={() => setSigner(null)} />}
    </>
  );
}

function SignerDialog({ t, lukk }: { t: Tillegg; lukk: () => void }) {
  const { kjor } = useApp();
  const c = useRef<HTMLCanvasElement>(null);
  const [navn, setNavn] = useState("");
  const [tegnet, setTegnet] = useState(false);
  const tegner = useRef(false);

  useEffect(() => {
    const cv = c.current!;
    const r = cv.getBoundingClientRect();
    cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
    const g = cv.getContext("2d")!;
    g.scale(devicePixelRatio, devicePixelRatio); g.lineWidth = 2.2; g.lineCap = "round"; g.strokeStyle = "#111";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = c.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const start = (e: React.PointerEvent) => { tegner.current = true; c.current!.setPointerCapture(e.pointerId); const g = c.current!.getContext("2d")!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); };
  const flytt = (e: React.PointerEvent) => { if (!tegner.current) return; const g = c.current!.getContext("2d")!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); setTegnet(true); };
  const slipp = () => { tegner.current = false; };
  const tom = () => { const cv = c.current!; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); setTegnet(false); };
  const godkjenn = async () => {
    const cv = c.current!;
    const hvit = document.createElement("canvas"); hvit.width = cv.width; hvit.height = cv.height;
    const g = hvit.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, hvit.width, hvit.height); g.drawImage(cv, 0, 0);
    const ok = await kjor(() => api.lagreTillegg({ id: t.id, prosjekt_id: t.prosjekt_id, tittel: t.tittel, status: "signert", signert_navn: navn.trim(), signatur: hvit.toDataURL("image/png") }).then(() => {}), "Signert av kunden");
    if (ok) lukk();
  };

  return (
    <div className="lysboks" role="dialog" aria-label="Kundesignatur">
      <div className="panel" style={{ width: "min(560px, 100%)", color: "var(--fg)" }}>
        <h2 style={{ margin: 0 }}>Godkjenning av tilleggsarbeid</h2>
        <p style={{ margin: 0 }}><b>{t.tittel}</b>{t.beskrivelse ? ` – ${t.beskrivelse}` : ""}</p>
        <p className="small" style={{ margin: 0 }}>{[[t.timer != null ? `Anslått ${t2(t.timer)} timer` : "", t.pris != null ? `pris kr ${t.pris.toLocaleString("nb-NO")} eks. mva` : "", t.materiell ? `materiell: ${t.materiell}` : ""].filter(Boolean).join(", "), t.pris == null ? "Faktureres etter medgått tid og materiell." : ""].filter(Boolean).join(". ")}</p>
        <label className="field"><span className="label">Kundens navn</span><input type="text" value={navn} onChange={(e) => setNavn(e.target.value)} autoComplete="off" /></label>
        <span className="label">Signer med fingeren</span>
        <canvas ref={c} className="signatur" onPointerDown={start} onPointerMove={flytt} onPointerUp={slipp} onPointerLeave={slipp} />
        <div className="row">
          <button className="btn primary" disabled={!navn.trim() || !tegnet} onClick={godkjenn}>Godkjenn</button>
          <button className="btn" onClick={tom}>Tøm</button>
          <button className="btn" onClick={lukk}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Adresse med kart

/** Adressen der jobben gjøres med kart, kontaktperson på stedet og knapper til veibeskrivelse og telefon. Leder kan rette den. */
function Adresse({ p, adr }: { p: Prosjekt; adr: string }) {
  const { leder, kjor } = useApp();
  const [endre, setEndre] = useState(false);
  const [avstand, setAvstand] = useState<Avstand | null>(null);
  const { d } = useApp();
  const [ny, setNy] = useState({ adresse: p.adresse || adr, navn: p.kontakt_navn ?? "", tlf: p.kontakt_telefon ?? "", selger: p.selger_id ?? "", snekker: p.snekker_id ?? "" });
  const [punkt, setPunkt] = useState<Punkt | null | undefined>(undefined);
  const [stortKart, setStortKart] = useState(false);
  useEffect(() => { setEndre(false); setNy({ adresse: p.adresse || adr, navn: p.kontakt_navn ?? "", tlf: p.kontakt_telefon ?? "", selger: p.selger_id ?? "", snekker: p.snekker_id ?? "" }); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let aktiv = true;
    setPunkt(undefined);
    setAvstand(null);
    finnPunkt(adr, { kommunenr: p.kommunenr, gnr: p.gnr, bnr: p.bnr }).then(async (x) => {
      if (!aktiv) return;
      setPunkt(x);
      if (x) { const [av] = await kjoreavstander(PROFIL.base, [x]); if (aktiv) setAvstand(av ?? null); }
    }).catch(() => { if (aktiv) setPunkt(null); });
    return () => { aktiv = false; };
  }, [adr, p.kommunenr, p.gnr, p.bnr]);
  const q = encodeURIComponent(adr);
  const maal = punkt ? `${punkt.lat},${punkt.lon}` : q;
  const lagre = async () => {
    if (await kjor(() => api.lagreEiendom(p.id, { adresse: ny.adresse.trim(), adresse_manuell: ny.adresse.trim() !== "", kontakt_navn: ny.navn.trim(), kontakt_telefon: ny.tlf.trim(), selger_id: ny.selger || null, snekker_id: ny.snekker || null }), "Lagret")) setEndre(false);
  };

  if (endre) return (
    <div className="adresse" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <label className="field"><span className="label">Adresse for utførelse</span>
        <input type="text" value={ny.adresse} onChange={(e) => setNy({ ...ny, adresse: e.target.value })} placeholder={PROFIL.id === "austnes" ? "Gate 1, 6290 Haramsøy" : "Gate 1, 6005 Ålesund"} autoFocus /></label>
      <div className="row">
        <label className="field"><span className="label">Kontaktperson på stedet</span>
          <input type="text" value={ny.navn} onChange={(e) => setNy({ ...ny, navn: e.target.value })} placeholder="Navn" /></label>
        <label className="field"><span className="label">Telefon</span>
          <input type="tel" value={ny.tlf} onChange={(e) => setNy({ ...ny, tlf: e.target.value })} placeholder="Mobilnummer" /></label>
      </div>
      <div className="row">
        <label className="field"><span className="label">Selger</span>
          <select value={ny.selger} onChange={(e) => setNy({ ...ny, selger: e.target.value })}>
            <option value="">Ikke valgt</option>
            {d.ansatte.filter((a) => a.aktiv || a.id === ny.selger).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select></label>
        <label className="field"><span className="label">Snekker (ansvarlig)</span>
          <select value={ny.snekker} onChange={(e) => setNy({ ...ny, snekker: e.target.value })}>
            <option value="">Ikke valgt</option>
            {d.ansatte.filter((a) => a.aktiv || a.id === ny.snekker).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select></label>
      </div>
      <div className="row"><button className="btn primary sm" onClick={lagre}>Lagre</button><button className="btn sm" onClick={() => setEndre(false)}>Avbryt</button></div>
    </div>
  );
  return (
    <div className="adresse" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <span className="label">Adresse</span>
          {adr ? <div className="adr">{adr}</div> : <div className="muted">Ingen adresse på prosjektet</div>}
          {avstand && <div className="small"><b>{avstandTekst(avstand, true)}</b> <span className="muted">{avstand.luftlinje ? "" : `kjøring fra ${PROFIL.firma}`}</span></div>}
          {adr && !p.adresse && <div className="small muted">Kundens adresse – ikke bekreftet som adresse for utførelse</div>}
        </div>
        <div className="row">
          {adr && <a className="btn sm primary" href={`https://www.google.com/maps/dir/?api=1&destination=${maal}`} target="_blank" rel="noreferrer">Kjør hit</a>}
          {leder && <button className="btn sm" onClick={() => setEndre(true)}>{adr || p.kontakt_navn ? "Endre" : "Legg inn adresse, kontakt, selger og snekker"}</button>}
        </div>
      </div>
      {adr && punkt && (
        <div className="prosjektkart" style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
          <Kart punkt={punkt} hoyde={stortKart ? 420 : 220} tittel={`Kart over ${adr}`} />
          <div className="row" style={{ position: "absolute", right: 8, bottom: 22, gap: 6, zIndex: 500 }}>
            <button className="btn sm" onClick={() => setStortKart((x) => !x)}>{stortKart ? "Mindre kart" : "Større kart"}</button>
            <a className="btn sm" href={`https://www.google.com/maps/search/?api=1&query=${maal}`} target="_blank" rel="noreferrer">Åpne i kart</a>
          </div>
        </div>
      )}
      {adr && punkt === null && <div className="small muted">Fant ikke adressen i kartet. <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer">Søk i Google Maps</a></div>}
      {leder && !p.kontakt_navn && !p.kontakt_telefon && adr && <div className="small muted">Ingen kontaktperson på prosjektet. Trykk «Endre» for å legge inn navn og telefon.</div>}
    </div>
  );
}

/** Timer brukt mot kalkyle, med fargestatus */
function TimerStatus({ p }: { p: Prosjekt }) {
  const { d } = useApp();
  const brukt = d.timer.filter((t) => t.prosjekt_id === p.id).reduce((n, t) => n + Number(t.timer), 0);
  const est = p.estimert_timer ? Number(p.estimert_timer) : null;
  const tillegg = d.tillegg.filter((t) => t.prosjekt_id === p.id && (t.status === "signert" || t.status === "fakturert")).reduce((n, t) => n + (t.timer ?? 0), 0);
  const ramme = est != null ? est + tillegg : null;
  const s = timeStatus(brukt, ramme);
  return (
    <div className={`timestatus ${s.status}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span><span className="tall">{t2(brukt)}</span>{ramme ? <span className="av"> av {t2(ramme)} t</span> : <span className="av"> t brukt</span>}
          {tillegg > 0 && <span className="small muted"> (inkl. {t2(tillegg)} t tillegg)</span>}</span>
        <span className={`chip ${s.status === "ok" ? "godkjent" : s.status === "snart" ? "venter" : s.status === "over" ? "avslatt" : "demo"}`}>
          {s.pct != null ? `${Math.round(s.pct)} % · ` : ""}{s.tekst}</span>
      </div>
      {ramme ? <div className="tbar"><i style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} /></div> : null}
    </div>
  );
}


/** Ord i et navn, for å foreslå hvilket Visma-prosjekt et app-prosjekt hører til */
const ord = (s: string) => new Set(s.toLowerCase().split(/[^a-zæøå0-9]+/).filter((w) => w.length > 2));

/**
 * Leder: slå prosjektet inn i et annet. Laget i appen → koble til Visma-prosjektet når det dukker opp der.
 * To prosjekter som egentlig er samme jobb (samme kunde) → slå sammen, så alt havner på ett.
 */
function SlaaSammen({ p, tilbake }: { p: Prosjekt; tilbake: () => void }) {
  const { d, kjor } = useApp();
  const app = p.visma_nr == null;
  const [aapen, setAapen] = useState(app);
  const [til, setTil] = useState("");
  const [sikker, setSikker] = useState(false);
  const mine = ord(p.navn);
  const utstyr = new Set(d.ansatte.map((a) => a.utstyr_prosjekt_id).filter(Boolean));
  if (utstyr.has(p.id)) return null;
  const treff = (x: Prosjekt) => (x.kunde_id && x.kunde_id === p.kunde_id ? 10 : 0)
    + (x.adresse && p.adresse && x.adresse.trim().toLowerCase() === p.adresse.trim().toLowerCase() ? 5 : 0)
    + [...ord(x.navn)].filter((w) => mine.has(w)).length;
  const valg = d.prosjekter.filter((x) => x.id !== p.id && !utstyr.has(x.id) && (x.aktiv || treff(x) >= 10))
    .sort((a, b) => treff(b) - treff(a) || Number(b.visma_nr != null) - Number(a.visma_nr != null) || (b.visma_nr ?? 0) - (a.visma_nr ?? 0));
  const forslag = valg.filter((x) => treff(x) > 0).slice(0, 6);
  const resten = valg.filter((x) => !forslag.includes(x));
  const mal = valg.find((x) => x.id === til);
  const navn = (x: Prosjekt) => `${x.visma_nr ?? "App"} · ${x.navn}${x.aktiv ? "" : " (avsluttet)"}`;
  const kunde = (x: Prosjekt) => d.kunder.find((k) => k.id === x.kunde_id)?.navn;
  const slaa = async () => {
    if (!mal) return;
    const ok = await kjor(() => api.slaaSammenProsjekter(p.id, mal.id), `Slått sammen med ${mal.visma_nr ?? ""} ${mal.navn}`.replace("  ", " "));
    if (ok) tilbake();
  };
  if (!aapen) return (
    <div><button className="linkbtn small" onClick={() => setAapen(true)}>Samme jobb som et annet prosjekt? Slå sammen</button></div>
  );
  return (
    <div className="koble-visma" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        {app ? "Laget i appen, finnes ikke i Visma. Når prosjektet er opprettet i Visma, slår du det sammen med Visma-prosjektet. " : "Er dette og et annet prosjekt egentlig samme jobb, kan de slås sammen. "}
        Timer, stempling, dagbok, bilder, avvik, tillegg, dokumenter og chat flyttes til prosjektet du velger.
      </p>
      {!sikker ? (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="field" style={{ flex: "1 1 260px" }}><span className="label">Slå sammen med</span>
            <select id="slaa-sammen-med" value={til} onChange={(e) => setTil(e.target.value)}>
              <option value="">Velg prosjektet som skal beholdes …</option>
              {forslag.length > 0 && <optgroup label="Forslag (samme kunde, adresse eller navn)">{forslag.map((x) => <option key={x.id} value={x.id}>{navn(x)}</option>)}</optgroup>}
              <optgroup label={forslag.length ? "Alle" : "Prosjekter"}>{resten.map((x) => <option key={x.id} value={x.id}>{navn(x)}</option>)}</optgroup>
            </select></label>
          <button className="btn" disabled={!mal} onClick={() => setSikker(true)}>Slå sammen</button>
          {!app && <button className="btn" onClick={() => { setAapen(false); setTil(""); }}>Avbryt</button>}
        </div>
      ) : mal && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="small" style={{ margin: 0 }}>
            Alt på <b>{navn(p)}</b>{kunde(p) ? ` (${kunde(p)})` : ""} flyttes til <b>{navn(mal)}</b>{kunde(mal) ? ` (${kunde(mal)})` : ""}.
            Opplysninger som bare står på det første (adresse, kunde, estimat, notat) tas med. «{p.navn}» blir borte fra listen.
            {p.visma_nr != null && " Det ligger fortsatt i Visma, men ordre og fakturerte timer derfra vises på prosjektet du beholder."}
            {" "}Dette kan ikke angres.
          </p>
          {mal.visma_nr == null && p.visma_nr != null && <p className="small feil" style={{ margin: 0 }}>Du beholder et prosjekt som ikke finnes i Visma. Vanligvis bør du beholde Visma-prosjektet.</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={slaa}>Ja, slå sammen</button>
            <button className="btn" onClick={() => setSikker(false)}>Avbryt</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Kontaktperson på stedet (eller kundens telefon) med Ring og SMS, rett under kunden øverst */
function Kontakt({ p }: { p: Prosjekt }) {
  const { d, leder } = useApp();
  const k = d.kunder.find((x) => x.id === p.kunde_id);
  const egen = !!(p.kontakt_navn || p.kontakt_telefon);
  const navn = egen ? p.kontakt_navn ?? "" : "";
  const tlf = egen ? p.kontakt_telefon ?? "" : k?.telefon ?? "";
  if (!navn && !tlf) return leder ? <div className="small muted">Ingen kontaktperson. Legg inn med «Endre» ved adressen.</div> : null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center" }}>
      <span className="small">{egen ? "Kontaktperson: " : "Kunde: "}{navn && <b>{navn}</b>}{navn && tlf ? " · " : ""}{tlf && <a href={telLenke(tlf)}>{tlf}</a>}</span>
      {tlf && (
        <span className="row" style={{ gap: 6 }}>
          <a className="btn sm primary" href={telLenke(tlf)}>Ring</a>
          <a className="btn sm" href={"sms:" + tlf.replace(/[^\d+]/g, "")}>SMS</a>
        </span>
      )}
    </div>
  );
}

/** Selger og snekker som har prosjektet */
function Ansvar({ p }: { p: Prosjekt }) {
  const { d } = useApp();
  const navn = (id?: string | null) => (id ? d.ansatte.find((a) => a.id === id)?.navn ?? "" : "");
  const selger = navn(p.selger_id), snekker = navn(p.snekker_id);
  if (!selger && !snekker) return null;
  return (
    <div className="small" style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
      {selger && <span>Selger: <b>{selger}</b></span>}
      {snekker && <span>Snekker: <b>{snekker}</b></span>}
    </div>
  );
}
