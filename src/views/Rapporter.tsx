import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { isoOf } from "../lib/ferie";
import { gyldigLenke, lesestatus, periodeNavn, uleste, type NyRapport, type Rapport } from "../lib/rapport";

const kl = (iso: string) => new Date(iso).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Forrige måned som 2026-09-01 */
function forrigeMnd(idag: string) {
  const d = new Date(Number(idag.slice(0, 4)), Number(idag.slice(5, 7)) - 2, 1);
  return isoOf(d);
}

/** Åpner rapporten (lenke eller PDF) og merker den som lest. */
export async function lesRapport(r: Rapport, kjor: (fn: () => Promise<void>, ok?: string) => Promise<boolean>) {
  const vindu = window.open("", "_blank");
  try {
    const url = r.sti ? await api.dokUrl(r.sti) : r.lenke;
    if (vindu) vindu.location.href = url; else location.href = url;
  } catch { vindu?.close(); }
  await kjor(() => api.markerLest(r.id));
}

export function Rapporter() {
  const { d, meg, leder, idag, kjor } = useApp();
  const ulest = new Set(uleste(d.rapporter, d.lest, meg.id).map((r) => r.id));
  const [skjema, setSkjema] = useState<NyRapport | null>(null);
  const [apen, setApen] = useState<string | null>(null);
  const [sender, setSender] = useState(false);

  const ny = () => {
    const p = forrigeMnd(idag);
    setSkjema({ tittel: `Månedsrapport ${periodeNavn(p)}`, periode: p, ingress: "", lenke: "", fil: null, publiser: false });
  };
  const lagre = async (publiser: boolean) => {
    if (!skjema) return;
    if (publiser && !window.confirm(`Publisere «${skjema.tittel}» og sende e-post til alle ansatte nå?`)) return;
    setSender(true);
    const ok = await kjor(() => api.lagreRapport({ ...skjema, publiser }), publiser ? "Publisert – de ansatte får e-post" : "Lagret som utkast");
    setSender(false);
    if (ok) setSkjema(null);
  };
  const kanLagre = skjema && skjema.tittel.trim() && /^\d{4}-\d{2}-01$/.test(skjema.periode) && gyldigLenke(skjema.lenke)
    && (skjema.lenke.trim() || skjema.fil || (skjema.id && d.rapporter.find((r) => r.id === skjema.id)?.sti));

  return (
    <>
      {leder && !skjema && (
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Månedsrapporter</h2>
            <button className="btn primary" onClick={ny}>Ny rapport</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Legg inn rapporten som PDF eller lenke. Når du publiserer, får alle ansatte e-post, og du ser her hvem som har åpnet den.</p>
        </section>
      )}

      {skjema && (
        <form className="panel" onSubmit={(e) => { e.preventDefault(); lagre(false); }}>
          <h2 style={{ margin: 0 }}>{skjema.id ? "Endre rapport" : "Ny månedsrapport"}</h2>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 2 }}><span className="label">Tittel</span>
              <input value={skjema.tittel} onChange={(e) => setSkjema({ ...skjema, tittel: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span className="label">Måned</span>
              <input type="month" value={skjema.periode.slice(0, 7)} onChange={(e) => setSkjema({ ...skjema, periode: `${e.target.value}-01` })} /></label>
          </div>
          <label className="field"><span className="label">Kort tekst til de ansatte (står i e-posten)</span>
            <textarea rows={2} value={skjema.ingress} onChange={(e) => setSkjema({ ...skjema, ingress: e.target.value })} placeholder="F.eks. September ga 499 timer på kunde. Les hele rapporten her." /></label>
          <label className="field"><span className="label">PDF av rapporten</span>
            <input type="file" accept="application/pdf" onChange={(e) => setSkjema({ ...skjema, fil: e.target.files?.[0] ?? null })} /></label>
          <label className="field"><span className="label">Eller lenke (delt lenke til presentasjonen)</span>
            <input value={skjema.lenke} onChange={(e) => setSkjema({ ...skjema, lenke: e.target.value })} placeholder="https://claude.ai/artifact/…" />
            {!gyldigLenke(skjema.lenke) && <span className="small" style={{ color: "var(--warn)" }}>Lenken må starte med https://</span>}</label>
          <p className="small muted" style={{ margin: 0 }}>PDF er tryggest: den åpnes rett i ByggLogg for alle. Bruker du lenke, må den være delt så alle med lenken kan se den.</p>
          <div className="row">
            <button className="btn" disabled={!kanLagre || sender}>Lagre utkast</button>
            <button type="button" className="btn primary" disabled={!kanLagre || sender} onClick={() => lagre(true)}>{sender ? "Sender …" : "Publiser og varsle alle"}</button>
            <button type="button" className="btn" onClick={() => setSkjema(null)}>Avbryt</button>
          </div>
        </form>
      )}

      <section className="panel">
        {!leder && <h2 style={{ margin: 0 }}>Månedsrapporter</h2>}
        {d.rapporter.length === 0 && <p className="muted">Ingen rapporter ennå.</p>}
        {d.rapporter.map((r) => {
          const s = leder ? lesestatus(r, d.lest, d.ansatte) : null;
          return (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <b>{r.tittel}</b> {ulest.has(r.id) && <span className="chip godkjent">Ny</span>} {!r.publisert && <span className="chip venter">Utkast</span>}
                  <div className="small muted">{r.publisert ? `Publisert ${kl(r.publisert)}` : "Ikke publisert – bare leder ser den"}</div>
                  {r.ingress && <p style={{ margin: "6px 0 0" }}>{r.ingress}</p>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className={`btn sm${ulest.has(r.id) ? " primary" : ""}`} onClick={() => r.publisert ? lesRapport(r, kjor) : window.open(r.lenke || "", "_blank")}
                    disabled={!r.publisert && !r.lenke}>Les</button>
                  {leder && !r.publisert && <button className="btn sm" onClick={() => setSkjema({ id: r.id, tittel: r.tittel, periode: r.periode, ingress: r.ingress, lenke: r.lenke, fil: null, publiser: false })}>Endre</button>}
                  {leder && <button className="btn sm no" onClick={() => window.confirm(`Slette «${r.tittel}»?`) && kjor(() => api.slettRapport(r.id, r.sti), "Slettet")}>Slett</button>}
                </div>
              </div>
              {s && r.publisert && (
                <div>
                  <button className="btn sm" onClick={() => setApen(apen === r.id ? null : r.id)}>
                    Lest av {s.lest.length} av {s.lest.length + s.mangler.length} {apen === r.id ? "▲" : "▼"}
                  </button>
                  {apen === r.id && (
                    <div className="row" style={{ alignItems: "flex-start", marginTop: 8, gap: 32 }}>
                      <div><div className="label">Har lest</div>
                        {s.lest.length === 0 ? <div className="small muted">Ingen ennå</div> : s.lest.map((x) => <div key={x.ansatt.id} className="small">✓ {x.ansatt.navn} <span className="muted">{kl(x.tid)}</span></div>)}</div>
                      <div><div className="label">Har ikke lest</div>
                        {s.mangler.length === 0 ? <div className="small muted">Alle har lest</div> : s.mangler.map((a) => <div key={a.id} className="small">{a.navn}</div>)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
