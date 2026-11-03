// Leder: totaloversikt over timer per ansatt for en uke eller måned. Trykk på en ansatt for å gå inn på timene hans.
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [visning, setVisning] = useState<"uke" | "mnd">("mnd");
  const [start, setStart] = useState(() => mndStart(idag));
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
      {visning === "mnd" ? <MndRutenett fra={fra} til={til} onVelg={onVelg} /> : <>
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
      </>}
    </section>
  );
}

const UKEDAG = ["S", "M", "T", "O", "T", "F", "L"];
type Celle = { dato: string; timer: number; type: "timer" | "mangler" | "helg" | "ferie" | "syk" | "tom"; apen: boolean; tekst: string };

/** Måned som rutenett: én linje per ansatt, én rute per dag med timer. Rødt = mangler timer, F = ferie, S = syk. */
function MndRutenett({ fra, til, onVelg }: { fra: string; til: string; onVelg: (ansattId: string, dato: string) => void }) {
  const { d, idag } = useApp();
  const dager: string[] = [];
  for (let x = fra; x <= til; x = addDays(x, 1)) dager.push(x);
  const rader = useMemo(() => sorterAnsatte(d).filter((a) => a.aktiv).map((a) => {
    const forer = a.i_timerapport !== false;
    const ferie = d.soknader.filter((s) => s.ansatt_id === a.id && s.status === "godkjent");
    const fravaer = (d.fravaer ?? []).filter((x) => x.ansatt_id === a.id);
    const celler: Celle[] = dager.map((dato) => {
      const egne = d.timer.filter((t) => t.ansatt_id === a.id && t.dato === dato);
      const timer = egne.reduce((n, t) => n + Number(t.timer), 0);
      const apen = egne.some((t) => t.status !== "godkjent");
      const wd = new Date(dato + "T00:00:00Z").getUTCDay(), hd = helligdag(dato);
      const fri = wd === 0 || wd === 6 || !!hd;
      if (timer) return { dato, timer, type: "timer", apen, tekst: `${t2(timer)} t${apen ? " – ikke godkjent" : ""}` };
      if (ferie.some((s) => s.fra <= dato && s.til >= dato)) return { dato, timer, type: "ferie", apen, tekst: "Ferie" };
      if (fravaer.some((x) => x.fra <= dato && x.til >= dato)) return { dato, timer, type: "syk", apen, tekst: "Syk" };
      if (fri) return { dato, timer, type: "helg", apen, tekst: hd ?? "Helg" };
      if (forer && dato < idag) return { dato, timer, type: "mangler", apen, tekst: "Mangler timer" };
      return { dato, timer, type: "tom", apen, tekst: "" };
    });
    return { a, forer, celler, sum: celler.reduce((n, c) => n + c.timer, 0), mangler: celler.filter((c) => c.type === "mangler").length, apne: celler.filter((c) => c.apen).length };
  }).filter((r) => r.forer || r.sum > 0), [d, fra, til, idag]); // eslint-disable-line react-hooks/exhaustive-deps
  const dagSum = dager.map((_, i) => rader.reduce((n, r) => n + r.celler[i]!.timer, 0));
  // På smal skjerm: rull fram til dagens dato (eller slutten av måneden) så de siste dagene vises
  const boks = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boks.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const dag = el.querySelector<HTMLElement>(".mr-dag.idag") ?? null;
    el.scrollLeft = dag ? Math.max(0, dag.offsetLeft - el.clientWidth + 120) : el.scrollWidth;
  }, [fra]);

  return (
    <>
      <div ref={boks} className="mnd-rutenett" role="table" aria-label="Timer per dag" style={{ "--dager": dager.length } as React.CSSProperties}>
        <div className="mr-rad mr-hode" role="row">
          <div className="mr-navn" role="columnheader">Ansatt</div>
          {dager.map((x) => { const wd = new Date(x + "T00:00:00Z").getUTCDay(); return (
            <div key={x} role="columnheader" className={`mr-dag${wd === 0 || wd === 6 || helligdag(x) ? " fri" : ""}${x === idag ? " idag" : ""}`} title={kortDato(x)}>
              <span>{UKEDAG[wd]}</span><b>{Number(x.slice(8))}</b></div>
          ); })}
          <div className="mr-sum" role="columnheader">Sum</div>
          <div className="mr-sum" role="columnheader" title="Dager med timer som ikke er godkjent">Åpne</div>
        </div>
        {rader.map((r) => (
          <div key={r.a.id} className="mr-rad" role="row">
            <button type="button" className="mr-navn" role="rowheader" onClick={() => onVelg(r.a.id, r.celler.find((c) => c.apen)?.dato ?? [til, idag].sort()[0]!)} title={`Vis timene til ${r.a.navn}`}>
              <span className="lang">{r.a.navn}</span><span className="kort">{r.a.navn.split(" ")[0]}</span>
            </button>
            {r.celler.map((c) => (
              <button type="button" key={c.dato} role="cell" className={`mr-rute ${c.type}${c.apen ? " apen" : ""}`} title={`${r.a.navn} · ${kortDato(c.dato)}${c.tekst ? " · " + c.tekst : ""}`}
                onClick={() => onVelg(r.a.id, c.dato)} disabled={c.type === "helg" && !c.timer}>
                {c.type === "timer" ? t2(Math.round(c.timer * 2) / 2) : c.type === "ferie" ? "F" : c.type === "syk" ? "S" : c.type === "mangler" ? "!" : ""}
              </button>
            ))}
            <div className="mr-sum" role="cell"><b>{r.sum ? t2(r.sum) : "–"}</b></div>
            <div className="mr-sum" role="cell">{r.apne ? <span className="chip venter" title={`${r.apne} dager ikke godkjent`}>{r.apne}</span> : ""}</div>
          </div>
        ))}
        <div className="mr-rad mr-fot" role="row">
          <div className="mr-navn" role="rowheader">Totalt</div>
          {dagSum.map((n, i) => <div key={i} role="cell" className="mr-dag">{n ? t2(Math.round(n)) : ""}</div>)}
          <div className="mr-sum" role="cell"><b>{t2(dagSum.reduce((a, b) => a + b, 0))}</b></div>
          <div className="mr-sum" role="cell" />
        </div>
      </div>
      <div className="mr-forklaring small muted">
        <span><i className="mr-rute timer" /> Timer ført</span>
        <span><i className="mr-rute timer apen" /> Ikke godkjent</span>
        <span><i className="mr-rute mangler">!</i> Mangler timer</span>
        <span><i className="mr-rute ferie">F</i> Ferie</span>
        <span><i className="mr-rute syk">S</i> Syk</span>
        <span>Trykk på en dag for å gå rett til den.</span>
      </div>
    </>
  );
}
