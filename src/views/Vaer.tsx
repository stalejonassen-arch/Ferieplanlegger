import { useEffect, useState } from "react";
import { hentVaer, vaerTekst, vindNavn, vindRetning, type Sted, type VaerTime } from "../lib/vaer";
import { useApp } from "../App";
import { PROFIL } from "../lib/profil";

const kl = (iso: string) => new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit" });
const grader = (t: number) => `${Math.round(t)}°`;
const ms = (v: number) => `${Math.round(v)} m/s`;
const mm = (v: number) => v.toLocaleString("nb-NO", { maximumFractionDigits: 1 });

/** Værsymbol fra MET/Yr (MIT-lisens), ligger i /vaer */
function Ikon({ symbol, str }: { symbol: string; str: number }) {
  return <img className="vaer-svg" src={`/vaer/${symbol}.svg`} width={str} height={str} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />;
}

/** Bakgrunn etter været: sol, skyer, regn, snø eller natt */
function stemning(symbol: string): string {
  if (symbol.endsWith("_night")) return "natt";
  const s = symbol.replace(/_(day|polartwilight)$/, "");
  if (/thunder/.test(s)) return "torden";
  if (/snow|sleet/.test(s)) return "sno";
  if (/rain/.test(s)) return "regn";
  if (s === "clearsky" || s === "fair") return "sol";
  if (s === "fog") return "taake";
  return "sky";
}

/** Dagens vær for bedriftens sted øverst på startsiden: nå, resten av dagen time for time, og varsel ved kuling/mye nedbør */
export function Vaer() {
  const { d } = useApp();
  const b = d.bedrift;
  const STED: Sted = b && b.sted_lat != null && b.sted_lon != null ? { navn: b.sted_navn || b.navn, lat: b.sted_lat, lon: b.sted_lon } : PROFIL.sted;
  const [timer, setTimer] = useState<VaerTime[] | null>(null);
  const [feil, setFeil] = useState(false);
  const [skjult, setSkjult] = useState(() => { try { return localStorage.getItem("vaer-skjult") === "1"; } catch { return false; } });
  const settSkjult = (v: boolean) => { setSkjult(v); try { localStorage.setItem("vaer-skjult", v ? "1" : "0"); } catch { /* privat modus */ } };

  useEffect(() => {
    let aktiv = true;
    const last = () => hentVaer(STED).then((v) => { if (aktiv) { setTimer(v.timer); setFeil(false); } }).catch(() => { if (aktiv) setFeil(true); });
    last();
    const id = window.setInterval(last, 30 * 60 * 1000);
    const synlig = () => { if (document.visibilityState === "visible") last(); };
    document.addEventListener("visibilitychange", synlig);
    return () => { aktiv = false; clearInterval(id); document.removeEventListener("visibilitychange", synlig); };
  }, [STED.lat, STED.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const kommende = (timer ?? []).filter((t) => new Date(t.tid).getTime() + 3600e3 > Date.now());
  const denne = kommende[0];

  if (skjult) {
    return (
      <div className="vaer-vis">
        <button className="vaer-vis-knapp" onClick={() => settSkjult(false)}>
          {denne && <Ikon symbol={denne.symbol} str={22} />}
          {denne ? <b>{grader(denne.temp)}</b> : null}
          <span>Vis været</span>
        </button>
      </div>
    );
  }
  if (feil && !timer) return null;
  if (!timer || !denne) return <section className="vaer vaer-sky laster" aria-label="Værmelding"><span>Henter været på {STED.navn} …</span></section>;

  // Resten av dagen til kl. 22, minst 8 timer fremover
  const slutt = new Date(); slutt.setHours(22, 0, 0, 0);
  const dag = kommende.filter((t, i) => i < 8 || new Date(t.tid).getTime() <= slutt.getTime()).slice(0, 16);
  const maksVind = Math.max(...dag.map((t) => t.vind));
  const maksKast = Math.max(...dag.map((t) => t.kast ?? 0));
  const nedbor = dag.reduce((a, t) => a + t.nedbor, 0);
  const temps = dag.map((t) => t.temp);
  const maksTime = Math.max(1.5, ...dag.map((t) => t.nedbor));
  const varsel = [
    maksVind >= 13.9 ? `${vindNavn(maksVind)} i dag (opptil ${ms(maksVind)}) – sikre stillas, plater og løse materialer` : maksKast >= 20 ? `Vindkast opptil ${ms(maksKast)} i dag – sikre løse materialer` : "",
    nedbor >= 10 ? `Mye nedbør i dag (${Math.round(nedbor)} mm) – dekk til materialer` : "",
    Math.min(...temps) <= 0 && Math.max(...temps) > -5 ? "Kuldegrader – fare for is og glatte tak" : "",
  ].filter(Boolean);

  return (
    <section className={`vaer vaer-${stemning(denne.symbol)}`} aria-label={`Værmelding for ${STED.navn}`}>
      <button className="vaer-skjul" onClick={() => settSkjult(true)} aria-label="Skjul været" title="Skjul været">×</button>

      <div className="vaer-hoved">
        <div className="vaer-venstre">
          <div className="vaer-sted">{STED.navn} · nå</div>
          <div className="vaer-temp">{grader(denne.temp)}</div>
          <div className="vaer-tilstand">{vaerTekst(denne.symbol)}</div>
        </div>
        <Ikon symbol={denne.symbol} str={96} />
      </div>

      <div className="vaer-fakta">
        <span className="vaer-fakta-ting" title={vindNavn(denne.vind)}>
          <span className="vaer-pil" style={{ transform: `rotate(${denne.retning + 180}deg)` }} aria-hidden="true">↑</span>
          {ms(denne.vind)} fra {vindRetning(denne.retning)}
        </span>
        <span className="vaer-fakta-ting">🌡 {grader(Math.min(...temps))} / {grader(Math.max(...temps))}</span>
        <span className="vaer-fakta-ting">💧 {nedbor >= 0.1 ? `${mm(nedbor)} mm i dag` : "Opphold i dag"}</span>
      </div>

      {varsel.length > 0 && <div className="vaer-varsel">⚠️ {varsel.join(". ")}.</div>}

      <div className="vaer-timer" role="list" aria-label="Time for time">
        {dag.map((t, i) => (
          <div key={t.tid} className="vaer-time" role="listitem">
            <span className="vaer-kl">{i === 0 ? "Nå" : kl(t.tid)}</span>
            <Ikon symbol={t.symbol} str={34} />
            <b className="vaer-t">{grader(t.temp)}</b>
            <span className="vaer-regnstolpe" title={`${mm(t.nedbor)} mm`}><i style={{ height: `${Math.min(100, (t.nedbor / maksTime) * 100)}%` }} /></span>
            <span className="vaer-mm">{t.nedbor >= 0.1 ? mm(t.nedbor) : ""}</span>
            <span className={`vaer-v${t.vind >= 10.8 ? " sterk" : ""}`}>{Math.round(t.vind)}</span>
          </div>
        ))}
      </div>

      <div className="vaer-kilde">
        Nedbør i mm · vind i m/s · Data fra <a href={`https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/${STED.lat},${STED.lon}`} target="_blank" rel="noopener noreferrer">MET Norway / Yr</a>
      </div>
    </section>
  );
}
