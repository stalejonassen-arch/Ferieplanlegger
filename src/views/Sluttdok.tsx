import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api, nobbLenke, type FdvDok, type FdvVare } from "../lib/api";
import { langDato } from "../lib/ferie";
import { t2, type Prosjekt } from "../lib/timer";

/** Sluttdokumentasjon til kunden: utført arbeid, tilleggsarbeid, bilder. Skrives ut eller lagres som PDF fra nettleseren. */
export function Sluttdok({ p }: { p: Prosjekt }) {
  const { d, idag, leder, kjor } = useApp();
  const [fdv, setFdv] = useState<{ varer: FdvVare[]; dok: FdvDok[] } | null>(null);
  const [medFdv, setMedFdv] = useState(true);
  const [visSkjulte, setVisSkjulte] = useState(false);
  const [laster, setLaster] = useState(false);
  const hentFdv = () => api.fdv(p.id).then(setFdv).catch(() => setFdv({ varer: [], dok: [] }));
  useEffect(() => { hentFdv(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fdvVarer = (fdv?.varer ?? []).filter((v) => !v.skjul);
  const lenke = (v: FdvVare) => v.fdv_url || (v.nobb_nr ? nobbLenke(v.nobb_nr) : "");
  const lastOpp = async (filer: FileList | null) => {
    if (!filer?.length) return;
    setLaster(true);
    await kjor(async () => { for (const f of Array.from(filer)) await api.lastOppFdv(p.id, f); }, filer.length > 1 ? `${filer.length} dokumenter lastet opp` : "Dokument lastet opp");
    setLaster(false); hentFdv();
  };
  const aapne = async (x: FdvDok, lastNed?: boolean) => {
    const vindu = window.open("", "_blank");
    try { const u = await api.dokUrl(x.sti, lastNed ? x.navn : undefined); if (vindu) vindu.location.href = u; else location.href = u; }
    catch { vindu?.close(); }
  };
  const skjul = (v: FdvVare, skjul: boolean) => kjor(() => api.lagreVare(v.varenr, { skjul })).then(hentFdv);
  const rettNobb = (v: FdvVare) => {
    const nr = window.prompt(`NOBB-nummer eller lenke til FDV for ${v.beskrivelse}`, v.fdv_url || v.nobb_nr);
    if (nr == null) return;
    const t = nr.trim();
    const endring = /^https?:\/\//i.test(t) ? { fdv_url: t } : { nobb_nr: t.replace(/\D/g, ""), fdv_url: "" };
    kjor(() => api.lagreVare(v.varenr, endring), "Lagret").then(hentFdv);
  };
  const [urler, setUrler] = useState<Record<string, string>>({});
  const [medTimer, setMedTimer] = useState(true);
  const [medBilder, setMedBilder] = useState(true);
  const [medDagbok, setMedDagbok] = useState(true);
  const [innledning, setInnledning] = useState("");
  const k = d.kunder.find((x) => x.id === p.kunde_id);
  const adr = p.adresse || [k?.adresse, [k?.postnr, k?.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const dagbok = [...d.dagbok.filter((x) => x.prosjekt_id === p.id)].sort((a, b) => a.dato.localeCompare(b.dato));
  const tillegg = d.tillegg.filter((x) => x.prosjekt_id === p.id && (x.status === "signert" || x.status === "fakturert"));
  const bilder = d.bilder.filter((b) => b.prosjekt_id === p.id && !b.avvik_id);
  const timer = d.timer.filter((t) => t.prosjekt_id === p.id && t.fakturerbar !== false);
  const sumT = timer.reduce((n, t) => n + Number(t.timer), 0);
  const datoer = timer.map((t) => t.dato).sort();

  useEffect(() => {
    if (bilder.length) api.bildeUrler(bilder.map((b) => b.sti)).then(setUrler).catch(() => {});
  }, [bilder.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section className="panel ikke-utskrift">
        <h2 style={{ margin: 0 }}>Sluttdokumentasjon</h2>
        <p className="small muted" style={{ margin: 0 }}>Dokumentasjon til kunden når jobben er ferdig. Trykk «Lagre som PDF» og velg «Lagre som PDF» som skriver, eller skriv ut direkte.</p>
        <label className="field"><span className="label">Innledning til kunden (valgfritt)</span>
          <textarea rows={2} value={innledning} onChange={(e) => setInnledning(e.target.value)} placeholder="F.eks. Takk for oppdraget! Her er en oppsummering av arbeidet vi har utført." /></label>
        <div className="row small">
          <label className="row"><input type="checkbox" checked={medDagbok} onChange={(e) => setMedDagbok(e.target.checked)} /> Utført arbeid (dagbok)</label>
          <label className="row"><input type="checkbox" checked={medTimer} onChange={(e) => setMedTimer(e.target.checked)} /> Timer</label>
          <label className="row"><input type="checkbox" checked={medBilder} onChange={(e) => setMedBilder(e.target.checked)} /> Bilder</label>
          <label className="row"><input type="checkbox" checked={medFdv} onChange={(e) => setMedFdv(e.target.checked)} /> FDV-dokumentasjon</label>
        </div>
        <div><button className="btn primary" onClick={() => window.print()}>Lagre som PDF / skriv ut</button></div>
      </section>

      <section className="panel ikke-utskrift">
        <h3 style={{ margin: 0 }}>FDV-dokumentasjon</h3>
        <p className="small muted" style={{ margin: 0 }}>Varene hentes fra ordrene på prosjektet i Visma. Hver vare får lenke til NOBB, der FDV, produktdatablad og monteringsanvisning ligger under «Dokumentasjon». Last opp egne FDV-dokumenter (PDF) for det som ikke ligger i NOBB.</p>
        {!fdv ? <p className="small muted">Henter varer …</p> : (
          <>
            {fdv.varer.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ingen varer med NOBB-nummer på ordrene til dette prosjektet ennå.</p>}
            {fdv.varer.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl"><thead><tr><th>Vare</th><th>Antall</th><th>FDV</th>{leder && <th></th>}</tr></thead><tbody>
                  {fdv.varer.filter((v) => visSkjulte || !v.skjul).map((v) => (
                    <tr key={v.varenr} style={v.skjul ? { opacity: 0.5 } : undefined}>
                      <td style={{ whiteSpace: "normal" }}>{v.beskrivelse}<div className="small muted">NOBB {v.nobb_nr || "–"}</div></td>
                      <td>{t2(v.antall)} {v.enhet.toLowerCase()}</td>
                      <td>{lenke(v) ? <a href={lenke(v)} target="_blank" rel="noreferrer">Åpne</a> : <span className="muted">–</span>}</td>
                      {leder && <td className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <button className="btn sm" onClick={() => rettNobb(v)}>Rett</button>
                        <button className="btn sm" onClick={() => skjul(v, !v.skjul)}>{v.skjul ? "Vis" : "Skjul"}</button>
                      </td>}
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
            {fdv.varer.some((v) => v.skjul) && <label className="row small"><input type="checkbox" checked={visSkjulte} onChange={(e) => setVisSkjulte(e.target.checked)} /> Vis skjulte varer ({fdv.varer.filter((v) => v.skjul).length})</label>}
            <h4 style={{ margin: "8px 0 0" }}>Egne FDV-dokumenter</h4>
            {fdv.dok.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ingen lastet opp.</p>}
            {fdv.dok.map((x) => (
              <div key={x.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{x.navn}{x.storrelse ? <span className="small muted"> · {(x.storrelse / 1048576).toFixed(1).replace(".", ",")} MB</span> : null}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn sm" onClick={() => aapne(x)}>Åpne</button>
                  <button className="btn sm" onClick={() => aapne(x, true)}>Last ned</button>
                  <button className="btn sm no" onClick={() => kjor(() => api.slettFdv(x.id, x.sti), "Slettet").then(hentFdv)}>Slett</button>
                </span>
              </div>
            ))}
            <div><label className="btn sm">{laster ? "Laster opp …" : "Last opp FDV (PDF)"}
              <input type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden disabled={laster} onChange={(e) => { lastOpp(e.target.files); e.target.value = ""; }} /></label></div>
            <p className="small muted" style={{ margin: 0 }}>Tips: send kunden PDF-en av sluttdokumentasjonen sammen med de opplastede dokumentene. Lenkene til NOBB i PDF-en er klikkbare.</p>
          </>
        )}
      </section>

      <article className="panel utskrift">
        <header className="utskrift-topp">
          <div><div className="label">N L Austnes AS</div><h1 style={{ margin: "2px 0" }}>Sluttdokumentasjon</h1></div>
          <div className="small" style={{ textAlign: "right" }}>Larsnilsvegen 41, 6290 Haramsøy<br />Org.nr. 832 507 652<br />{langDato(idag)}</div>
        </header>
        <table className="tbl"><tbody>
          <tr><th>Prosjekt</th><td style={{ whiteSpace: "normal" }}>{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}</td></tr>
          {k && <tr><th>Kunde</th><td style={{ whiteSpace: "normal" }}>{k.navn}</td></tr>}
          {adr && <tr><th>Adresse</th><td style={{ whiteSpace: "normal" }}>{adr}</td></tr>}
          {datoer.length > 0 && <tr><th>Utført</th><td>{langDato(datoer[0])} – {langDato(datoer[datoer.length - 1])}</td></tr>}
          {medTimer && sumT > 0 && <tr><th>Timer</th><td>{t2(sumT)}</td></tr>}
        </tbody></table>
        {innledning && <p style={{ whiteSpace: "pre-wrap" }}>{innledning}</p>}

        {medDagbok && dagbok.length > 0 && (
          <>
            <h2>Utført arbeid</h2>
            {dagbok.map((x) => <p key={x.id} style={{ margin: "0 0 6px" }}><b>{langDato(x.dato)}:</b> {x.tekst}</p>)}
          </>
        )}

        {tillegg.length > 0 && (
          <>
            <h2>Godkjent tilleggsarbeid</h2>
            {tillegg.map((x) => (
              <div key={x.id} style={{ marginBottom: 10, breakInside: "avoid" }}>
                <b>{x.tittel}</b>{x.beskrivelse ? ` – ${x.beskrivelse}` : ""}
                <div className="small">{[x.timer != null ? `${t2(x.timer)} t` : "", x.materiell].filter(Boolean).join(" · ")}</div>
                <div className="small">Godkjent av {x.signert_navn}{x.signert_tid ? ` ${new Date(x.signert_tid).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}` : ""}</div>
                {x.signatur && <img src={x.signatur} alt="Signatur" style={{ height: 50 }} />}
              </div>
            ))}
          </>
        )}

        {medBilder && bilder.length > 0 && (
          <>
            <h2>Bilder</h2>
            <div className="utskrift-bilder">
              {bilder.slice().reverse().map((b) => urler[b.sti] ? <figure key={b.id}><img src={urler[b.sti]} alt={b.tekst || "Bilde"} />{b.tekst && <figcaption className="small">{b.tekst}</figcaption>}</figure> : null)}
            </div>
          </>
        )}
        {medFdv && (fdvVarer.length > 0 || (fdv?.dok.length ?? 0) > 0) && (
          <>
            <h2>FDV-dokumentasjon</h2>
            <p className="small" style={{ margin: "0 0 6px" }}>Forvaltning, drift og vedlikehold for produktene som er brukt. Dokumentasjonen for hver vare ligger hos NOBB (fanen «Dokumentasjon» på lenken).</p>
            {fdvVarer.length > 0 && (
              <table className="tbl" style={{ breakInside: "auto" }}><thead><tr><th>Produkt</th><th>NOBB-nr</th><th>Antall</th><th>Dokumentasjon</th></tr></thead><tbody>
                {fdvVarer.map((v) => (
                  <tr key={v.varenr} style={{ breakInside: "avoid" }}>
                    <td style={{ whiteSpace: "normal" }}>{v.beskrivelse}</td>
                    <td>{v.nobb_nr}</td>
                    <td>{t2(v.antall)} {v.enhet.toLowerCase()}</td>
                    <td style={{ whiteSpace: "normal", wordBreak: "break-all" }}>{lenke(v) && <a href={lenke(v)}>{lenke(v).replace(/^https?:\/\/(www\.)?/, "")}</a>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
            {(fdv?.dok.length ?? 0) > 0 && (
              <>
                <h3 style={{ marginBottom: 4 }}>Vedlagte dokumenter</h3>
                <ul style={{ margin: 0 }}>{fdv!.dok.map((x) => <li key={x.id}>{x.navn}</li>)}</ul>
              </>
            )}
          </>
        )}
        <p className="small muted" style={{ marginTop: 16 }}>Spørsmål om arbeidet? Kontakt N L Austnes AS på 70 21 01 09.</p>
      </article>
    </>
  );
}
