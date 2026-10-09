import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { prosjektTimer, t2 } from "../lib/timer";
import { Bilder } from "./Bilder";
import { Avvik } from "./Avvik";

export function Prosjekter() {
  const { d, leder, kjor } = useApp();
  const [sok, setSok] = useState("");
  const [visAvsluttet, setVisAvsluttet] = useState(false);
  const [navn, setNavn] = useState("");
  const [kundeId, setKundeId] = useState("");
  const [nyKunde, setNyKunde] = useState("");
  const [estimat, setEstimat] = useState("");
  const [valgt, setValgt] = useState<string | null>(null);
  const brukt = prosjektTimer(d);
  const [visma, setVisma] = useState<{ tid: string; ok: boolean; melding: string } | null>(null);
  useEffect(() => { if (leder) api.vismaStatus().then(setVisma).catch(() => {}); }, [leder, d]);
  const kunde = (id: string | null) => d.kunder.find((k) => k.id === id)?.navn ?? "";
  const q = sok.trim().toLowerCase();
  const liste = d.prosjekter
    .filter((p) => visAvsluttet || p.aktiv)
    .filter((p) => !q || `${p.visma_nr ?? ""} ${p.navn} ${kunde(p.kunde_id)} ${p.adresse}`.toLowerCase().includes(q));
  const fraVisma = d.prosjekter.some((p) => p.visma_nr);

  const leggTil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navn.trim()) return;
    const ok = await kjor(() => api.lagreProsjekt({ navn: navn.trim(), kunde_id: kundeId || null, estimert_timer: Number(estimat.replace(",", ".")) || null }, kundeId ? undefined : nyKunde),
      `Prosjektet «${navn.trim()}» er lagt til`);
    if (ok) { setNavn(""); setKundeId(""); setNyKunde(""); setEstimat(""); }
  };

  const vp = valgt ? d.prosjekter.find((p) => p.id === valgt) : undefined;
  if (vp) {
    const egne = d.timer.filter((t) => t.prosjekt_id === vp.id);
    const perAnsatt = new Map<string, number>();
    for (const t of egne) perAnsatt.set(t.ansatt_id, (perAnsatt.get(t.ansatt_id) ?? 0) + Number(t.timer));
    const sumT = egne.reduce((n, t) => n + Number(t.timer), 0);
    return (
      <>
        <div><button className="btn sm" onClick={() => setValgt(null)}>‹ Alle prosjekter</button></div>
        <section className="panel">
          <h2 style={{ margin: 0 }}>{vp.visma_nr ? `${vp.visma_nr} · ` : ""}{vp.navn}</h2>
          <div className="small muted">{[kunde(vp.kunde_id), vp.adresse].filter(Boolean).join(" · ")}</div>
          <div className="legend">
            <div><span className="label">Timer{leder ? "" : " (dine)"}</span><span className="v">{t2(sumT)}{vp.estimert_timer ? ` / ${t2(Number(vp.estimert_timer))}` : ""}</span></div>
            {leder && [...perAnsatt].map(([id, n]) => <div key={id}><span className="label">{d.ansatte.find((a) => a.id === id)?.navn}</span><span className="v">{t2(n)}</span></div>)}
          </div>
          <Bilder bilder={d.bilder.filter((b) => b.prosjekt_id === vp.id)} til={{ prosjekt_id: vp.id }} tittel="Bilder fra prosjektet" />
        </section>
        <Avvik prosjektId={vp.id} />
      </>
    );
  }

  return (
    <>
      <section className="panel">
        <div className="cal-head">
          <h2 style={{ margin: 0 }}>Prosjekter</h2>
          <div className="row">
            <input type="search" aria-label="Søk i prosjekter" placeholder="Søk på nr, navn, kunde" value={sok} onChange={(e) => setSok(e.target.value)} />
            <label className="row small"><input type="checkbox" checked={visAvsluttet} onChange={(e) => setVisAvsluttet(e.target.checked)} /> Vis avsluttede</label>
          </div>
        </div>
        <p className="small muted">{fraVisma ? "Prosjekter og kunder hentes automatisk fra Visma Business NXT." : "Når koblingen til Visma Business NXT er på plass, hentes prosjekter og kunder automatisk derfra."}{leder ? "" : " Timene som vises er dine egne."}</p>
        {leder && visma && (
          <p className="small" style={{ color: visma.ok ? "var(--muted)" : "var(--warn)" }}>
            Sist hentet fra Visma {new Date(visma.tid).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}: {visma.ok ? "OK" : visma.melding.includes("VISMA_CLIENT_SECRET") ? "venter på nøkkel fra Visma Developer Portal" : visma.melding.slice(0, 160)}
          </p>
        )}
        {liste.length ? (
          <div className="scroll" style={{ border: 0 }}>
            <table className="tbl">
              <thead><tr><th>Nr</th><th>Prosjekt</th><th>Timer</th>{leder && <th />}</tr></thead>
              <tbody>
                {liste.map((p) => {
                  const b = brukt.get(p.id) ?? 0, est = p.estimert_timer ? Number(p.estimert_timer) : null;
                  return (
                    <tr key={p.id} style={p.aktiv ? undefined : { color: "var(--muted)" }}>
                      <td className="n">{p.visma_nr ?? "–"}</td>
                      <td style={{ whiteSpace: "normal" }}><button className="linkbtn" onClick={() => setValgt(p.id)}>{p.navn}</button>
                        {kunde(p.kunde_id) && <div className="small muted">{kunde(p.kunde_id)}</div>}
                        {(() => { const n = d.avvik.filter((a) => a.prosjekt_id === p.id && a.status !== "lukket").length; const b = d.bilder.filter((x) => x.prosjekt_id === p.id).length;
                          return (n || b) ? <div className="small muted">{b ? `${b} bilder` : ""}{n && b ? " · " : ""}{n ? <span style={{ color: "var(--warn)" }}>{n} åpne avvik</span> : ""}</div> : null; })()}</td>
                      <td className="n" style={est && b > est ? { color: "var(--warn)" } : undefined}>{t2(b)}{est ? ` / ${t2(est)}` : ""}</td>
                      {leder && <td><button className="btn sm" onClick={() => kjor(() => api.lagreProsjekt({ id: p.id, navn: p.navn, aktiv: !p.aktiv }), p.aktiv ? "Avsluttet" : "Åpnet igjen")}>{p.aktiv ? "Avslutt" : "Åpne"}</button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">{q ? "Ingen prosjekter passer søket." : "Ingen prosjekter ennå."}</div>}
      </section>

      {leder && (
        <form className="panel" onSubmit={leggTil}>
          <h2>Nytt prosjekt</h2>
          <p className="small muted">Bruk dette bare for prosjekter som ikke finnes i Visma.</p>
          <div className="row">
            <label className="field"><span className="label">Prosjektnavn</span>
              <input type="text" value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. Skifte vindu" required /></label>
            <label className="field"><span className="label">Kunde</span>
              <select value={kundeId} onChange={(e) => setKundeId(e.target.value)}>
                <option value="">Ny kunde …</option>
                {d.kunder.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
              </select></label>
            {!kundeId && <label className="field"><span className="label">Navn på ny kunde</span>
              <input type="text" value={nyKunde} onChange={(e) => setNyKunde(e.target.value)} placeholder="Valgfritt" /></label>}
            <label className="field"><span className="label">Estimert (timer)</span>
              <input type="text" inputMode="decimal" value={estimat} onChange={(e) => setEstimat(e.target.value)} placeholder="Valgfritt" /></label>
          </div>
          <div><button className="btn primary" disabled={!navn.trim()}>Legg til prosjekt</button></div>
        </form>
      )}
    </>
  );
}
