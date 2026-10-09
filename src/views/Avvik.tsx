import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, sorterAnsatte } from "../lib/ferie";
import { AVVIK_STATUS, AVVIK_TYPE, type Avvik as AvvikT, type AvvikStatus, type AvvikType } from "../lib/hms";
import { Bilder } from "./Bilder";

type Filter = "aapne" | "mine" | "alle";

export function Avvik({ prosjektId }: { prosjektId?: string } = {}) {
  const { d, meg, leder, idag, kjor } = useApp();
  const [filter, setFilter] = useState<Filter>("aapne");
  const [apen, setApen] = useState<string | null>(null);
  const [ny, setNy] = useState({ type: "avvik" as AvvikType, tittel: "", beskrivelse: "", prosjekt_id: prosjektId ?? "" });
  const [filer, setFiler] = useState<FileList | null>(null);
  const [sender, setSender] = useState(false);

  const navn = (id: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const prosjekt = (id: string | null) => d.prosjekter.find((p) => p.id === id);
  const liste = d.avvik
    .filter((a) => !prosjektId || a.prosjekt_id === prosjektId)
    .filter((a) => filter === "alle" || (filter === "aapne" ? a.status !== "lukket" : a.meldt_av === meg.id || a.ansvarlig_id === meg.id));

  const meld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ny.tittel.trim()) return;
    setSender(true);
    const ok = await kjor(async () => {
      const id = await api.lagreAvvik({ type: ny.type, tittel: ny.tittel.trim(), beskrivelse: ny.beskrivelse.trim(), prosjekt_id: ny.prosjekt_id || null });
      for (const f of Array.from(filer ?? [])) await api.lastOppBilde(f, { avvik_id: id, prosjekt_id: ny.prosjekt_id || null });
    }, "Avviket er meldt. Takk!");
    setSender(false);
    if (ok) { setNy({ type: "avvik", tittel: "", beskrivelse: "", prosjekt_id: prosjektId ?? "" }); setFiler(null); }
  };

  return (
    <>
      <form className="panel" onSubmit={meld}>
        <h2>Meld avvik</h2>
        <p className="small muted">Alt som gikk galt eller kunne gått galt: feil i arbeid eller materiell, farlige forhold, nestenulykker og skader. Alle i bedriften ser meldingene.</p>
        <div className="row">
          <label className="field"><span className="label">Type</span>
            <select value={ny.type} onChange={(e) => setNy({ ...ny, type: e.target.value as AvvikType })}>
              {Object.entries(AVVIK_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {!prosjektId && (
            <label className="field"><span className="label">Prosjekt</span>
              <select value={ny.prosjekt_id} onChange={(e) => setNy({ ...ny, prosjekt_id: e.target.value })}>
                <option value="">Ikke knyttet til prosjekt</option>
                {d.prosjekter.filter((p) => p.aktiv).map((p) => <option key={p.id} value={p.id}>{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}</option>)}
              </select></label>
          )}
        </div>
        <label className="field"><span className="label">Hva skjedde?</span>
          <input type="text" value={ny.tittel} onChange={(e) => setNy({ ...ny, tittel: e.target.value })} placeholder="Kort, f.eks. «Løst rekkverk i trapp»" required /></label>
        <label className="field"><span className="label">Beskrivelse</span>
          <textarea rows={3} value={ny.beskrivelse} onChange={(e) => setNy({ ...ny, beskrivelse: e.target.value })} placeholder="Hvor, når, og hva som bør gjøres" /></label>
        <div className="row">
          <label className="btn sm">{filer?.length ? `${filer.length} bilde${filer.length > 1 ? "r" : ""} valgt` : "Legg ved bilder"}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setFiler(e.target.files)} /></label>
          {!!filer?.length && <button type="button" className="linkbtn small" onClick={() => setFiler(null)}>Fjern</button>}
        </div>
        <div><button className="btn primary" disabled={!ny.tittel.trim() || sender}>{sender ? "Sender …" : "Meld avvik"}</button></div>
      </form>

      <section className="panel">
        <div className="cal-head">
          <h2 style={{ margin: 0 }}>{prosjektId ? "Avvik på prosjektet" : "Avvik"}</h2>
          <div className="filter">
            {([["aapne", "Åpne"], ["mine", "Mine"], ["alle", "Alle"]] as [Filter, string][]).map(([f, t]) => (
              <button key={f} className="btn sm" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t}</button>
            ))}
          </div>
        </div>
        {liste.length ? (
          <div className="list">
            {liste.map((a) => (
              <AvvikRad key={a.id} a={a} apen={apen === a.id} veksle={() => setApen(apen === a.id ? null : a.id)}
                navn={navn} prosjekt={prosjekt(a.prosjekt_id)?.navn} idag={idag} leder={leder} megId={meg.id} kjor={kjor}
                ansatte={sorterAnsatte(d).filter((x) => x.aktiv)} bilder={d.bilder.filter((b) => b.avvik_id === a.id)} />
            ))}
          </div>
        ) : <div className="empty">{filter === "aapne" ? "Ingen åpne avvik." : "Ingen avvik."}</div>}
      </section>
    </>
  );
}

