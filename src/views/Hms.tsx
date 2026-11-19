// HMS: stoffkartotek (kjemikalier med sikkerhetsdatablad) og HMS-dokumenter (håndbok, rutiner) med lesebekreftelse.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { langDato, sorterAnsatte } from "../lib/ferie";
import { lastNedCsv } from "../lib/lonn";
import {
  DATABLAD_AAR, FAREPIKTOGRAM, HMS_KATEGORI, ikkeLest, revisjonStatus, stoffCsv, stoffMangler,
  type HmsDokument, type HmsKategori, type HmsLest, type NyttHmsDokument, type NyttStoff, type Stoff,
} from "../lib/stoff";

type HmsData = { stoffer: Stoff[]; dokumenter: HmsDokument[]; lest: HmsLest[] };

/** Felles henting for begge delene (lastes på nytt etter hver endring) */
function useHms() {
  const [data, setData] = useState<HmsData | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const last = useCallback(() => api.hms().then((x) => { setData(x); setFeil(null); }).catch((e) => setFeil(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { last(); }, [last]);
  return { data, feil, last };
}

/** Åpner en fil fra appen (eller lenken) i ny fane */
async function aapneFil(sti: string | null, lenke: string) {
  if (!sti) { if (lenke) window.open(lenke, "_blank", "noopener"); return; }
  const vindu = window.open("", "_blank");
  try { const u = await api.dokUrl(sti); if (vindu) vindu.location.href = u; else location.href = u; } catch { vindu?.close(); }
}

const tomtStoff = (): NyttStoff => ({ navn: "", leverandor: "", nobb: "", bruk: "", plassering: "", farer: [], verneutstyr: "", datablad_dato: null, sti: null, filnavn: "", lenke: "", aktiv: true });

// ------------------------------------------------------------ Stoffkartotek

export function Stoffkartotek() {
  const { meg, leder, idag, kjor } = useApp();
  const { data, feil, last } = useHms();
  const [sok, setSok] = useState("");
  const [skjema, setSkjema] = useState<NyttStoff | null>(null);
  const [fil, setFil] = useState<File | null>(null);
  const [lagrer, setLagrer] = useState(false);

  if (feil) return <section className="panel"><h2>Stoffkartotek</h2><p className="muted">{feil}</p></section>;
  if (!data) return <section className="panel"><h2>Stoffkartotek</h2><p className="muted">Henter …</p></section>;

  const aktive = data.stoffer.filter((s) => s.aktiv);
  const q = sok.trim().toLowerCase();
  const vis = aktive.filter((s) => !q || [s.navn, s.leverandor, s.nobb, s.bruk, s.plassering].some((x) => x.toLowerCase().includes(q)));
  const mangler = aktive.filter((s) => stoffMangler(s, idag).length);
  const kanEndre = (s: Stoff) => leder || s.lagt_inn_av === meg.id;

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skjema || !skjema.navn.trim()) return;
    const lenke = skjema.lenke.trim();
    if (lenke && !/^https:\/\//.test(lenke)) { window.alert("Lenken må starte med https://"); return; }
    setLagrer(true);
    const ok = await kjor(() => api.lagreStoff({ ...skjema, navn: skjema.navn.trim(), leverandor: skjema.leverandor.trim(), nobb: skjema.nobb.replace(/\D/g, ""), lenke }, fil),
      skjema.id ? "Stoffet er oppdatert" : "Stoffet er lagt i kartoteket");
    setLagrer(false);
    if (ok) { setSkjema(null); setFil(null); last(); }
  };
  const slett = (s: Stoff) => window.confirm(`Slette «${s.navn}» fra stoffkartoteket?`) && kjor(() => api.slettStoff(s.id, s.sti), "Slettet").then(last);

  return (
    <section className="panel hms">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Stoffkartotek <span className="chip">{aktive.length}</span>{mangler.length > 0 && <span className="chip venter" style={{ marginLeft: 6 }}>{mangler.length} må sjekkes</span>}</h2>
        <div className="row">
          {!skjema && <button className="btn sm primary" onClick={() => { setSkjema(tomtStoff()); setFil(null); }}>+ Nytt stoff</button>}
          {aktive.length > 0 && <button className="btn sm" onClick={() => lastNedCsv(stoffCsv(aktive), `stoffkartotek-${idag}.csv`)}>Last ned (Excel)</button>}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Alle kjemiske produkter dere bruker som er merket med farepiktogram (fugemasse, skum, lim, maling, løsemidler …), med sikkerhetsdatablad.
        Alle ansatte kan se kartoteket og legge til produkter. Databladet bør sjekkes mot leverandørens nyeste utgave minst hvert {DATABLAD_AAR}. år.
      </p>

      {skjema && (
        <form className="panel" style={{ background: "var(--sunk)", boxShadow: "none", display: "grid", gap: 10 }} onSubmit={lagre}>
          <div className="row">
            <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Produkt</span>
              <input value={skjema.navn} onChange={(e) => setSkjema({ ...skjema, navn: e.target.value })} placeholder="F.eks. Byggskum, fugemasse, lim" maxLength={200} required autoFocus /></label>
            <label className="field" style={{ flex: "1 1 160px" }}><span className="label">Leverandør/produsent</span>
              <input value={skjema.leverandor} onChange={(e) => setSkjema({ ...skjema, leverandor: e.target.value })} maxLength={200} /></label>
            <label className="field kort"><span className="label">NOBB-nr</span>
              <input inputMode="numeric" value={skjema.nobb} onChange={(e) => setSkjema({ ...skjema, nobb: e.target.value })} maxLength={20} /></label>
          </div>
          <div className="row">
            <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Brukes til</span>
              <input value={skjema.bruk} onChange={(e) => setSkjema({ ...skjema, bruk: e.target.value })} placeholder="F.eks. tetting rundt vinduer" maxLength={500} /></label>
            <label className="field" style={{ flex: "1 1 160px" }}><span className="label">Hvor står det</span>
              <input value={skjema.plassering} onChange={(e) => setSkjema({ ...skjema, plassering: e.target.value })} placeholder="F.eks. lager, bilene" maxLength={200} /></label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>Farepiktogram på emballasjen</legend>
            <div className="row" style={{ gap: "6px 12px" }}>
              {FAREPIKTOGRAM.map((f) => (
                <label key={f.id} className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={skjema.farer.includes(f.id)}
                    onChange={(e) => setSkjema({ ...skjema, farer: e.target.checked ? [...skjema.farer, f.id] : skjema.farer.filter((x) => x !== f.id) })} />
                  <span aria-hidden="true">{f.tegn}</span>{f.navn}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field"><span className="label">Verneutstyr</span>
            <input value={skjema.verneutstyr} onChange={(e) => setSkjema({ ...skjema, verneutstyr: e.target.value })} placeholder="F.eks. hansker, vernebriller, åndedrettsvern" maxLength={300} /></label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Sikkerhetsdatablad (PDF eller bilde)</span>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFil(e.target.files?.[0] ?? null)} />
              {skjema.filnavn && !fil && <span className="small muted">Lagret: {skjema.filnavn}</span>}</label>
            <label className="field kort"><span className="label">Databladet er datert</span>
              <input type="date" value={skjema.datablad_dato ?? ""} onChange={(e) => setSkjema({ ...skjema, datablad_dato: e.target.value || null })} /></label>
          </div>
          <label className="field"><span className="label">… eller lenke til databladet hos leverandøren</span>
            <input value={skjema.lenke} onChange={(e) => setSkjema({ ...skjema, lenke: e.target.value })} placeholder="https://…" /></label>
          {skjema.nobb.replace(/\D/g, "") && <a className="small" href={`https://nobb.no/item/${skjema.nobb.replace(/\D/g, "")}`} target="_blank" rel="noopener">Finn databladet i NOBB ↗</a>}
          <div className="row">
            <button className="btn primary" disabled={lagrer || !skjema.navn.trim()}>{lagrer ? "Lagrer …" : "Lagre"}</button>
            <button type="button" className="btn" onClick={() => { setSkjema(null); setFil(null); }}>Avbryt</button>
          </div>
        </form>
      )}

      {aktive.length > 5 && <input type="search" value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Søk på produkt, leverandør, NOBB eller bruk" aria-label="Søk i stoffkartoteket" />}
      {!aktive.length && !skjema && <p className="muted" style={{ margin: 0 }}>Ingen stoffer ennå. Start med det dere bruker mest: byggskum, fugemasse, lim, maling og løsemidler.</p>}

      <div style={{ display: "grid", gap: 8 }}>
        {vis.map((s) => {
          const m = stoffMangler(s, idag);
          return (
            <div key={s.id} className="item" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div className="t">{s.navn} {s.farer.map((f) => { const p = FAREPIKTOGRAM.find((x) => x.id === f); return p ? <span key={f} title={p.navn} aria-label={p.navn}>{p.tegn}</span> : null; })}</div>
                <div className="s">{[s.leverandor, s.nobb && `NOBB ${s.nobb}`, s.bruk, s.plassering].filter(Boolean).join(" · ")}</div>
                {s.verneutstyr && <div className="s">Verneutstyr: {s.verneutstyr}</div>}
                <div className="s">{s.datablad_dato ? `Datablad datert ${langDato(s.datablad_dato)}` : ""}{m.length ? <span className="chip venter" style={{ marginLeft: s.datablad_dato ? 6 : 0 }}>{m.join(", ")}</span> : null}</div>
              </div>
              <div className="acts">
                {(s.sti || s.lenke) && <button className="btn sm primary" onClick={() => aapneFil(s.sti, s.lenke)}>Datablad</button>}
                {kanEndre(s) && <button className="btn sm" onClick={() => { setSkjema({ ...s }); setFil(null); }}>Endre</button>}
                {kanEndre(s) && <button className="btn sm no" onClick={() => slett(s)}>Slett</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ HMS-dokumenter

const tomtDok = (idag: string): NyttHmsDokument => ({ tittel: "", kategori: "rutine", versjon: "1", gyldig_fra: idag, revideres: null, beskrivelse: "", sti: null, filnavn: "", lenke: "", ma_leses: true });

export function HmsDokumenter() {
  const { d, meg, leder, idag, kjor } = useApp();
  const { data, feil, last } = useHms();
  const [skjema, setSkjema] = useState<NyttHmsDokument | null>(null);
  const [fil, setFil] = useState<File | null>(null);
  const [lagrer, setLagrer] = useState(false);
  const [apen, setApen] = useState<string | null>(null);
  const ansatte = useMemo(() => sorterAnsatte(d).filter((a) => a.aktiv), [d]);

  if (feil) return <section className="panel"><h2>HMS-dokumenter</h2><p className="muted">{feil}</p></section>;
  if (!data) return <section className="panel"><h2>HMS-dokumenter</h2><p className="muted">Henter …</p></section>;

  const harLest = (id: string) => data.lest.some((l) => l.dokument_id === id && l.ansatt_id === meg.id);
  const uleste = data.dokumenter.filter((x) => x.ma_leses && !harLest(x.id));
  const grupper = (Object.keys(HMS_KATEGORI) as HmsKategori[]).map((k) => [k, data.dokumenter.filter((x) => x.kategori === k)] as const).filter(([, l]) => l.length);

  const les = async (x: HmsDokument) => {
    await aapneFil(x.sti, x.lenke);
    if (x.ma_leses && !harLest(x.id)) { await kjor(() => api.markerHmsLest(x.id)); last(); }
  };
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skjema || !skjema.tittel.trim()) return;
    const lenke = skjema.lenke.trim();
    if (lenke && !/^https:\/\//.test(lenke)) { window.alert("Lenken må starte med https://"); return; }
    if (!skjema.id && !fil && !lenke) { window.alert("Legg ved dokumentet som PDF, eller lim inn en lenke."); return; }
    setLagrer(true);
    const ok = await kjor(() => api.lagreHmsDokument({ ...skjema, tittel: skjema.tittel.trim(), lenke }, fil), skjema.id ? "Dokumentet er oppdatert" : "Dokumentet er lagt inn – de ansatte ser det under HMS");
    setLagrer(false);
    if (ok) { setSkjema(null); setFil(null); last(); }
  };
  const slett = (x: HmsDokument) => window.confirm(`Slette «${x.tittel}»?`) && kjor(() => api.slettHmsDokument(x.id, x.sti), "Slettet").then(last);

  return (
    <section className="panel hms">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>HMS-dokumenter{uleste.length > 0 && <span className="chip venter" style={{ marginLeft: 8 }}>{uleste.length} å lese</span>}</h2>
        {leder && !skjema && <button className="btn sm primary" onClick={() => { setSkjema(tomtDok(idag)); setFil(null); }}>+ Nytt dokument</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        HMS-håndbok, rutiner, beredskapsplan og kvalitetssystem samlet på ett sted.{" "}
        {leder ? "Når du laster opp en ny versjon, må alle lese den på nytt. Du ser hvem som har lest." : "Trykk «Les» – da får leder beskjed om at du har lest dokumentet."}
      </p>

      {skjema && leder && (
        <form className="panel" style={{ background: "var(--sunk)", boxShadow: "none", display: "grid", gap: 10 }} onSubmit={lagre}>
          <div className="row">
            <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Tittel</span>
              <input value={skjema.tittel} onChange={(e) => setSkjema({ ...skjema, tittel: e.target.value })} placeholder="F.eks. HMS-håndbok, rutine for arbeid i høyden" maxLength={200} required autoFocus /></label>
            <label className="field" style={{ flex: "1 1 160px" }}><span className="label">Type</span>
              <select value={skjema.kategori} onChange={(e) => setSkjema({ ...skjema, kategori: e.target.value as HmsKategori })}>
                {(Object.keys(HMS_KATEGORI) as HmsKategori[]).map((k) => <option key={k} value={k}>{HMS_KATEGORI[k]}</option>)}
              </select></label>
          </div>
          <div className="row">
            <label className="field kort"><span className="label">Versjon</span>
              <input value={skjema.versjon} onChange={(e) => setSkjema({ ...skjema, versjon: e.target.value })} maxLength={20} /></label>
            <label className="field kort"><span className="label">Gjelder fra</span>
              <input type="date" value={skjema.gyldig_fra ?? ""} onChange={(e) => setSkjema({ ...skjema, gyldig_fra: e.target.value || null })} /></label>
            <label className="field kort"><span className="label">Skal revideres</span>
              <input type="date" value={skjema.revideres ?? ""} onChange={(e) => setSkjema({ ...skjema, revideres: e.target.value || null })} /></label>
          </div>
          <label className="field"><span className="label">Kort om innholdet</span>
            <textarea rows={2} value={skjema.beskrivelse} onChange={(e) => setSkjema({ ...skjema, beskrivelse: e.target.value })} maxLength={2000} /></label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "1 1 220px" }}><span className="label">Dokumentet (PDF)</span>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFil(e.target.files?.[0] ?? null)} />
              {skjema.filnavn && !fil && <span className="small muted">Lagret: {skjema.filnavn}</span>}</label>
            <label className="field" style={{ flex: "1 1 220px" }}><span className="label">… eller lenke</span>
              <input value={skjema.lenke} onChange={(e) => setSkjema({ ...skjema, lenke: e.target.value })} placeholder="https://…" /></label>
          </div>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={skjema.ma_leses} onChange={(e) => setSkjema({ ...skjema, ma_leses: e.target.checked })} /> Alle ansatte må lese og kvittere</label>
          <div className="row">
            <button className="btn primary" disabled={lagrer || !skjema.tittel.trim()}>{lagrer ? "Lagrer …" : "Lagre"}</button>
            <button type="button" className="btn" onClick={() => { setSkjema(null); setFil(null); }}>Avbryt</button>
          </div>
        </form>
      )}

      {!data.dokumenter.length && !skjema && <p className="muted" style={{ margin: 0 }}>{leder ? "Ingen dokumenter ennå. Start med HMS-håndboka og beredskapsplanen." : "Ingen HMS-dokumenter er lagt inn ennå."}</p>}

      {grupper.map(([k, liste]) => (
        <div key={k} style={{ display: "grid", gap: 8 }}>
          <div className="label">{HMS_KATEGORI[k]}</div>
          {liste.map((x) => {
            const rev = revisjonStatus(x, idag);
            const mangler = ikkeLest(x, ansatte, data.lest);
            const lest = harLest(x.id);
            return (
              <div key={x.id} className="item" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <div className="t">{x.tittel} <span className="small muted">v{x.versjon}</span>
                    {x.ma_leses && (lest ? <span className="chip godkjent" style={{ marginLeft: 6 }}>Lest</span> : <span className="chip venter" style={{ marginLeft: 6 }}>Ikke lest</span>)}</div>
                  {x.beskrivelse && <div className="s">{x.beskrivelse}</div>}
                  <div className="s">{x.gyldig_fra ? `Gjelder fra ${langDato(x.gyldig_fra)}` : ""}{x.revideres ? ` · revideres ${langDato(x.revideres)}` : ""}
                    {leder && rev !== "ok" && <span className={`chip ${rev === "over" ? "avvist" : "venter"}`} style={{ marginLeft: 6 }}>{rev === "over" ? "Revisjon er på overtid" : "Revideres snart"}</span>}</div>
                  {leder && x.ma_leses && (
                    <button className="linkbtn small" onClick={() => setApen(apen === x.id ? null : x.id)}>
                      Lest av {ansatte.length - mangler.length} av {ansatte.length} {apen === x.id ? "▲" : "▼"}
                    </button>
                  )}
                  {apen === x.id && <div className="small muted">{mangler.length ? `Har ikke lest: ${mangler.map((a) => a.navn).join(", ")}` : "Alle har lest"}</div>}
                </div>
                <div className="acts">
                  {(x.sti || x.lenke) && <button className={`btn sm${x.ma_leses && !lest ? " primary" : ""}`} onClick={() => les(x)}>Les</button>}
                  {leder && <button className="btn sm" onClick={() => { setSkjema({ ...x }); setFil(null); }}>Ny versjon / endre</button>}
                  {leder && <button className="btn sm no" onClick={() => slett(x)}>Slett</button>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/** Fanene under HMS: stoffkartotek og dokumenter */
export function HmsFane() {
  const [vis, setVis] = useState<"dok" | "stoff">("dok");
  return (
    <>
      <nav className="tabs undertabs" role="tablist">
        <button role="tab" aria-selected={vis === "dok"} onClick={() => setVis("dok")}>HMS-dokumenter</button>
        <button role="tab" aria-selected={vis === "stoff"} onClick={() => setVis("stoff")}>Stoffkartotek</button>
      </nav>
      {vis === "dok" ? <HmsDokumenter /> : <Stoffkartotek />}
    </>
  );
}
