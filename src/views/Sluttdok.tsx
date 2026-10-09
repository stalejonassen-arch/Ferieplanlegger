import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { langDato } from "../lib/ferie";
import { t2, type Prosjekt } from "../lib/timer";

/** Sluttdokumentasjon til kunden: utført arbeid, tilleggsarbeid, bilder. Skrives ut eller lagres som PDF fra nettleseren. */
export function Sluttdok({ p }: { p: Prosjekt }) {
  const { d, idag } = useApp();
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
        </div>
        <div><button className="btn primary" onClick={() => window.print()}>Lagre som PDF / skriv ut</button></div>
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
        <p className="small muted" style={{ marginTop: 16 }}>Spørsmål om arbeidet? Kontakt N L Austnes AS på 70 21 01 09.</p>
      </article>
    </>
  );
}
