import { useState } from "react";
import { useApp } from "../App";
import { perKunde } from "../lib/faktura";
import { t2 } from "../lib/timer";

/** Fakturering per kunde: registrerte fakturerbare timer mot fakturerte timer i Visma */
export function Fakturering() {
  const { d, idag } = useApp();
  const aar = Number(idag.slice(0, 4));
  const [alle, setAlle] = useState(false);
  if (!(d.fakturerteTimer ?? []).length) return null;
  const rader = perKunde(d, aar);
  const vis = alle ? rader : rader.slice(0, 12);
  const sum = (f: (r: (typeof rader)[number]) => number) => rader.reduce((n, r) => n + f(r), 0);
  const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Fakturering per kunde {aar}</h2>
      <p className="small muted">Registrert = fakturerbare timer ført i ByggLogg (og importert fra Svenn) på kundens prosjekter. Fakturert = antall «Arbeid» fakturert i Visma i år. Åpent = Arbeid som ligger på ordre, men ikke er fakturert. Stor forskjell kan bety fastpris, at timene er fakturert på en annen kunde, eller at noe ikke er fakturert.</p>
      <div className="scroll" style={{ border: 0 }}>
        <table className="tbl">
          <thead><tr><th>Kunde</th><th className="n">Registrert</th><th className="n">Fakturert</th><th className="n">Åpent</th><th className="n">Fakturert kr</th></tr></thead>
          <tbody>
            {vis.map((r) => {
              const mangler = r.registrert - r.fakturert - r.aapent;
              return (
                <tr key={r.kunde_id ?? "-"}>
                  <td style={{ whiteSpace: "normal" }}>{r.navn}</td>
                  <td className="n">{t2(r.registrert)}</td>
                  <td className="n">{t2(r.fakturert)}</td>
                  <td className="n" style={r.aapent > 0 ? { color: "var(--pending-text)" } : undefined}>{r.aapent ? t2(r.aapent) : "–"}</td>
                  <td className="n">{r.kr ? kr(r.kr) : "–"}{mangler > 20 && <span className="chip demo" style={{ marginLeft: 6 }} title="Flere registrerte timer enn fakturert og åpent">{t2(Math.round(mangler))} t ikke på ordre</span>}</td>
                </tr>
              );
            })}
            <tr><td><b>Sum</b></td><td className="n"><b>{t2(Math.round(sum((r) => r.registrert)))}</b></td><td className="n"><b>{t2(Math.round(sum((r) => r.fakturert)))}</b></td><td className="n"><b>{t2(Math.round(sum((r) => r.aapent)))}</b></td><td className="n"><b>{kr(sum((r) => r.kr))}</b></td></tr>
          </tbody>
        </table>
      </div>
      {rader.length > 12 && <button className="linkbtn small" style={{ alignSelf: "flex-start" }} onClick={() => setAlle(!alle)}>{alle ? "Vis færre" : `Vis alle ${rader.length} kunder`}</button>}
    </section>
  );
}
