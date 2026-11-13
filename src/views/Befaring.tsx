// Befaring: før tilbud (hos kunden), underveis på prosjektet og ved overtakelse med kunden.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import {
  BEFARING_KORT, BEFARING_SVAR, BEFARING_TYPE, befaringKunde, befaringTall, nyePunkter, tilbudFraBefaring,
  type Befaring, type BefaringPunkt, type BefaringSvar, type BefaringType,
} from "../lib/befaring";
import { kortDato, langDato } from "../lib/ferie";
import { AVVIK_STATUS } from "../lib/hms";
import { bruker } from "../lib/moduler";
import type { Prosjekt } from "../lib/timer";
import { Bilder } from "./Bilder";
import { ProsjektVelger } from "./ProsjektVelger";
import { KundeVelger } from "./Service";

const fornavn = (navn?: string) => (navn ?? "").split(" ")[0] ?? "";

/** Liste over befaringer: alle (under Prosjekter) eller for ett prosjekt */
export function Befaringer({ p }: { p?: Prosjekt }) {
  const { d, meg } = useApp();
  const [aapen, setAapen] = useState<string | null>(null);
  const [ny, setNy] = useState(false);
  const [visAlle, setVisAlle] = useState(false);
  const alle = (d.befaringer ?? []).filter((b) => (p ? b.prosjekt_id === p.id : true));
  const liste = p || visAlle ? alle : alle.filter((b) => b.status === "apen" || b.utfort_av === meg.id && b.dato >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const valgt = aapen ? (d.befaringer ?? []).find((b) => b.id === aapen) : undefined;
  const navn = (id: string | null) => d.ansatte.find((a) => a.id === id)?.navn;
  const kunde = (b: Befaring) => befaringKunde(b, d.kunder.find((k) => k.id === b.kunde_id)?.navn);

  if (valgt) return <BefaringSkjema b={valgt} lukk={() => setAapen(null)} />;
  return (
    <section className="panel">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Befaring</h2>
        {!ny && <button className="btn primary sm" onClick={() => setNy(true)}>+ Ny befaring</button>}
      </div>
      {!p && <p className="small muted" style={{ margin: 0 }}>Før tilbud hos kunden, underveis på jobben, eller overtakelse når jobben er ferdig. Mål, bilder, notater og kundens signatur samlet – og rapport som PDF.</p>}
      {ny && <NyBefaring p={p} lukk={(id) => { setNy(false); if (id) setAapen(id); }} />}
      {liste.length ? (
        <div className="list">
          {liste.map((b) => {
            const t = befaringTall(b);
            const pr = d.prosjekter.find((x) => x.id === b.prosjekt_id);
            return (
              <button key={b.id} type="button" className="item" style={{ textAlign: "left", width: "100%" }} onClick={() => setAapen(b.id)}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{b.tittel}</div>
                  <div className="s">{[BEFARING_KORT[b.type], kortDato(b.dato), !p && pr ? pr.navn : kunde(b), fornavn(navn(b.utfort_av))].filter(Boolean).join(" · ")}</div>
                  <div className="s">{t.besvart}/{t.antall} punkter{t.avvik ? <span style={{ color: "var(--warn)" }}> · {t.avvik} avvik</span> : null}{b.signert_tid ? " · signert av kunden" : ""}{b.tilbud_id ? " · tilbud laget" : ""}</div>
                </div>
                <span className={`chip ${b.status === "ferdig" ? "godkjent" : "venter"}`}>{b.status === "ferdig" ? "Ferdig" : "Åpen"}</span>
              </button>
            );
          })}
        </div>
      ) : !ny && <div className="empty">{p ? "Ingen befaringer på prosjektet ennå." : "Ingen åpne befaringer."}</div>}
      {!p && alle.length > liste.length && <button className="linkbtn small" onClick={() => setVisAlle(true)}>Vis alle befaringer ({alle.length})</button>}
      {!p && visAlle && <button className="linkbtn small" onClick={() => setVisAlle(false)}>Vis bare åpne</button>}
    </section>
  );
}

/** Start en ny befaring: type, hva den gjelder, og kunde eller prosjekt */
function NyBefaring({ p, lukk }: { p?: Prosjekt; lukk: (id?: string) => void }) {
  const { d, idag, kjor } = useApp();
  const [type, setType] = useState<BefaringType>(p ? "underveis" : "tilbud");
  const [tittel, setTittel] = useState("");
  const [prosjekt, setProsjekt] = useState(p?.id ?? "");
  const [kunde, setKunde] = useState<{ id: string | null; navn: string; telefon: string; adresse: string }>({ id: null, navn: "", telefon: "", adresse: "" });
  const aktive = d.prosjekter.filter((x) => x.aktiv);
  const pr = d.prosjekter.find((x) => x.id === prosjekt);
  const kanLagre = tittel.trim() && (type === "tilbud" ? !!(kunde.id || kunde.navn.trim()) : !!prosjekt);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    let id = "";
    const k = pr ? d.kunder.find((x) => x.id === pr.kunde_id) : undefined;
    const ok = await kjor(async () => {
      id = await api.lagreBefaring({
        type, tittel: tittel.trim(), dato: idag, punkter: nyePunkter(type),
        prosjekt_id: prosjekt || null,
        kunde_id: kunde.id ?? pr?.kunde_id ?? null, kunde_navn: kunde.id ? "" : kunde.navn.trim(),
        telefon: kunde.telefon || pr?.kontakt_telefon || k?.telefon || "",
        adresse: kunde.adresse || pr?.adresse || [k?.adresse, [k?.postnr, k?.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      });
    }, "Befaringen er startet");
    if (ok) lukk(id);
  };
  return (
    <form className="tilbud-skjema" onSubmit={lagre}>
      <div className="row" role="group" aria-label="Type befaring">
        {(Object.keys(BEFARING_TYPE) as BefaringType[]).filter((t) => !p || t !== "tilbud").map((t) => (
          <button key={t} type="button" className="btn sm" aria-pressed={type === t} onClick={() => setType(t)}>{BEFARING_KORT[t]}</button>
        ))}
      </div>
      <label className="field"><span className="label">Hva gjelder befaringen?</span>
        <input value={tittel} onChange={(e) => setTittel(e.target.value)} maxLength={200} placeholder={type === "tilbud" ? "F.eks. skifte vinduer og kledning" : type === "overtakelse" ? "F.eks. overtakelse nytt bad" : "F.eks. kontroll etter tett hus"} autoFocus /></label>
      {type === "tilbud" ? (
        <>
          <KundeVelger kundeId={kunde.id} navn={kunde.navn} onVelg={(k, navn) => setKunde(k
            ? { id: k.id, navn: "", telefon: k.telefon, adresse: [k.adresse, [k.postnr, k.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ") }
            : { ...kunde, id: null, navn })} />
          <div className="grid2">
            <label className="field"><span className="label">Telefon</span><input type="tel" value={kunde.telefon} onChange={(e) => setKunde({ ...kunde, telefon: e.target.value })} maxLength={40} /></label>
            <label className="field"><span className="label">Adresse (der jobben skal gjøres)</span><input value={kunde.adresse} onChange={(e) => setKunde({ ...kunde, adresse: e.target.value })} maxLength={300} /></label>
          </div>
        </>
      ) : !p && <ProsjektVelger value={prosjekt} onChange={setProsjekt} prosjekter={aktive} required />}
      <div className="row">
        <button className="btn primary" disabled={!kanLagre}>Start befaring</button>
        <button type="button" className="btn" onClick={() => lukk()}>Avbryt</button>
      </div>
    </form>
  );
}

/** Selve befaringen: punkter, notat, bilder, signatur, PDF og tilbud */
export function BefaringSkjema({ b, lukk }: { b: Befaring; lukk: () => void }) {
  const { d, meg, leder, idag, kjor } = useApp();
  const planlegger = leder || !!meg.prosjektleder;
  const [e, setE] = useState<Befaring>(b);
  const [endret, setEndret] = useState(false);
  const [signer, setSigner] = useState(false);
  const [nyttPunkt, setNyttPunkt] = useState("");
  const [lager, setLager] = useState(false);
  const [pdfFeil, setPdfFeil] = useState("");
  // Nye data fra databasen (f.eks. avvik-id på punktene) når vi ikke har ulagrede endringer
  useEffect(() => { if (!endret) setE(b); }, [b, endret]);
  const sett = (x: Partial<Befaring>) => { setE((v) => ({ ...v, ...x })); setEndret(true); };
  const settPunkt = (i: number, x: Partial<BefaringPunkt>) => sett({ punkter: e.punkter.map((p, n) => (n === i ? { ...p, ...x } : p)) });
  const kanEndre = planlegger || b.utfort_av === meg.id;
  const laast = !kanEndre || (b.status === "ferdig" && !!b.signert_tid && !planlegger);
  const pr = d.prosjekter.find((x) => x.id === e.prosjekt_id);
  const k = d.kunder.find((x) => x.id === e.kunde_id);
  const bilder = d.bilder.filter((x) => x.befaring_id === b.id);
  const t = befaringTall(e);
  const tilbudBruk = bruker(d, "tilbud");

  const lagre = async (x: Partial<Befaring> = {}, melding = "Befaringen er lagret") => {
    const ny = { ...e, ...x };
    const ok = await kjor(() => api.lagreBefaring({
      id: b.id, type: ny.type, tittel: ny.tittel, dato: ny.dato, prosjekt_id: ny.prosjekt_id, kunde_id: ny.kunde_id, kunde_navn: ny.kunde_navn,
      telefon: ny.telefon, epost: ny.epost, adresse: ny.adresse, deltakere: ny.deltakere, notat: ny.notat,
      punkter: ny.punkter.map(({ tekst, svar, merknad, maal, avvik_id }): BefaringPunkt => ({ tekst: tekst.trim(), svar: svar || "", merknad: (merknad ?? "").trim(), maal: (maal ?? "").trim(), ...(avvik_id ? { avvik_id } : {}) })).filter((p) => p.tekst),
      status: ny.status, tilbud_id: ny.tilbud_id,
      ...(x.signatur !== undefined ? { signatur: x.signatur, signert_navn: x.signert_navn ?? "" } : {}),
    }).then(() => {}), melding);
    if (ok) setEndret(false);
    return ok;
  };

  const lagTilbud = async () => {
    if (endret && !(await lagre())) return;
    let id = "";
    const ok = await kjor(async () => {
      id = await api.lagreTilbud({ kunde: k?.navn || e.kunde_navn || "Kunde", telefon: e.telefon, referanse: e.tittel, beskrivelse: tilbudFraBefaring(e), belop: 0, dato: idag, selger: meg.navn });
      await api.lagreBefaring({ id: b.id, type: e.type, tittel: e.tittel, tilbud_id: id });
    }, "Tilbudet er laget – fyll inn beløpet under Tilbudsoppfølging");
    if (ok) setE((v) => ({ ...v, tilbud_id: id }));
  };

  const lastNed = async () => {
    setPdfFeil(""); setLager(true);
    try {
      if (endret) await lagre();
      const urler = bilder.length ? await api.bildeUrler(bilder.map((x) => x.sti)) : {};
      const data: { data: Uint8Array; tekst?: string }[] = [];
      for (const x of bilder) {
        try { const r = await fetch(urler[x.sti] ?? x.sti); if (r.ok) data.push({ data: new Uint8Array(await r.arrayBuffer()), tekst: x.tekst || undefined }); } catch { /* hoppes over */ }
      }
      const { befaringData, lagBefaringRapport } = await import("../lib/befaringRapport");
      const pdf = await lagBefaringRapport(befaringData(d, e, data));
      const u = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = u; a.download = `${BEFARING_TYPE[e.type]} ${e.tittel} ${e.dato}.pdf`.replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "-"); a.click();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch (x) { setPdfFeil(x instanceof Error ? x.message : String(x)); }
    setLager(false);
  };

  const slett = async () => {
    if (!confirm(`Slette befaringen «${b.tittel}»? Bildene slettes også.`)) return;
    if (await kjor(() => api.slettBefaring(b.id), "Befaringen er slettet")) lukk();
  };

  return (
    <section className="panel sjekkliste">
      <div><button className="btn sm" onClick={() => { if (!endret || confirm("Du har endringer som ikke er lagret. Gå tilbake likevel?")) lukk(); }}>‹ Befaringer</button></div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="small muted">{BEFARING_TYPE[e.type]}</div>
          {laast ? <h2 style={{ margin: 0 }}>{e.tittel}</h2>
            : <input className="tittel-felt" aria-label="Hva gjelder befaringen" value={e.tittel} onChange={(x) => sett({ tittel: x.target.value })} maxLength={200} style={{ fontSize: 20, fontWeight: 700, width: "100%" }} />}
        </div>
        <span className={`chip ${e.status === "ferdig" ? "godkjent" : "venter"}`}>{e.status === "ferdig" ? "Ferdig" : "Åpen"}</span>
      </div>

      <div className="grid2">
        <label className="field"><span className="label">Dato</span><input type="date" value={e.dato} disabled={laast} onChange={(x) => sett({ dato: x.target.value || idag })} /></label>
        <label className="field"><span className="label">Til stede</span><input value={e.deltakere} disabled={laast} maxLength={500} placeholder="F.eks. kunden, Harald, rørlegger" onChange={(x) => sett({ deltakere: x.target.value })} /></label>
        <div className="field"><span className="label">Kunde</span>
          <div>{k ? <b>{k.navn}</b> : e.kunde_navn ? <b>{e.kunde_navn}</b> : <span className="muted">–</span>}{pr ? <span className="small muted"> · {pr.visma_nr ? `${pr.visma_nr} ` : ""}{pr.navn}</span> : null}</div></div>
        <label className="field"><span className="label">Telefon</span><input type="tel" value={e.telefon} disabled={laast} maxLength={40} onChange={(x) => sett({ telefon: x.target.value })} /></label>
        <label className="field" style={{ gridColumn: "1 / -1" }}><span className="label">Adresse</span><input value={e.adresse} disabled={laast} maxLength={300} onChange={(x) => sett({ adresse: x.target.value })} /></label>
      </div>
      {e.adresse && <div className="small"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.adresse)}`} target="_blank" rel="noreferrer">Åpne i kart</a></div>}

      {!e.prosjekt_id && !laast && (
        <details>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Koble til prosjekt (når jobben er vunnet)</summary>
          <div style={{ marginTop: 8 }}>
            <ProsjektVelger value="" onChange={(id) => { if (id) lagre({ prosjekt_id: id }, "Befaringen er koblet til prosjektet").then((ok) => ok && setE((v) => ({ ...v, prosjekt_id: id }))); }}
              prosjekter={d.prosjekter.filter((x) => x.aktiv)} label="Prosjekt" />
          </div>
        </details>
      )}

      <h3 style={{ margin: "6px 0 0" }}>Punkter <span className="small muted">({t.besvart}/{t.antall}{t.avvik ? `, ${t.avvik} avvik` : ""})</span></h3>
      {e.prosjekt_id && e.type !== "tilbud" && <p className="small muted" style={{ margin: 0 }}>Punkter med «Avvik» blir avvik på prosjektet når befaringen lagres.</p>}
      <ol className="sk-punkter">
        {e.punkter.map((p, i) => {
          const a = p.avvik_id ? d.avvik.find((x) => x.id === p.avvik_id) : undefined;
          return (
            <li key={i} className={p.svar ? `svar-${p.svar}` : ""}>
              <span className="sk-tekst">{p.tekst}</span>
              <span className="sk-valg" role="group" aria-label={`Svar på ${p.tekst}`}>
                {(Object.keys(BEFARING_SVAR) as BefaringSvar[]).map((v) => (
                  <button key={v} type="button" className={`sk-knapp ${v}`} aria-pressed={p.svar === v} disabled={laast}
                    onClick={() => settPunkt(i, { svar: p.svar === v ? "" : v })}>{BEFARING_SVAR[v]}</button>
                ))}
              </span>
              <label className="sk-maal">Mål
                <input value={p.maal ?? ""} disabled={laast} aria-label={`Mål for ${p.tekst}`} placeholder="f.eks. 4,2 × 2,4 m" style={{ width: 150 }}
                  onChange={(x) => settPunkt(i, { maal: x.target.value })} />
              </label>
              <input className="sk-kommentar" aria-label={`Merknad til ${p.tekst}`} value={p.merknad ?? ""} disabled={laast}
                placeholder={p.svar === "avvik" ? "Hva er feil, og hva skal gjøres?" : "Merknad"} onChange={(x) => settPunkt(i, { merknad: x.target.value })} />
              <span className="sk-under small muted">
                {a && <span className={`chip ${a.status === "lukket" ? "godkjent" : "venter"}`} title={a.tiltak || undefined}>Avvik: {AVVIK_STATUS[a.status]}</span>}
                {!laast && !p.avvik_id && <button type="button" className="linkbtn small" onClick={() => sett({ punkter: e.punkter.filter((_, n) => n !== i) })}>Fjern punkt</button>}
              </span>
            </li>
          );
        })}
      </ol>
      {!laast && (
        <form className="row" onSubmit={(x) => { x.preventDefault(); if (nyttPunkt.trim()) { sett({ punkter: [...e.punkter, { tekst: nyttPunkt.trim(), svar: "", merknad: "", maal: "" }] }); setNyttPunkt(""); } }}>
          <input value={nyttPunkt} onChange={(x) => setNyttPunkt(x.target.value)} placeholder="Nytt punkt, f.eks. «Mål vindu stue»" aria-label="Nytt punkt" style={{ flex: 1 }} maxLength={200} />
          <button className="btn sm" disabled={!nyttPunkt.trim()}>Legg til</button>
        </form>
      )}

      <label className="field"><span className="label">Notat</span>
        <textarea rows={5} value={e.notat} disabled={laast} maxLength={10000} placeholder="Hva kunden ønsker, valg som er tatt, ting å huske til tilbudet eller jobben" onChange={(x) => sett({ notat: x.target.value })} /></label>

      <Bilder bilder={bilder} til={{ befaring_id: b.id, prosjekt_id: e.prosjekt_id }} tittel={`Bilder fra befaringen${bilder.length ? ` (${bilder.length})` : ""}`} />

      {b.signert_tid ? (
        <div className="sk-kontroll">
          <b>{e.type === "overtakelse" ? "Overtatt av kunden" : "Signert av kunden"}</b>
          <img src={b.signatur} alt={`Signatur ${b.signert_navn}`} style={{ maxWidth: 240, background: "#fff", border: "1px solid var(--line)", borderRadius: 6 }} />
          <span className="small">{b.signert_navn}, {langDato(b.signert_tid.slice(0, 10))}</span>
          {planlegger && <button className="linkbtn small" style={{ alignSelf: "flex-start" }} onClick={() => confirm("Fjerne kundens signatur?") && lagre({ signatur: "", signert_navn: "", status: "apen" }, "Signaturen er fjernet")}>Fjern signaturen</button>}
        </div>
      ) : null}

      {pdfFeil && <p className="small" style={{ color: "var(--warn)" }}>{pdfFeil}</p>}
      <div className="row">
        {!laast && <button className="btn primary" disabled={!endret || !e.tittel.trim()} onClick={() => lagre()}>Lagre</button>}
        {!laast && e.status === "apen" && <button className="btn" onClick={() => lagre({ status: "ferdig" }, "Befaringen er ferdig").then((ok) => ok && setE((v) => ({ ...v, status: "ferdig" })))}>Merk ferdig</button>}
        {kanEndre && e.status === "ferdig" && !b.signert_tid && <button className="btn" onClick={() => lagre({ status: "apen" }, "Befaringen er åpnet igjen").then((ok) => ok && setE((v) => ({ ...v, status: "apen" })))}>Åpne igjen</button>}
        {!laast && !b.signert_tid && <button className="btn" onClick={async () => { if (!endret || (await lagre())) setSigner(true); }}>{e.type === "overtakelse" ? "Kunden signerer overtakelsen" : "Kundens signatur"}</button>}
        <button className="btn" disabled={lager} onClick={lastNed}>{lager ? "Lager PDF …" : "Last ned rapport (PDF)"}</button>
        {e.type === "tilbud" && tilbudBruk && !e.tilbud_id && kanEndre && <button className="btn" onClick={lagTilbud}>Lag tilbud</button>}
        {(planlegger || (b.utfort_av === meg.id && !b.signert_tid)) && <button className="btn" onClick={slett}>Slett</button>}
      </div>
      {e.tilbud_id && <p className="small muted" style={{ margin: 0 }}>Tilbud er laget fra befaringen – se Tilbudsoppfølging.</p>}
      {signer && <Signatur b={e} lukk={() => setSigner(false)} lagre={(navn, png) => lagre({ signatur: png, signert_navn: navn, status: "ferdig" }, e.type === "overtakelse" ? "Kunden har signert overtakelsen" : "Kunden har signert")} />}
    </section>
  );
}

/** Kunden signerer på skjermen */
function Signatur({ b, lukk, lagre }: { b: Befaring; lukk: () => void; lagre: (navn: string, png: string) => Promise<boolean> }) {
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
  const pos = (x: React.PointerEvent) => { const r = c.current!.getBoundingClientRect(); return [x.clientX - r.left, x.clientY - r.top]; };
  const start = (x: React.PointerEvent) => { tegner.current = true; c.current!.setPointerCapture(x.pointerId); const g = c.current!.getContext("2d")!; const [a, y] = pos(x); g.beginPath(); g.moveTo(a, y); };
  const flytt = (x: React.PointerEvent) => { if (!tegner.current) return; const g = c.current!.getContext("2d")!; const [a, y] = pos(x); g.lineTo(a, y); g.stroke(); setTegnet(true); };
  const slipp = () => { tegner.current = false; };
  const tom = () => { const cv = c.current!; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); setTegnet(false); };
  const godkjenn = async () => {
    const cv = c.current!;
    const hvit = document.createElement("canvas"); hvit.width = cv.width; hvit.height = cv.height;
    const g = hvit.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, hvit.width, hvit.height); g.drawImage(cv, 0, 0);
    if (await lagre(navn.trim(), hvit.toDataURL("image/png"))) lukk();
  };
  const t = befaringTall(b);
  const tekst = useMemo(() => b.type === "overtakelse"
    ? `Med signaturen bekrefter kunden at arbeidet er overtatt${t.avvik ? `, med ${t.avvik} ${t.avvik === 1 ? "mangel" : "mangler"} som er notert og skal utbedres` : ""}.`
    : "Med signaturen bekrefter kunden at befaringen er gjennomgått og at punktene stemmer.", [b.type, t.avvik]);
  return (
    <div className="lysboks" role="dialog" aria-label="Kundens signatur">
      <div className="panel" style={{ width: "min(560px, 100%)", color: "var(--fg)" }}>
        <h2 style={{ margin: 0 }}>{b.type === "overtakelse" ? "Overtakelse" : "Befaring"}</h2>
        <p style={{ margin: 0 }}><b>{b.tittel}</b></p>
        <p className="small" style={{ margin: 0 }}>{tekst}</p>
        <label className="field"><span className="label">Kundens navn</span><input type="text" value={navn} onChange={(x) => setNavn(x.target.value)} autoComplete="off" /></label>
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
