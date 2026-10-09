import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, feiltekst } from "./lib/api";
import { isoOf, type Ansatt, type Data } from "./lib/ferie";
import { Innlogging } from "./views/Innlogging";
import { MinFerie } from "./views/MinFerie";
import { Kalender } from "./views/Kalender";
import { Soknader } from "./views/Soknader";
import { Regler } from "./views/Regler";
import { Oppsett } from "./views/Oppsett";
import { Lonn } from "./views/Lonn";
import { Timer } from "./views/Timer";
import { Prosjekter } from "./views/Prosjekter";
import { Avvik } from "./views/Avvik";
import { Rapporter, lesRapport } from "./views/Rapporter";
import { uleste } from "./lib/rapport";

export interface Ctx {
  d: Data;
  meg: Ansatt;
  leder: boolean;
  aar: number;
  idag: string;
  /** Kjør en lagring, vis bekreftelse eller feilmelding, og hent data på nytt. */
  kjor: (fn: () => Promise<void>, ok?: string) => Promise<boolean>;
}
const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

type Fane = "timer" | "prosjekter" | "avvik" | "rapporter" | "min" | "kal" | "sok" | "lonn" | "regler" | "oppsett";
const lesFane = (): Fane => {
  const h = location.hash.slice(1);
  return (["timer", "prosjekter", "avvik", "rapporter", "min", "kal", "sok", "lonn", "regler", "oppsett"] as const).includes(h as Fane) ? (h as Fane) : "timer";
};

