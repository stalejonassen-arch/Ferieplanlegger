import { useEffect, useState } from "react";
import { hentVaer, STED, vaerIkon, vaerTekst, vindNavn, vindRetning, type VaerTime } from "../lib/vaer";

const kl = (iso: string) => new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit" });
const grader = (t: number) => `${Math.round(t)}°`;
const ms = (v: number) => `${Math.round(v)} m/s`;

/** Dagens vær for Haramsøy øverst på startsiden: nå, resten av dagen time for time, og varsel ved kuling/mye nedbør */
export function Vaer() {
  const [timer, setTimer] = useState<VaerTime[] | null>(null);
  const [feil, setFeil] = useState(false);
  const [skjult, setSkjult] = useState(() => { try { return localStorage.getItem("vaer-skjult") === "1"; } catch { return false; } });
  const settSkjult = (v: boolean) => { setSkjult(v); try { localStorage.setItem("vaer-skjult", v ? "1" : "0"); } catch { /* privat modus */ } };

  useEffect(() => {
    let aktiv = true;
    const last = () => hentVaer().then((v) => { if (aktiv) { setTimer(v.timer); setFeil(false); } }).catch(() => { if (aktiv) setFeil(true); });
    last();
    const id = window.setInterval(last, 30 * 60 * 1000);
    const synlig = () => { if (document.visibilityState === "visible") last(); };
    document.addEventListener("visibilitychange", synlig);
    return () => { aktiv = false; clearInterval(id); document.removeEventListener("visibilitychange", synlig); };
  }, []);

  if (skjult) {
    const n = timer?.find((t) => new Date(t.tid).getTime() + 3600e3 > Date.now());
    return (
      <div className="vaer-vis">
        <button className="btn sm" onClick={() => settSkjult(false)}>
          {n ? `${vaerIkon(n.symbol)} ${grader(n.temp)} · ` : ""}Vis været
        </button>
      </div>
    );
  }
  if (feil && !timer) return null;
  if (!timer) return <section className="panel vaer laster" aria-label="Værmelding"><span className="small muted">Henter værmelding for {STED.navn} …</span></section>;

  const naa = Date.now();
  const fra = timer.findIndex((t) => new Date(t.tid).getTime() + 3600e3 > naa);
  const kommende = timer.slice(Math.max(0, fra));
  const denne = kommende[0];
  if (!denne) return null;
  // Resten av arbeidsdagen og kvelden (til kl. 22), minst 8 timer fremover
  const slutt = new Date(); slutt.setHours(22, 0, 0, 0);
  const dag = kommende.filter((t, i) => i < 8 || new Date(t.tid).getTime() <= slutt.getTime()).slice(0, 16);
  const maksVind = Math.max(...dag.map((t) => t.vind));
  const maksKast = Math.max(...dag.map((t) => t.kast ?? 0));
  const nedbor = dag.reduce((a, t) => a + t.nedbor, 0);
  const temps = dag.map((t) => t.temp);
  const varsel = [
    maksVind >= 13.9 ? `${vindNavn(maksVind).toLowerCase()} i dag (opptil ${ms(maksVind)}) – sikre stillas, plater og løse materialer` : maksKast >= 20 ? `vindkast opptil ${ms(maksKast)} i dag – sikre løse materialer` : "",
    nedbor >= 10 ? `mye nedbør i dag (${Math.round(nedbor)} mm) – dekk til materialer` : "",
    Math.min(...temps) <= 0 && Math.max(...temps) > -5 ? "kuldegrader – fare for is og glatte tak" : "",
  ].filter(Boolean);

  return (
    <section className="panel vaer" aria-label={`Værmelding for ${STED.navn}`}>
      <div className="vaer-topp">
        <div className="vaer-naa">
          <span className="vaer-ikon" aria-hidden="true">{vaerIkon(denne.symbol)}</span>
          <div>
            <div className="vaer-temp">{grader(denne.temp)}</div>
            <div className="small">{vaerTekst(denne.symbol)} · {STED.navn}</div>
          </div>
        </div>
        <button className="vaer-skjul" onClick={() => settSkjult(true)} aria-label="Skjul været" title="Skjul været">×</button>
        <div className="vaer-info">
          <div className="label">Været på {STED.navn} nå</div>
          <div><span className="vaer-pil" style={{ transform: `rotate(${denne.retning + 180}deg)` }} aria-hidden="true">↑</span> {ms(denne.vind)}{denne.kast ? ` (kast ${ms(denne.kast)})` : ""} fra {vindRetning(denne.retning)}</div>
          <div className="small muted">I dag {grader(Math.min(...temps))} til {grader(Math.max(...temps))} · {nedbor >= 0.1 ? `${nedbor.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} mm nedbør` : "opphold"}</div>
        </div>
      </div>
      {varsel.length > 0 && <div className="vaer-varsel">⚠️ {varsel.map((v) => v[0]!.toUpperCase() + v.slice(1)).join(". ")}.</div>}
      <div className="vaer-timer" role="list" aria-label="Time for time">
        {dag.map((t) => (
          <div key={t.tid} className="vaer-time" role="listitem">
            <span className="small muted">{kl(t.tid)}</span>
            <span className="vaer-time-ikon" aria-hidden="true">{vaerIkon(t.symbol)}</span>
            <b>{grader(t.temp)}</b>
            <span className={`small${t.nedbor >= 0.1 ? " vaer-regn" : " muted"}`}>{t.nedbor >= 0.1 ? `${t.nedbor.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} mm` : "–"}</span>
            <span className={`small${t.vind >= 10.8 ? " vaer-vind-sterk" : " muted"}`}>{Math.round(t.vind)}{t.kast && t.kast - t.vind >= 4 ? `(${Math.round(t.kast)})` : ""}</span>
          </div>
        ))}
      </div>
      <div className="small muted vaer-kilde">
        Vind i m/s{dag.some((t) => t.kast) ? ", kast i parentes" : ""}. Data fra <a href={`https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/${STED.lat},${STED.lon}`} target="_blank" rel="noopener noreferrer">MET Norway / Yr</a>
      </div>
    </section>
  );
}
