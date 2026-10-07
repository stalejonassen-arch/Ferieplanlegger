import { useEffect, useState } from "react";
import { useApp } from "../App";
import { MND, UKEDAG, borteDag, erVirkedag, helligdag, periode, sorterAnsatte, ukedag } from "../lib/ferie";

const STATUS = { venter: "venter", godkjent: "godkjent", avslatt: "avslått" };

export function Kalender() {
  const { d, meg, aar, idag } = useApp();
  const [mnd, setMnd] = useState(() => (Number(idag.slice(0, 4)) === aar ? Number(idag.slice(5, 7)) - 1 : 6));
  const [y, setY] = useState(aar);
  useEffect(() => { setY(aar); if (aar !== Number(idag.slice(0, 4))) setMnd(6); }, [aar, idag]);

  const dager = new Date(Date.UTC(y, mnd + 1, 0)).getUTCDate();
  const iso = (n: number) => `${y}-${String(mnd + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  const nr = Array.from({ length: dager }, (_, i) => i + 1);
  const aktive = d.soknader.filter((s) => s.status !== "avslatt");
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  const grupper = d.avdelinger.map((g) => [g, ansatte.filter((a) => a.avdeling_id === g.id)] as const).filter(([, l]) => l.length);

  const flytt = (n: number) => {
    const t = y * 12 + mnd + n;
    setY(Math.floor(t / 12)); setMnd(t % 12);
  };

  return (
    <section className="panel">
      <div className="cal-head">
        <div className="cal-nav">
          <button className="btn sm" onClick={() => flytt(-1)} aria-label="Forrige måned">‹</button>
          <h2>{MND[mnd][0].toUpperCase() + MND[mnd].slice(1)} {y}</h2>
          <button className="btn sm" onClick={() => flytt(1)} aria-label="Neste måned">›</button>
        </div>
        <div className="cal-nav">
          <button className="btn sm" onClick={() => setMnd(6)}>Sommer</button>
          <button className="btn sm" onClick={() => { setY(Number(idag.slice(0, 4))); setMnd(Number(idag.slice(5, 7)) - 1); }}>I dag</button>
        </div>
      </div>
      <div className="scroll">
        <table className="cal">
          <thead>
            <tr>
              <th className="name">Ansatt</th>
              {nr.map((n) => { const i = iso(n); return (
                <th key={n} className={`${erVirkedag(i) ? "" : "off"}${i === idag ? " today" : ""}`} title={helligdag(i) ?? ""}>
                  {UKEDAG[ukedag(i)]}<b>{n}</b>
                </th>
              ); })}
            </tr>
          </thead>
          <tbody>
            {grupper.map(([g, liste]) => (
              <Gruppe key={g.id} navn={g.navn} maks={g.maks_borte} span={dager}>
                {liste.map((a) => (
                  <tr key={a.id} className={a.id === meg.id ? "me" : ""}>
                    <td className="name" title={a.navn}>{a.navn}</td>
                    {nr.map((n) => {
                      const i = iso(n);
                      const s = aktive.find((x) => x.ansatt_id === a.id && x.fra <= i && x.til >= i);
                      const kl = [s ? `c-${s.status}` : erVirkedag(i) ? "" : "off", i === idag ? "today" : ""].join(" ");
                      return <td key={n} className={kl} title={s ? `${a.navn}: ${periode(s.fra, s.til)} (${STATUS[s.status]})` : undefined} />;
                    })}
                  </tr>
                ))}
              </Gruppe>
            ))}
            <tr className="sum">
              <td className="name">Borte totalt</td>
              {nr.map((n) => {
                const i = iso(n);
                if (!erVirkedag(i)) return <td key={n} className="off" />;
                const borte = borteDag(aktive, i);
                const over = d.avdelinger.some((g) => borte.filter((s) => d.ansatte.find((a) => a.id === s.ansatt_id)?.avdeling_id === g.id).length > g.maks_borte);
                return <td key={n} className={over ? "over" : ""} title={over ? "For mange borte i én avdeling" : undefined}>{borte.length || ""}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="cal-legend">
        <span><i className="dot bg-approved" />Godkjent</span>
        <span><i className="dot stripe" />Venter</span>
        <span><i className="dot bg-off" />Søndag eller helligdag</span>
        <span><i className="dot bg-warn" />Over bemanningsgrensen</span>
      </div>
    </section>
  );
}

function Gruppe({ navn, maks, span, children }: { navn: string; maks: number; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="grp"><td className="name">{navn}</td><td colSpan={span}>maks {maks} borte</td></tr>
      {children}
    </>
  );
}
