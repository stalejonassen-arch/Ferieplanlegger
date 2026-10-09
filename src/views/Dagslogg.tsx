import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { addDays, kortDato } from "../lib/ferie";
import { t2 } from "../lib/timer";
import { AVVIK_TYPE, TILLEGG_STATUS } from "../lib/hms";
import { dagHendelser, prosjekterIDag, type Hendelse } from "../lib/dag";

const DAG = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
const IKON: Record<Hendelse["type"], string> = { timer: "⏱", dagbok: "📓", bilder: "📷", avvik: "⚠", tillegg: "✍" };

/** Alt som skjedde på én dag – timer, dagbok, bilder, avvik og tilleggsarbeid – på tvers av prosjekter. */
export function Dagslogg({ dato, setDato, ansattId }: { dato: string; setDato: (d: string) => void; ansattId: string }) {
  const { d, leder } = useApp();
  const [alle, setAlle] = useState(false);
  const hvem = useMemo(() => new Set(alle && leder ? d.ansatte.map((a) => a.id) : [ansattId]), [alle, leder, d.ansatte, ansattId]);
  const h = useMemo(() => dagHendelser(d, dato, hvem), [d, dato, hvem]);
  const prosjekter = prosjekterIDag(h);
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const pNavn = (id: string | null) => {
    if (!id) return "Internt arbeid";
    const p = d.prosjekter.find((x) => x.id === id);
    return p ? `${p.visma_nr ? p.visma_nr + " · " : ""}${p.navn}` : "Ukjent prosjekt";
  };
  const sumTimer = prosjekter.reduce((n, p) => n + p.timer, 0);

  return (
    <section className="panel">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Dagen</h2>
        <div className="cal-nav">
          <button className="btn sm" aria-label="Forrige dag" onClick={() => setDato(addDays(dato, -1))}>‹</button>
          <input type="date" value={dato} onChange={(e) => e.target.value && setDato(e.target.value)} aria-label="Dato" />
          <button className="btn sm" aria-label="Neste dag" onClick={() => setDato(addDays(dato, 1))}>›</button>
        </div>
      </div>
      <div className="row small" style={{ justifyContent: "space-between" }}>
        <span className="muted">{DAG[new Date(dato + "T00:00:00Z").getUTCDay()]} {kortDato(dato)} · {alle && leder ? "hele laget" : navn(ansattId)} · {t2(sumTimer)} t</span>
        {leder && <label className="row"><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> Vis hele laget</label>}
      </div>

      {prosjekter.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {prosjekter.map((p, i) => (
            <span key={p.prosjekt_id ?? "intern"} className="small" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px" }}>
              {i > 0 && "→ "}<b>{pNavn(p.prosjekt_id)}</b> {p.fra}–{p.til}{p.timer ? ` · ${t2(p.timer)} t` : ""}
            </span>
          ))}
        </div>
      )}

      {h.length === 0 && <p className="muted">Ingenting registrert denne dagen.</p>}
      <HendelseListe h={h} visNavn={alle && leder} visProsjekt />
    </section>
  );
}

/** Tidslinje for hendelser. visProsjekt: overskrift hver gang prosjektet skifter. */
export function HendelseListe({ h, visNavn, visProsjekt }: { h: Hendelse[]; visNavn?: boolean; visProsjekt?: boolean }) {
  const { d } = useApp();
  const [urler, setUrler] = useState<Record<string, string>>({});
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const pNavn = (id: string | null) => {
    if (!id) return "Internt arbeid";
    const p = d.prosjekter.find((x) => x.id === id);
    return p ? `${p.visma_nr ? p.visma_nr + " · " : ""}${p.navn}` : "Ukjent prosjekt";
  };
  const stier = h.flatMap((x) => (x.type === "bilder" ? x.bilder.map((b) => b.sti) : []));
  useEffect(() => {
    const mangler = stier.filter((s) => !urler[s]);
    if (mangler.length) api.bildeUrler(mangler).then((u) => setUrler((g) => ({ ...g, ...u }))).catch(() => {});
  }, [stier.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  let forrige: string | null | undefined;
  return (
    <div className="list">
      {h.map((x, i) => {
        const nyttProsjekt = visProsjekt && x.prosjekt_id !== forrige;
        forrige = x.prosjekt_id;
        return (
          <div key={i}>
            {nyttProsjekt && <div className="small" style={{ fontWeight: 600, margin: "10px 0 4px" }}>{pNavn(x.prosjekt_id)}</div>}
            <div className="item" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, display: "flex", gap: 10 }}>
                <span className="small muted" style={{ width: 92, flex: "none" }}>{x.type === "timer" ? `${x.tid}–${x.til}` : x.type === "dagbok" && x.senere ? "skrevet senere" : x.tid}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{IKON[x.type]} {tekst(x)}{visNavn ? <span className="muted"> · {navn(x.ansatt_id)}</span> : null}</div>
                  {detalj(x) && <div className="s" style={{ whiteSpace: "pre-wrap" }}>{detalj(x)}</div>}
                  {x.type === "bilder" && (
                    <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {x.bilder.map((b) => urler[b.sti]
                        ? <a key={b.id} href={urler[b.sti]} target="_blank" rel="noreferrer"><img src={urler[b.sti]} alt={b.tekst || "Bilde"} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }} /></a>
                        : <span key={b.id} style={{ width: 72, height: 72, borderRadius: 6, background: "var(--line)" }} />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tekst(x: Hendelse) {
  switch (x.type) {
    case "timer": return `${t2(x.t.timer)} t${x.prosjekt_id && x.t.fakturerbar === false ? " · ikke fakturerbart" : ""}${x.t.km ? ` · ${t2(x.t.km)} km` : ""}`;
    case "dagbok": return `Dagbok${x.x.vaer ? ` · ${x.x.vaer}` : ""}`;
    case "bilder": return `${x.bilder.length} bilde${x.bilder.length > 1 ? "r" : ""}`;
    case "avvik": return `${AVVIK_TYPE[x.x.type]}: ${x.x.tittel}`;
    case "tillegg": return `Tilleggsarbeid: ${x.x.tittel} · ${TILLEGG_STATUS[x.x.status]}`;
  }
}
function detalj(x: Hendelse) {
  switch (x.type) {
    case "timer": return x.t.beskrivelse;
    case "dagbok": return [x.x.tekst, x.x.hindringer ? `Hindringer: ${x.x.hindringer}` : ""].filter(Boolean).join("\n");
    case "bilder": return x.bilder.map((b) => b.tekst).filter(Boolean).join(" · ");
    case "avvik": return x.x.beskrivelse;
    case "tillegg": return x.x.beskrivelse;
  }
}
