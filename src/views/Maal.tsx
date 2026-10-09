import { useApp } from "../App";
import { MND } from "../lib/ferie";
import { fakturertPerMnd, t2 } from "../lib/timer";

/** Fakturerte timer per måned mot målet (500 i måneden = 6 000 i året). */
export function Maal() {
  const { d, idag } = useApp();
  const aar = Number(idag.slice(0, 4)), mnd = Number(idag.slice(5, 7));
  const maal = d.maal ?? 500;
  const per = fakturertPerMnd(d.timer, aar);
  const hittil = per.slice(0, mnd).reduce((a, b) => a + b, 0);
  const denne = per[mnd - 1];
  const maks = Math.max(maal, ...per);
  return (
    <section className="panel maal">
      <h2 style={{ margin: 0 }}>Fakturerbare timer {aar}</h2>
      <div className="legend">
        <div><span className="label">{MND[mnd - 1]}</span><span className="v" style={denne < maal ? { color: "var(--warn)" } : undefined}>{t2(denne)} / {t2(maal)}</span></div>
        <div><span className="label">Hittil i år</span><span className="v">{t2(hittil)} / {t2(maal * mnd)}</span></div>
        <div><span className="label">Mål for året</span><span className="v">{t2(maal * 12)}</span></div>
      </div>
      <div className="maal-mnd" role="img" aria-label="Fakturerbare timer per måned">
        {per.map((n, i) => <div key={i} className={i < mnd && n < maal ? "under" : ""} style={{ height: `${(n / maks) * 100}%`, opacity: i < mnd ? 1 : 0.35 }} title={`${MND[i]}: ${t2(n)} t`} />)}
      </div>
      <div className="maal-akse">{MND.map((m) => <span key={m}>{m.slice(0, 3)}</span>)}</div>
      <p className="small muted" style={{ margin: 0 }}>Teller timer ført på prosjekt og merket fakturerbart i ByggLogg. Grønt = nådd målet på {t2(maal)} t, gult = under.</p>
    </section>
  );
}
