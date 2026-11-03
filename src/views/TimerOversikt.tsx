// Leder: totaloversikt over timer per ansatt for en uke eller måned. Trykk på en ansatt for å gå inn på timene hans.
import { useMemo, useState } from "react";
import { useApp } from "../App";
import { addDays, helligdag, kortDato, sorterAnsatte } from "../lib/ferie";
import { dagerUtenTimer, lonnsdager, mandag, t2, ukenr } from "../lib/timer";

const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const mndStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const mndSlutt = (iso: string) => { const [a, m] = iso.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const flyttMnd = (iso: string, n: number) => { const [a, m] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10); };

export interface OversiktRad {
  id: string; navn: string; hopp: string; timer: number; kunde: number; ikkeFakt: number; intern: number; overtid: number; mangler: string[]; ikkeGodkjent: number; forer: boolean;
}

export function TimerOversikt({ onVelg }: { onVelg: (ansattId: string, dato: string) => void }) {
  const { d, idag } = useApp();
  const [visning, setVisning] = useState<"uke" | "mnd">("uke");
  const [start, setStart] = useState(() => mandag(idag));
  const fra = visning === "uke" ? start : mndStart(start);
  const til = visning === "uke" ? addDays(start, 6) : mndSlutt(start);
  const bytt = (v: "uke" | "mnd") => { setVisning(v); setStart(v === "uke" ? mandag(idag) : mndStart(idag)); };
  const bla = (n: number) => setStart(visning === "uke" ? addDays(start, 7 * n) : flyttMnd(start, n));

  const rader = useMemo<OversiktRad[]>(() => sorterAnsatte(d).filter((a) => a.aktiv).map((a) => {
    const egne = d.timer.filter((t) => t.ansatt_id === a.id && t.dato >= fra && t.dato <= til);
    const sum = (f: (t: (typeof egne)[number]) => boolean) => egne.filter(f).reduce((n, t) => n + Number(t.timer), 0);
    const lonn = lonnsdager(a, d.timer, fra, til);
    // Hverdager uten timer fram til i dag (bare for de som fører timer)
    const forer = a.i_timerapport !== false;
    const mangler: string[] = [];
    if (forer) for (let u = mandag(fra); u <= til && u < idag; u = addDays(u, 7)) {
      const slutt = [addDays(u, 7), addDays(til, 1), idag].sort()[0]!;
      mangler.push(...dagerUtenTimer(a.id, d, u, slutt, helligdag).filter((x) => x >= fra));
    }
    return {
      id: a.id, navn: a.navn, forer,
      timer: sum(() => true),
      kunde: sum((t) => !!t.prosjekt_id && t.fakturerbar !== false),
      ikkeFakt: sum((t) => !!t.prosjekt_id && t.fakturerbar === false),
      intern: sum((t) => !t.prosjekt_id),
      overtid: lonn.reduce((n, x) => n + x.ot50 + x.ot100, 0),
      mangler, ikkeGodkjent: egne.filter((t) => t.status !== "godkjent").length,
      // Uka man havner i ved trykk: første uke med timer som ikke er godkjent, ellers siste uke med timer, ellers siste uke fram til i dag
      hopp: egne.filter((t) => t.status !== "godkjent").map((t) => t.dato).sort()[0] ?? egne.map((t) => t.dato).sort().pop() ?? [til, idag].sort()[0]!,
    };
  }), [d, fra, til, idag]);

  const tot = rader.reduce((s, r) => ({ timer: s.timer + r.timer, kunde: s.kunde + r.kunde, intern: s.intern + r.intern, overtid: s.overtid + r.overtid, ikkeGodkjent: s.ikkeGodkjent + r.ikkeGodkjent }),
    { timer: 0, kunde: 0, intern: 0, overtid: 0, ikkeGodkjent: 0 });
  const tittel = visning === "uke" ? `Uke ${ukenr(start)}` : `${MND[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
  const vis = rader.filter((r) => r.forer || r.timer > 0);

  return (
    <section className="panel timeoversikt">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Timer per ansatt</h2>
        <div className="row" style={{ gap: 6 }}>
          <div className="seg" role="group" aria-label="Periode">
            <button type="button" className={`btn sm${visning === "uke" ? " primary" : ""}`} aria-pressed={visning === "uke"} onClick={() => bytt("uke")}>Uke</button>
            <button type="button" className={`btn sm${visning === "mnd" ? " primary" : ""}`} aria-pressed={visning === "mnd"} onClick={() => bytt("mnd")}>Måned</button>
          </div>
          <div className="cal-nav">
            <button className="btn sm" aria-label="Forrige periode" onClick={() => bla(-1)}>‹</button>
            <span className="small" style={{ fontWeight: 600, textTransform: visning === "mnd" ? "capitalize" : undefined }}>{tittel}</span>
            <button className="btn sm" aria-label="Neste periode" onClick={() => bla(1)}>›</button>
          </div>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{kortDato(fra)} – {kortDato(til).replace(/\.$/, "")}. Trykk på en ansatt for å se, rette og godkjenne timene.</p>
      <div className="scroll" style={{ border: 0 }}>
        <table className="tbl timeoversikt-tbl">
          <thead><tr>
            <th>Ansatt</th><th className="n">Timer</th><th className="n">På kunde</th><th className="n">Internt</th><th className="n">Overtid</th><th>Mangler</th><th className="n" title="Timeføringer som ikke er godkjent"><span className="lang">Ikke godkj.</span><span className="kort">Åpne</span></th>
          </tr></thead>
          <tbody>
            {vis.map((r) => (
              <tr key={r.id} className="klikkbar" tabIndex={0} role="button" aria-label={`Vis timene til ${r.navn}`}
                onClick={() => onVelg(r.id, r.hopp)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVelg(r.id, r.hopp); } }}>
                <td><b>{r.navn}</b><span className="muted lang" aria-hidden="true"> ›</span></td>
                <td className="n">{r.timer ? t2(r.timer) : "–"}</td>
                <td className="n">{r.kunde ? t2(r.kunde) : "–"}</td>
                <td className="n">{r.intern ? t2(r.intern) : "–"}</td>
                <td className="n" style={r.overtid ? { color: "var(--warn)" } : undefined}>{r.overtid ? t2(r.overtid) : "–"}</td>
                <td>{r.mangler.length ? <span className="chip avslatt" title={r.mangler.map(kortDato).join(", ")}>{r.mangler.length}<span className="lang"> {r.mangler.length === 1 ? "dag" : "dager"}</span></span> : r.forer ? <span className="chip godkjent">OK</span> : ""}</td>
                <td className="n">{r.ikkeGodkjent ? <span className="chip venter">{r.ikkeGodkjent}</span> : "–"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr>
            <th>Totalt</th><th className="n">{t2(tot.timer)}</th><th className="n">{t2(tot.kunde)}</th><th className="n">{t2(tot.intern)}</th><th className="n">{t2(tot.overtid)}</th><th></th><th className="n">{tot.ikkeGodkjent || "–"}</th>
          </tr></tfoot>
        </table>
      </div>
    </section>
  );
}