const statusKlasse: Record<AvvikStatus, string> = { apen: "avslatt", under_arbeid: "venter", lukket: "godkjent" };

function AvvikRad({ a, apen, veksle, navn, prosjekt, idag, leder, megId, kjor, ansatte, bilder }: {
  a: AvvikT; apen: boolean; veksle: () => void; navn: (id: string | null) => string; prosjekt?: string; idag: string;
  leder: boolean; megId: string; kjor: ReturnType<typeof useApp>["kjor"]; ansatte: ReturnType<typeof sorterAnsatte>;
  bilder: ReturnType<typeof useApp>["d"]["bilder"];
}) {
  const [e, setE] = useState({ ansvarlig_id: a.ansvarlig_id ?? "", frist: a.frist ?? "", status: a.status, tiltak: a.tiltak });
  const kanBehandle = leder || a.ansvarlig_id === megId;
  const forsinket = a.frist && a.status !== "lukket" && a.frist < idag;
  const lagre = () => kjor(() => api.lagreAvvik({
    id: a.id, tittel: a.tittel, status: e.status, tiltak: e.tiltak.trim(),
    ...(leder ? { ansvarlig_id: e.ansvarlig_id || null, frist: e.frist || null } : {}),
  }).then(() => {}), e.status === "lukket" ? "Avviket er lukket" : "Lagret");

  return (
    <div className={`item ${statusKlasse[a.status]}`}>
      <div style={{ minWidth: 0, cursor: "pointer" }} onClick={veksle}>
        <div className="t">{a.tittel}</div>
        <div className="s">{AVVIK_TYPE[a.type]}{prosjekt ? ` · ${prosjekt}` : ""} · meldt av {navn(a.meldt_av)} {kortDato(a.opprettet.slice(0, 10))}</div>
        {(a.ansvarlig_id || a.frist) && <div className="s" style={forsinket ? { color: "var(--warn)" } : undefined}>
          {a.ansvarlig_id ? `Ansvarlig: ${navn(a.ansvarlig_id)}` : ""}{a.frist ? ` · frist ${kortDato(a.frist)}${forsinket ? " (forsinket)" : ""}` : ""}</div>}
      </div>
      <div className="acts"><span className={`chip ${statusKlasse[a.status]}`}>{AVVIK_STATUS[a.status]}</span>
        <button className="btn sm" onClick={veksle}>{apen ? "Skjul" : "Vis"}</button></div>
      {apen && (
        <div className="full">
          {a.beskrivelse && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.beskrivelse}</p>}
          {a.status === "lukket" && a.tiltak && <p className="small" style={{ margin: 0 }}><b>Tiltak:</b> {a.tiltak}</p>}
          <Bilder bilder={bilder} til={{ avvik_id: a.id, prosjekt_id: a.prosjekt_id }} />
          {kanBehandle && (
            <div className="panel" style={{ background: "var(--sunk)" }}>
              {leder && (
                <div className="row">
                  <label className="field"><span className="label">Ansvarlig</span>
                    <select value={e.ansvarlig_id} onChange={(x) => setE({ ...e, ansvarlig_id: x.target.value })}>
                      <option value="">Ingen</option>
                      {ansatte.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
                    </select></label>
                  <label className="field"><span className="label">Frist</span>
                    <input type="date" value={e.frist} onChange={(x) => setE({ ...e, frist: x.target.value })} /></label>
                </div>
              )}
              <label className="field"><span className="label">Tiltak</span>
                <textarea rows={2} value={e.tiltak} onChange={(x) => setE({ ...e, tiltak: x.target.value })} placeholder="Hva er gjort for å rette opp og hindre at det skjer igjen" /></label>
              <div className="row">
                <select aria-label="Status" value={e.status} onChange={(x) => setE({ ...e, status: x.target.value as AvvikStatus })}>
                  {Object.entries(AVVIK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="btn primary sm" onClick={lagre}>Lagre</button>
                {leder && <button className="btn sm no" onClick={() => kjor(() => api.slettAvvik(a.id), "Avviket er slettet")}>Slett</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
