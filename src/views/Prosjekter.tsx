import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { prosjektTimer, sistAktiv, t2 } from "../lib/timer";
import { kortDato } from "../lib/ferie";
import { ProsjektSide } from "./ProsjektSide";
import { Fordeling } from "./Fordeling";
import { Maal } from "./Maal";

export function Prosjekter() {
  const { d, meg, leder, kjor } = useApp();
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
  // Prosjekter med aktivitet nylig først, så resten etter prosjektnummer (nyeste først)
  const sist = sistAktiv(d);
  const mine = new Set(d.timer.filter((t) => t.ansatt_id === meg.id && t.prosjekt_id).map((t) => t.prosjekt_id as string));
  const liste = d.prosjekter
    .filter((p) => visAvsluttet || p.aktiv)
    .filter((p) => !q || `${p.visma_nr ?? ""} ${p.navn} ${kunde(p.kunde_id)} ${p.adresse}`.toLowerCase().includes(q))
    .sort((a, b) => (sist.get(b.id) ?? "").localeCompare(sist.get(a.id) ?? "") || (b.visma_nr ?? 0) - (a.visma_nr ?? 0));
  const fraVisma = d.prosjekter.some((p) => p.visma_nr);

  const leggTil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navn.trim()) return;
    const ok = await kjor(() => api.lagreProsjekt({ navn: navn.trim(), kunde_id: kundeId || null, estimert_timer: Number(estimat.replace(",", ".")) || null }, kundeId ? undefined : nyKunde),
      `Prosjektet «${navn.trim()}» er lagt til`);
    if (ok) { setNavn(""); setKundeId(""); setNyKunde(""); setEstimat(""); }
  };

  const vp = valgt ? d.prosjekter.find((p) => p.id === valgt) : undefined;
  if (vp) return <ProsjektSide p={vp} tilbake={() => setValgt(null)} />;

  return (
    <>
      {leder && <Maal />}
      {leder && <Fordeling />}
      <section className="panel">
        <div className="cal-head">
          <h2 style={{ margin: 0 }}>Prosjekter</h2>
          <div className="row">
            <input type="search" aria-label="Søk i prosjekter" placeholder="Søk på nr, navn, kunde" value={sok} onChange={(e) => setSok(e.target.value)} />
            <label className="row small"><input type="checkbox" checked={visAvsluttet} onChange={(e) => setVisAvsluttet(e.target.checked)} /> Vis avsluttede</label>
          </div>
        </div>
        <p className="small muted">{fraVisma ? "Prosjekter og kunder hentes automatisk fra Visma Business NXT." : "Når koblingen til Visma Business NXT er på plass, hentes prosjekter og kunder automatisk derfra."}{" Prosjekter med aktivitet sist står øverst."}</p>
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
                        {sist.get(p.id) && <div className="small muted">Sist aktivitet {kortDato(sist.get(p.id)!)}{mine.has(p.id) ? " · du har ført timer her" : ""}</div>}
                        {(() => { const n = d.avvik.filter((a) => a.prosjekt_id === p.id && a.status !== "lukket").length; const b = d.bilder.filter((x) => x.prosjekt_id === p.id).length;
                          return (n || b) ? <div className="small muted">{b ? `${b} bilder` : ""}{n && b ? " · " : ""}{n ? <span style={{ color: "var(--warn)" }}>{n} åpne avvik</span> : ""}</div> : null; })()}</td>
                      <td className="n" style={est && b > est ? { color: "var(--warn)" } : est && b >= est * 0.9 ? { color: "var(--pending)" } : undefined}
                        title={est ? `${Math.round((b / est) * 100)} % av kalkulerte timer` : undefined}>{t2(b)}{est ? ` / ${t2(est)}` : ""}
                        {est && b >= est * 0.9 && <div className="small">{b > est ? "over kalkyle" : "snart brukt opp"}</div>}</td>
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
