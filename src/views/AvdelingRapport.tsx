// Egen rapport per avdeling i Visma (f.eks. Kjøkken og Interiør): antall salg, omsetning,
// reell fortjeneste (dekningsbidrag) og DG, per måned og hittil i år mot i fjor.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { dgFor, iFjor, iPeriode, manglerKost, summer, type AvdelingSalg, type VismaAvdeling } from "../lib/avdeling";

const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
const tall = (n: number) => Math.round(n).toLocaleString("nb-NO");
const krKort = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString("nb-NO", { maximumFractionDigits: 2 })} mill. kr` : kr(n));
const pst = (n: number | null) => (n == null ? "–" : `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`);
const dgTall = (n: number | null) => (n == null ? "–" : n.toLocaleString("nb-NO", { maximumFractionDigits: 1 }));
const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const kort = (iso: string) => { const [y, m, d] = iso.split("-"); return `${Number(d)}.${Number(m)}.${y.slice(2)}`; };

function Endring({ na, da, tekst }: { na: number; da: number; tekst?: string }) {
  if (!da) return null;
  const e = Math.round(((na - da) / Math.abs(da)) * 100);
  return <span className="small" style={{ color: e >= 0 ? "var(--ok, #1b7f3b)" : "var(--warn)" }}>{e >= 0 ? "▲" : "▼"} {Math.abs(e)} % {tekst ?? "mot i fjor"}</span>;
}

export function AvdelingRapporter() {
  const { idag, d } = useApp();
  const [data, setData] = useState<{ avdelinger: VismaAvdeling[]; salg: AvdelingSalg[] } | null>(null);
  const [avd, setAvd] = useState<number | null>(null);
  const [aar, setAar] = useState(Number(idag.slice(0, 4)));
  const [visOrdre, setVisOrdre] = useState(false);
  useEffect(() => { api.avdelingSalg().then(setData).catch(() => setData(null)); }, [d.prosjekter.length]);

  const med = useMemo(() => (data?.avdelinger ?? []).filter((a) => data!.salg.some((o) => o.avdeling_nr === a.nr)), [data]);
  if (!data || !med.length) return null;
  const valgt = med.find((a) => a.nr === avd) ?? med.find((a) => /kjøkken|interi/i.test(a.navn)) ?? med[0]!;
  const ordre = data.salg.filter((o) => o.avdeling_nr === valgt.nr);
  const aarene = [...new Set(ordre.map((o) => Number((o.fakturadato ?? o.ordredato ?? idag).slice(0, 4))))].sort((a, b) => b - a);
  const iAar = aar === Number(idag.slice(0, 4));
  const til = iAar ? idag : `${aar}-12-31`;
  const hittil = summer(iPeriode(ordre, `${aar}-01-01`, til));
  const fjor = summer(iPeriode(ordre, `${aar - 1}-01-01`, iFjor(til)));
  const mnder = Array.from({ length: iAar ? Number(idag.slice(5, 7)) : 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return { m: i, s: summer(iPeriode(ordre, `${aar}-${m}-01`, `${aar}-${m}-31`)), f: summer(iPeriode(ordre, `${aar - 1}-${m}-01`, `${aar - 1}-${m}-31`)) };
  }).reverse();
  const aarOrdre = iPeriode(ordre, `${aar}-01-01`, `${aar}-12-31`).sort((a, b) => (b.fakturadato ?? "").localeCompare(a.fakturadato ?? ""));
  const uten = aarOrdre.filter(manglerKost);
  const apne = ordre.filter((o) => !o.fakturadato && o.ordresum > 0);

  return (
    <section className="panel avdeling-rapport" id="avdelingsrapport">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{valgt.navn.replace("&", "og")}</h2>
        <div className="row" style={{ gap: 8 }}>
          {med.length > 1 && (
            <select aria-label="Avdeling" value={valgt.nr} onChange={(e) => setAvd(Number(e.target.value))}>
              {med.map((a) => <option key={a.nr} value={a.nr}>{a.navn}</option>)}
            </select>
          )}
          <select aria-label="År" value={aar} onChange={(e) => setAar(Number(e.target.value))}>
            {(aarene.includes(aar) ? aarene : [aar, ...aarene]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>Salg ført på avdelingen i Visma, regnet etter fakturadato. {iAar ? `Hittil i år, sammenlignet med samme tid i fjor.` : `Hele ${aar}, sammenlignet med ${aar - 1}.`}</p>

      <div className="avd-kpi">
        <div><span className="label">Antall salg</span><b>{hittil.antall}</b><Endring na={hittil.antall} da={fjor.antall} /></div>
        <div><span className="label">Omsetning</span><b>{krKort(hittil.omsetning)}</b><Endring na={hittil.omsetning} da={fjor.omsetning} /></div>
        <div><span className="label">Reell fortjeneste (DB)</span><b>{krKort(hittil.medKost.db)}</b><Endring na={hittil.medKost.db} da={fjor.medKost.db} /></div>
        <div><span className="label">DG</span><b>{pst(hittil.medKost.dg)}</b>
          {hittil.medKost.dg != null && fjor.medKost.dg != null && <span className="small muted">i fjor {pst(fjor.medKost.dg)}</span>}</div>
      </div>

      {uten.length > 0 && (
        <div className="avd-varsel small">
          <b>⚠️ {uten.length} {uten.length === 1 ? "ordre" : "ordre"} ({kr(uten.reduce((s, o) => s + o.omsetning, 0))}) mangler innkjøpspris i Visma.</b>{" "}
          De gir 100 % DG og er holdt utenfor fortjeneste og DG. Legg inn innkjøpsprisen på ordren i Visma, så kommer de med:{" "}
          {uten.slice(0, 6).map((o) => `${o.visma_ordrenr} ${o.kunde}`).join(" · ")}{uten.length > 6 ? " …" : ""}
        </div>
      )}

      <div className="scroll" style={{ border: 0, marginTop: 10 }}>
        <table className="tbl">
          <thead><tr><th>Måned</th><th className="n">Salg</th><th className="n">Omsetning</th><th className="n">DB</th><th className="n">DG %</th></tr></thead>
          <tbody>
            {mnder.map(({ m, s, f }) => (
              <tr key={m} style={s.antall || s.omsetning ? undefined : { color: "var(--muted)" }}>
                <td>{MND[m]!.slice(0, 3)}</td>
                <td className="n">{s.antall}{f.antall ? <span className="small muted"> ({f.antall})</span> : null}</td>
                <td className="n">{tall(s.omsetning)}</td>
                <td className="n">{tall(s.medKost.db)}</td>
                <td className="n">{dgTall(s.medKost.dg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th>{iAar ? "Hittil i år" : `Hele ${aar}`}</th><th className="n">{hittil.antall}</th><th className="n">{tall(hittil.omsetning)}</th><th className="n">{tall(hittil.medKost.db)}</th><th className="n">{dgTall(hittil.medKost.dg)}</th></tr></tfoot>
        </table>
      </div>
      <p className="small muted">Beløp i kroner eks. mva. DB = dekningsbidrag (reell fortjeneste). Tallet i parentes er antall salg samme måned i fjor.</p>

      {apne.length > 0 && (
        <p className="small"><b>Ikke fakturert ennå:</b> {apne.length} {apne.length === 1 ? "ordre" : "ordre"} på til sammen {kr(apne.reduce((s, o) => s + o.ordresum, 0))} ({apne.map((o) => o.kunde).slice(0, 4).join(", ")}{apne.length > 4 ? " …" : ""}).</p>
      )}

      <button type="button" className="linkbtn" onClick={() => setVisOrdre(!visOrdre)}>{visOrdre ? "Skjul salgene" : `Vis alle salgene i ${aar} (${aarOrdre.length})`}</button>
      {visOrdre && (
        <div className="scroll" style={{ border: 0, marginTop: 6 }}>
          <table className="tbl">
            <thead><tr><th>Dato</th><th>Kunde</th><th className="n">Omsetning</th><th className="n">DB</th><th className="n">DG</th></tr></thead>
            <tbody>
              {aarOrdre.map((o) => (
                <tr key={o.visma_ordrenr}>
                  <td>{o.fakturadato ? kort(o.fakturadato) : "–"}</td>
                  <td style={{ whiteSpace: "normal" }}>{o.kunde}<div className="small muted">Ordre {o.visma_ordrenr}{o.omsetning < 0 ? " · kreditnota" : ""}</div></td>
                  <td className="n">{tall(o.omsetning)}</td>
                  <td className="n">{manglerKost(o) ? <span className="small" style={{ color: "var(--warn)" }}>mangler innkjøpspris</span> : tall(o.db)}</td>
                  <td className="n">{pst(dgFor(o))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