export function App() {
  const [epost, setEpost] = useState<string | null | undefined>(undefined);
  const [d, setD] = useState<Data | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const [fane, setFane] = useState<Fane>(lesFane);
  const idag = isoOf(new Date());
  const [aar, setAar] = useState(() => Number(idag.slice(0, 4)));
  const [toast, setToast] = useState<{ t: string; feil?: boolean } | null>(null);
  const toastTimer = useRef<number>();

  const visToast = (t: string, feil = false) => {
    setToast({ t, feil });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), feil ? 5000 : 2600);
  };

  useEffect(() => {
    api.epost().then(setEpost);
    return api.onEpost(setEpost);
  }, []);

  const last = useCallback(async () => {
    try { setD(await api.hent()); setFeil(null); }
    catch (e) { setFeil(feiltekst(e)); }
  }, []);

  useEffect(() => {
    if (!epost) { setD(null); return; }
    last();
    const stopp = api.abonner(last);
    const synlig = () => { if (document.visibilityState === "visible") last(); };
    document.addEventListener("visibilitychange", synlig);
    return () => { stopp(); document.removeEventListener("visibilitychange", synlig); };
  }, [epost, last]);

  useEffect(() => {
    const f = () => setFane(lesFane());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const meg = useMemo(
    () => d?.ansatte.find((a) => a.aktiv && a.epost?.toLowerCase() === epost?.toLowerCase()),
    [d, epost],
  );

  const kjor = useCallback(async (fn: () => Promise<void>, ok?: string) => {
    try { await fn(); if (ok) visToast(ok); await last(); return true; }
    catch (e) { visToast(feiltekst(e), true); await last(); return false; }
  }, [last]);

  if (epost === undefined) return <div className="wrap"><div className="empty">Starter …</div></div>;
  if (!epost) return <Innlogging />;
  if (feil && !d) return <Skall><div className="panel"><h2>Noe gikk galt</h2><p>{feil}</p><div><button className="btn" onClick={last}>Prøv igjen</button></div></div></Skall>;
  if (!d) return <Skall><div className="empty">Henter ferieplanen …</div></Skall>;
  if (!meg) {
    return (
      <Skall epost={epost}>
        <div className="panel">
          <h2>Du har ikke tilgang ennå</h2>
          <p>Du er logget inn som <b>{epost}</b>, men den adressen er ikke registrert som ansatt. Be leder legge den inn under Oppsett, og last siden på nytt.</p>
          <div className="row"><button className="btn" onClick={last}>Sjekk igjen</button><button className="btn" onClick={() => api.loggUt()}>Logg ut</button></div>
        </div>
      </Skall>
    );
  }

  const leder = meg.rolle === "leder";
  const venter = d.soknader.filter((s) => s.status === "venter").length;
  const aapneAvvik = d.avvik.filter((a) => (leder && a.status === "apen") || (a.ansvarlig_id === meg.id && a.status !== "lukket")).length;
  const faner: [Fane, string][] = [["timer", "Timer"], ["prosjekter", "Prosjekter"], ["avvik", "Avvik"], ["rapporter", "Rapporter"], ["min", "Ferie"], ["kal", "Kalender"], ...(leder ? [["sok", "Søknader"] as [Fane, string], ["lonn", "Lønn"] as [Fane, string]] : []), ["regler", "Regler"], ...(leder ? [["oppsett", "Oppsett"] as [Fane, string]] : [])];
  const nyeRapporter = uleste(d.rapporter, d.lest, meg.id);
  const aktiv = faner.some(([f]) => f === fane) ? fane : "timer";
  const velg = (f: Fane) => { history.replaceState(null, "", `#${f}`); setFane(f); };
  const y0 = Number(idag.slice(0, 4));

  return (
    <AppCtx.Provider value={{ d, meg, leder, aar, idag, kjor }}>
      <div className="wrap">
        <header className="top">
          <div className="brand"><small>N L Austnes AS</small><h1>ByggLogg</h1></div>
          <div className="who">
            <span className="small muted">{meg.navn}{leder ? " · leder" : ""}</span>
            <select id="aar" aria-label="Ferieår" value={aar} onChange={(e) => setAar(Number(e.target.value))}>
              {[y0 - 1, y0, y0 + 1].map((y) => <option key={y} value={y}>Ferieår {y}</option>)}
            </select>
            <button className="btn sm" onClick={() => api.loggUt()}>Logg ut</button>
          </div>
        </header>

        {api.modus === "demo" && (
          <div className="banner"><span><span className="chip demo">Demo</span> Eksempeldata som bare ligger i denne nettleseren. Koble til Supabase for ekte bruk.</span></div>
        )}

        {nyeRapporter[0] && aktiv !== "rapporter" && (
          <div className="banner"><span>Ny rapport: <b>{nyeRapporter[0].tittel}</b></span>
            <button className="btn sm primary" onClick={() => lesRapport(nyeRapporter[0], kjor)}>Les nå</button></div>
        )}

        <nav className="tabs" role="tablist">
          {faner.map(([f, navn]) => (
            <button key={f} role="tab" aria-selected={aktiv === f} onClick={() => velg(f)}>
              {navn}{f === "sok" && venter > 0 && <span className="badge">{venter}</span>}
              {f === "avvik" && aapneAvvik > 0 && <span className="badge">{aapneAvvik}</span>}
              {f === "rapporter" && nyeRapporter.length > 0 && <span className="badge">{nyeRapporter.length}</span>}
            </button>
          ))}
        </nav>

        {aktiv === "timer" && <Timer />}
        {aktiv === "prosjekter" && <Prosjekter />}
        {aktiv === "avvik" && <Avvik />}
        {aktiv === "rapporter" && <Rapporter />}
        {aktiv === "min" && <MinFerie />}
        {aktiv === "kal" && <Kalender />}
        {aktiv === "sok" && <Soknader />}
        {aktiv === "lonn" && <Lonn />}
        {aktiv === "regler" && <Regler />}
        {aktiv === "oppsett" && <Oppsett />}
      </div>
      {toast && <div className={`toast${toast.feil ? " feil" : ""}`} role="status">{toast.t}</div>}
    </AppCtx.Provider>
  );
}

function Skall({ children, epost }: { children: React.ReactNode; epost?: string }) {
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><small>N L Austnes AS</small><h1>ByggLogg</h1></div>
        {epost && <button className="btn sm" onClick={() => api.loggUt()}>Logg ut</button>}
      </header>
      {children}
    </div>
  );
}
