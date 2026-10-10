import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api, feiltekst, type ProsjektOrdre } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { t2, type Prosjekt } from "../lib/timer";
import { liteFakturert, prosjektFakturering } from "../lib/faktura";

const kr = (n: number) => `kr ${Math.round(n).toLocaleString("nb-NO")}`;

/** Lønnsomhet: ordrene i Visma på kundeprosjektet, pluss timer fra ByggLogg. */
export function Lonnsomhet({ p }: { p: Prosjekt }) {
  const { d, kjor } = useApp();
  const [ordrer, setOrdrer] = useState<ProsjektOrdre[] | null>(null);
  const [feil, setFeil] = useState("");
  useEffect(() => { api.prosjektOrdre(p.id).then(setOrdrer).catch((e) => setFeil(feiltekst(e))); }, [p.id]);
  const timer = d.timer.filter((t) => t.prosjekt_id === p.id);
  const sumT = timer.reduce((n, t) => n + Number(t.timer), 0);
  const fakt = timer.filter((t) => t.fakturerbar !== false).reduce((n, t) => n + Number(t.timer), 0);
  const salg = (ordrer ?? []).filter((o) => o.transaksjonstype !== 2);
  const s = (f: (o: ProsjektOrdre) => number) => salg.reduce((n, o) => n + f(o), 0);
  // I Visma er «ordresum» det som gjenstår å fakturere; totalen er fakturert + gjenstår
  const fakturert = s((o) => o.fakturert), gjenstaar = s((o) => o.sum_netto), omsetning = fakturert + gjenstaar, db = s((o) => o.dekningsbidrag);

  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Økonomi</h2>
      <p className="small muted" style={{ margin: 0 }}>Ordrer i Visma på kundeprosjektet, oppdatert hvert kvarter. Bare du som leder ser denne siden.</p>
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={!!p.fakturert_full} onChange={(e) => kjor(() => api.settFakturertFull(p.id, e.target.checked), e.target.checked ? "Merket ferdig fakturert" : "Ikke lenger merket fakturert")} />
        Ferdig fakturert – alle fakturerbare timer teller som fakturert (full pott)
      </label>
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={!!p.fastpris} onChange={(e) => kjor(() => api.settFastpris(p.id, e.target.checked), e.target.checked ? "Merket som fastpris" : "Ikke lenger fastpris")} />
        Fastpris – faktureres uten «Arbeid», så timene holdes utenfor sammenligningen av fakturerte timer
      </label>
      {feil && <p className="small" style={{ color: "var(--warn)" }}>{feil}</p>}
      <div className="legend">
        <div><span className="label">Omsetning eks. mva</span><span className="v">{kr(omsetning)}</span></div>
        <div><span className="label">Dekningsbidrag</span><span className="v">{kr(db)}</span></div>
        <div><span className="label">DG</span><span className="v">{omsetning ? `${Math.round((db / omsetning) * 1000) / 10} %` : "–"}</span></div>
        <div><span className="label">Fakturert</span><span className="v">{kr(fakturert)}</span></div>
        <div><span className="label">Gjenstår å fakturere</span><span className="v" style={gjenstaar > 0 ? { color: "var(--warn)" } : undefined}>{kr(gjenstaar)}</span></div>
        <div><span className="label">Timer brukt</span><span className="v">{t2(sumT)}</span></div>
        <div><span className="label">Fakturerbare timer</span><span className="v">{t2(fakt)}</span></div>
      </div>
      {(() => {
        const f = prosjektFakturering(d).get(p.id);
        if (!f || !(d.fakturerteTimer ?? []).length) return null;
        return (
          <>
            <h3 style={{ margin: "4px 0 0" }}>Timer fakturert</h3>
            <div className="legend">
              <div><span className="label">Registrert fakturerbart</span><span className="v">{t2(Math.round(f.registrert))}</span></div>
              <div><span className="label">«Arbeid» fakturert</span><span className="v">{t2(Math.round(f.fakturert))}</span></div>
              <div><span className="label">På åpne ordrer</span><span className="v" style={f.aapent > 0 ? { color: "var(--pending-text)" } : undefined}>{t2(Math.round(f.aapent))}</span></div>
              {p.fastpris && <div><span className="label">Fastpris, beregnet</span><span className="v">{t2(Math.round(f.fastpris))}</span></div>}
              <div><span className="label">Ikke fakturert</span><span className="v" style={liteFakturert(f) ? { color: "var(--warn)" } : undefined}>{t2(Math.max(0, Math.round(f.registrert - f.fakturert - f.aapent - f.fastpris)))}</span></div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>«Arbeid» som er fakturert på kunden uten prosjektnummer fordeles på kundens prosjekter etter registrerte timer.</p>
          </>
        );
      })()}
      {ordrer === null ? <div className="empty">Henter ordrer …</div> : ordrer.length ? (
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Ordre</th><th>Dato</th><th>Fakturert</th><th>Gjenstår</th><th>DB</th></tr></thead>
            <tbody>
              {ordrer.map((o) => (
                <tr key={o.visma_ordrenr}>
                  <td className="n">{o.visma_ordrenr}{o.ordretype === 3 ? <span className="small muted"> kreditnota</span> : null}</td>
                  <td>{o.ordredato ? kortDato(o.ordredato) : "–"}</td>
                  <td className="n">{o.fakturert ? kr(o.fakturert) : "–"}</td>
                  <td className="n">{o.sum_netto ? kr(o.sum_netto) : "–"}</td>
                  <td className="n">{kr(o.dekningsbidrag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty">Ingen ordrer i Visma er knyttet til dette kundeprosjektet ennå. Velg kundeprosjekt på ordren i Business NXT, så dukker den opp her.</div>}
    </section>
  );
}
