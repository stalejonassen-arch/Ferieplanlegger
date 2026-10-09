import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, langDato } from "../lib/ferie";
import { TILLEGG_STATUS, VAER, type Tillegg, type TilleggStatus } from "../lib/hms";
import { t2, type Prosjekt } from "../lib/timer";
import { Bilder } from "./Bilder";
import { Avvik } from "./Avvik";
import { Sluttdok } from "./Sluttdok";
import { Lonnsomhet } from "./Lonnsomhet";

type Del = "oversikt" | "dagbok" | "tillegg" | "bilder" | "avvik" | "okonomi" | "sluttdok";

export function ProsjektSide({ p, tilbake }: { p: Prosjekt; tilbake: () => void }) {
  const { d, leder } = useApp();
  const [del, setDel] = useState<Del>("oversikt");
  const k = d.kunder.find((x) => x.id === p.kunde_id);
  const adr = p.adresse || [k?.adresse, [k?.postnr, k?.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const antall = {
    dagbok: d.dagbok.filter((x) => x.prosjekt_id === p.id).length,
    tillegg: d.tillegg.filter((x) => x.prosjekt_id === p.id && x.status !== "avvist").length,
    bilder: d.bilder.filter((x) => x.prosjekt_id === p.id).length,
    avvik: d.avvik.filter((x) => x.prosjekt_id === p.id && x.status !== "lukket").length,
  };
  const deler: [Del, string][] = [
    ["oversikt", "Oversikt"], ["dagbok", `Dagbok${antall.dagbok ? ` (${antall.dagbok})` : ""}`],
    ["tillegg", `Tillegg${antall.tillegg ? ` (${antall.tillegg})` : ""}`], ["bilder", `Bilder${antall.bilder ? ` (${antall.bilder})` : ""}`],
    ["avvik", `Avvik${antall.avvik ? ` (${antall.avvik})` : ""}`],
    ...(leder ? [["okonomi", "Økonomi"] as [Del, string]] : []), ["sluttdok", "Sluttdokumentasjon"],
  ];

  return (
    <>
      <div><button className="btn sm" onClick={tilbake}>‹ Alle prosjekter</button></div>
      <section className="panel">
        <h2 style={{ margin: 0 }}>{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}</h2>
        <div className="row small" style={{ gap: "4px 14px" }}>
          {k && <span><b>{k.navn}</b>{k.visma_nr ? <span className="muted"> · kundenr {k.visma_nr}</span> : null}</span>}
          {adr && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}`} target="_blank" rel="noreferrer">{adr} ↗</a>}
          {k?.telefon && <a href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a>}
          {k?.epost && <a href={`mailto:${k.epost}`}>{k.epost}</a>}
        </div>
      </section>
      <nav className="tabs undertabs" role="tablist">
        {deler.map(([x, t]) => <button key={x} role="tab" aria-selected={del === x} onClick={() => setDel(x)}>{t}</button>)}
      </nav>
      {del === "oversikt" && <Oversikt p={p} />}
      {del === "dagbok" && <DagbokDel p={p} />}
      {del === "tillegg" && <TilleggDel p={p} />}
      {del === "bilder" && <section className="panel"><Bilder bilder={d.bilder.filter((b) => b.prosjekt_id === p.id)} til={{ prosjekt_id: p.id }} tittel="Bilder fra prosjektet" /></section>}
      {del === "avvik" && <Avvik prosjektId={p.id} />}
      {del === "okonomi" && <Lonnsomhet p={p} />}
      {del === "sluttdok" && <Sluttdok p={p} />}
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
    id: p.id, navn: p.navn, estimert_timer: Number(f.estimert.replace(",", ".")) || null,
    planlagt_start: f.start || null, planlagt_slutt: f.slutt || null, notat: f.notat.trim(),
  }), "Planen er lagret");

  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Timer og plan</h2>
      <div className="legend">
        <div><span className="label">Brukt{leder ? "" : " (dine)"}</span><span className="v">{t2(sum)} t</span></div>
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
      {leder && perAnsatt.size > 0 && (
        <div className="legend">{[...perAnsatt].map(([id, n]) => <div key={id}><span className="label">{d.ansatte.find((a) => a.id === id)?.navn}</span><span className="v">{t2(n)}</span></div>)}</div>
      )}
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
