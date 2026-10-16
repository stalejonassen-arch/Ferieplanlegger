import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, feiltekst } from "./lib/api";
import { isoOf, type Ansatt, type Data, type Tema } from "./lib/ferie";
import { settSprak, type Sprak } from "./lib/sprak";
import { Innlogging } from "./views/Innlogging";
import { MinFerie } from "./views/MinFerie";
import { Kalender } from "./views/Kalender";
import { Soknader } from "./views/Soknader";
import { Regler } from "./views/Regler";
import { Personvern } from "./views/Personvern";
import { Vilkar } from "./views/Vilkar";
import { Oppsett } from "./views/Oppsett";
import { Lonn } from "./views/Lonn";
import { Timer } from "./views/Timer";
import { Prosjekter } from "./views/Prosjekter";
import { Avvik } from "./views/Avvik";
import { Rapporter, lesRapport } from "./views/Rapporter";
import { Sykdom } from "./views/Sykdom";
import { Utstyr } from "./views/Utstyr";
import { Kompetanse } from "./views/Kompetanse";
import { trengerFornyelse } from "./lib/kompetanse";
import { uleste } from "./lib/rapport";
import { kanalNavn, uleste as ulesteMeldinger, type Lest, type Melding } from "./lib/chat";
import { Chat } from "./views/Chat";
import { FerieOversikt } from "./views/FerieOversikt";
import { LagreSomApp } from "./views/LagreSomApp";
import { KampanjeKort, KampanjerAv } from "./views/Kampanjer";
import { Vaer } from "./views/Vaer";
import { PROFIL } from "./lib/profil";
import { VarselBanner } from "./views/Varsler";
import { fornyPush } from "./lib/push";

export interface Ctx {
  d: Data;
  meg: Ansatt;
  leder: boolean;
  aar: number;
  idag: string;
  /** Kjør en lagring, vis bekreftelse eller feilmelding, og hent data på nytt. */
  kjor: (fn: () => Promise<void>, ok?: string) => Promise<boolean>;
  /** Meldinger (chat) – lastes for seg selv og oppdateres i sanntid */
  chat: { meldinger: Melding[]; lest: Lest; oppdater: () => void; markerLest: (kanal: string) => void };
}
const AppCtx = createContext<Ctx>(null!);

/** Enkle strekikoner for hovedmenyen (vises i bunnmenyen på mobil) */
const IKON: Record<string, React.ReactNode> = {
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  prosjekter: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  avvik: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /></>,
  utstyr: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></>,
  rapporter: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M9 8h3" /></>,
  min: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  lonn: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.5M18 15v.5" /></>,
  oppsett: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
};
/** Silhuett av kran og bygg i toppfeltet */
const SKYLINE = (
  <g fill="currentColor">
    <path d="M300 160V70h40v90zM345 160V95h30v65zM230 160v-50h55v50zM385 160V60h50v100zM440 160v-40h40v40z" opacity=".55" />
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M408 160V18M418 160V18M408 30l10-10M408 50l10-10M408 70l10-10M408 90l10-10M408 110l10-10M408 130l10-10M408 150l10-10" />
      <path d="M300 18h210M300 28h210M330 18l-10 10M360 18l-10 10M390 18l-10 10M440 18l-10 10M470 18l-10 10M500 18l-10 10" />
      <path d="M413 4 300 18M413 4l97 14M413 4v14" />
      <path d="M330 28v34" /><path d="M324 62h12v8h-12z" />
    </g>
    <path d="M493 28h14v14h-14z" />
    <g opacity=".35"><path d="M306 80h6v6h-6zM318 80h6v6h-6zM306 96h6v6h-6zM318 96h6v6h-6zM393 72h7v7h-7zM407 72h7v7h-7zM393 88h7v7h-7zM421 88h7v7h-7z" fill="#FFCD00" /></g>
  </g>
);
export const useApp = () => useContext(AppCtx);

type Fane = "timer" | "chat" | "prosjekter" | "avvik" | "utstyr" | "kurs" | "rapporter" | "syk" | "min" | "kal" | "sok" | "lonn" | "regler" | "oppsett" | "personvern" | "vilkar";
const lesFane = (): Fane => {
  const h = location.hash.slice(1);
  return (["timer", "chat", "prosjekter", "avvik", "utstyr", "kurs", "rapporter", "syk", "min", "kal", "sok", "lonn", "regler", "oppsett", "personvern", "vilkar"] as const).includes(h as Fane) ? (h as Fane) : "timer";
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
  // Push-varsler: hold abonnementet oppdatert i databasen
  useEffect(() => { if (meg?.id) fornyPush(); }, [meg?.id]);
  // Den ansattes språk følger med fra databasen
  useEffect(() => { if (meg?.sprak) settSprak(meg.sprak); }, [meg?.sprak]);
  const [tema, settTema] = useState<Tema>(() => { if (PROFIL.id !== "austnes") return PROFIL.tema; try { return (localStorage.getItem("tema") as Tema) || "byggfag"; } catch { return "byggfag"; } });
  useEffect(() => { if (meg?.tema) settTema(meg.tema); }, [meg?.tema]);
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "fargerik" ? "#D6409F" : tema === "mork" ? "#0A0E20" : tema === "byggfag" ? "#0B1F5C" : tema === "bfportal" ? "#F8F9FA" : tema === "thaugland" ? "#1D1D1B" : "#F6F2EB");
    if (PROFIL.id === "austnes") try { localStorage.setItem("tema", tema); } catch { /* privat modus */ }
  }, [tema]);

  const kjor = useCallback(async (fn: () => Promise<void>, ok?: string) => {
    try { await fn(); if (ok) visToast(ok); await last(); return true; }
    catch (e) { visToast(feiltekst(e), true); await last(); return false; }
  }, [last]);

  // ---- Meldinger
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [lest, setLest] = useState<Lest>({});
  const forrige = useRef<Set<string> | null>(null);
  const lastChat = useCallback(async () => {
    try { const [m, l] = await Promise.all([api.meldinger(), api.kanalLest()]); setMeldinger(m); setLest(l); } catch { /* prøver igjen senere */ }
  }, []);
  useEffect(() => {
    if (!epost) { setMeldinger([]); forrige.current = null; return; }
    lastChat();
    const stopp = api.abonnerMeldinger(lastChat);
    const synlig = () => { if (document.visibilityState === "visible") lastChat(); };
    document.addEventListener("visibilitychange", synlig);
    return () => { stopp(); document.removeEventListener("visibilitychange", synlig); };
  }, [epost, lastChat]);
  const markerLest = useCallback((kanal: string) => {
    setLest((l) => ({ ...l, [kanal]: new Date().toISOString() }));
    api.markerKanalLest(kanal).catch(() => {});
  }, []);
  // Varsel på telefon/PC når det kommer nye meldinger fra andre og appen ikke er i bruk
  useEffect(() => {
    if (!meg) return;
    const ids = new Set(meldinger.map((m) => m.id));
    if (forrige.current) {
      const nye = meldinger.filter((m) => !forrige.current!.has(m.id) && m.ansatt_id !== meg.id);
      const iChat = location.hash === "#chat";
      if (nye.length && (document.visibilityState !== "visible" || !iChat) && "Notification" in window && Notification.permission === "granted") {
        const m = nye[nye.length - 1]!;
        const fra = d?.ansatte.find((a) => a.id === m.ansatt_id)?.navn ?? "";
        const hvor = d ? kanalNavn(m.kanal, meg.id, d.ansatte, d.prosjekter) : "";
        try {
          navigator.serviceWorker?.getRegistration().then((reg) => {
            const tittel = m.kanal.startsWith("dm:") ? fra : `${fra} · ${hvor}`;
            const opts = { body: m.tekst || "📷 Bilde", tag: m.kanal, icon: "/icon-192.png", data: { url: "/#chat" } };
            if (reg) reg.showNotification(tittel, opts); else new Notification(tittel, opts);
          });
        } catch { /* ikke støttet */ }
      }
    }
    forrige.current = ids;
  }, [meldinger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (epost === undefined) return <div className="wrap"><div className="empty">Starter …</div></div>;
  if (!epost) return <Innlogging />;
  if (feil && !d) return <Skall><div className="panel"><h2>Noe gikk galt</h2><p>{feil}</p><div><button className="btn" onClick={last}>Prøv igjen</button></div></div></Skall>;
  if (!d) return <Skall><div className="empty">Henter ByggLogg …</div></Skall>;
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
  // Hovedfaner. Ferie, kalender, søknader og regler er samlet under «Ferie».
  const FERIE: Fane[] = ["min", "syk", "kal", "sok", "regler"];
  const faner: [Fane, string][] = [["timer", "Timer"], ["chat", "Chat"], ["prosjekter", "Prosjekter"], ["avvik", "Avvik"], ["utstyr", "Utstyr"], ["rapporter", "Rapporter"], ["min", "Fravær"], ...(leder ? [["lonn", "Lønn"] as [Fane, string], ["oppsett", "Oppsett"] as [Fane, string]] : [])];
  const ferieFaner: [Fane, string][] = [["min", "Ferie"], ["syk", "Syk"], ["kal", "Kalender"], ...(leder ? [["sok", "Søknader"] as [Fane, string]] : []), ["regler", "Regler"]];
  const nyeRapporter = uleste(d.rapporter, d.lest, meg.id);
  const aktiv = faner.some(([f]) => f === fane) || ferieFaner.some(([f]) => f === fane) || fane === "kurs" || fane === "personvern" || fane === "vilkar" ? fane : "timer";
  const iFerie = FERIE.includes(aktiv);
  const iUtstyr = aktiv === "utstyr" || aktiv === "kurs";
  const kursVarsel = trengerFornyelse((d.kompetanse ?? []).filter((k) => leder || k.ansatt_id === meg.id), idag).length;
  const velg = (f: Fane) => { history.replaceState(null, "", `#${f}`); setFane(f); };
  const y0 = Number(idag.slice(0, 4));
  const ulestChat = [...ulesteMeldinger(meldinger, lest, meg.id).values()].reduce((a, b) => a + b, 0);
  document.title = ulestChat ? `(${ulestChat}) ByggLogg` : "ByggLogg";

  return (
    <AppCtx.Provider value={{ d, meg, leder, aar, idag, kjor, chat: { meldinger, lest, oppdater: lastChat, markerLest } }}>
      <div className="wrap">
        <div className="toppfelt">
        <svg className="skyline" viewBox="0 0 520 160" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">{SKYLINE}</svg>
        <header className="top">
          <div className="brand"><small>{PROFIL.undertittel}</small>
            <h1><svg className="hjelm" viewBox="0 0 64 64" aria-hidden="true"><path d="M6 30 L32 9 L58 30" strokeWidth="7" /><path d="M15 27 V55 H49 V27" strokeWidth="6" /><path d="M23 41 L30 48 L42 35" strokeWidth="6" /></svg><span className="ord">Bygg<span>Logg</span></span></h1></div>
          <div className="who">
            <span className="small muted" data-ikke-oversett>{meg.navn}</span>{leder && <span className="small muted">· leder</span>}
            <select aria-label="Språk" className="sprakvalg" value={meg.sprak ?? "nb"} data-ikke-oversett
              onChange={(e) => { const s = e.target.value as Sprak; kjor(() => api.settMittSprak(s)).then(() => settSprak(s)); }}>
              <option value="nb">Norsk</option><option value="pl">Polski</option>
            </select>
            <select aria-label="Farger" className="temavalg" value={tema}
              onChange={(e) => { const t = e.target.value as Tema; settTema(t); kjor(() => api.settMittTema(t)); }}>
              {PROFIL.id === "thaugland" && <option value="thaugland">Thaugland</option>}<option value="byggfag">ByggLogg-blå</option><option value="bfportal">Lys blå</option><option value="standard">Skandinavisk</option><option value="fargerik">Fargerik</option><option value="mork">Mørk</option>
            </select>
            <button className="btn sm" onClick={() => api.loggUt()}>Logg ut</button>
          </div>
        </header>
        <nav className="tabs hoved" role="tablist">
          {faner.map(([f, navn]) => (
            <button key={f} role="tab" aria-selected={aktiv === f || (f === "min" && iFerie) || (f === "utstyr" && iUtstyr)} onClick={() => velg(f)}
              ref={(el) => { if (el && (aktiv === f || (f === "min" && iFerie) || (f === "utstyr" && iUtstyr))) el.scrollIntoView({ block: "nearest", inline: "nearest" }); }}>
              <svg className="ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IKON[f]}</svg>
              {navn}{f === "min" && leder && venter > 0 && <span className="badge">{venter}</span>}
              {f === "chat" && ulestChat > 0 && <span className="badge">{ulestChat}</span>}
              {f === "avvik" && aapneAvvik > 0 && <span className="badge">{aapneAvvik}</span>}
              {f === "utstyr" && kursVarsel > 0 && <span className="badge">{kursVarsel}</span>}
              {f === "rapporter" && nyeRapporter.length > 0 && <span className="badge">{nyeRapporter.length}</span>}
            </button>
          ))}
        </nav>
        </div>

        <LagreSomApp />

        {api.modus === "demo" && (
          <div className="banner"><span><span className="chip demo">Demo</span> Prøveversjon med eksempeldata. Alt du gjør her er bare på lek og forsvinner når du lukker siden – ingenting påvirker den ekte ByggLogg. <a href="https://bygglogg.app" target="_blank" rel="noopener">Les mer om ByggLogg</a></span>{import.meta.env.VITE_SUPABASE_URL && PROFIL.id === "demo" && !/^(www\.)?bygglogg\.app$/.test(location.hostname) && <a className="btn sm" href="?demo=av">Avslutt demo</a>}</div>
        )}

        {nyeRapporter[0] && aktiv !== "rapporter" && (
          <div className="banner"><span>Ny rapport: <b>{nyeRapporter[0].tittel}</b></span>
            <button className="btn sm primary" onClick={() => lesRapport(nyeRapporter[0], kjor)}>Les nå</button></div>
        )}


        {iUtstyr && (
          <nav className="tabs undertabs" role="tablist">
            <button role="tab" aria-selected={aktiv === "utstyr"} onClick={() => velg("utstyr")}>Utstyr</button>
            <button role="tab" aria-selected={aktiv === "kurs"} onClick={() => velg("kurs")}>Kurs og bevis{kursVarsel > 0 && <span className="badge">{kursVarsel}</span>}</button>
          </nav>
        )}

        {aktiv === "timer" && <><VarselBanner /><Vaer /><KampanjeKort /><Timer /><KampanjerAv /></>}
        {aktiv === "chat" && <Chat />}
        {aktiv === "prosjekter" && <Prosjekter />}
        {aktiv === "avvik" && <Avvik />}
        {aktiv === "utstyr" && <Utstyr />}
        {aktiv === "kurs" && <Kompetanse />}
        {aktiv === "rapporter" && <Rapporter />}
        {iFerie && (
          <div className="ferie-flate">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <nav className="tabs undertabs" role="tablist" style={{ flex: 1 }}>
              {ferieFaner.map(([f, navn]) => (
                <button key={f} role="tab" aria-selected={aktiv === f} onClick={() => velg(f)}>
                  {navn}{f === "sok" && venter > 0 && <span className="badge">{venter}</span>}
                </button>
              ))}
            </nav>
            {aktiv !== "syk" && <select id="aar" aria-label="Ferieår" value={aar} onChange={(e) => setAar(Number(e.target.value))}>
              {[y0 - 1, y0, y0 + 1].map((y) => <option key={y} value={y}>Ferieår {y}</option>)}
            </select>}
          </div>
            {(aktiv === "min" || aktiv === "sok") && <FerieOversikt />}
            {aktiv === "syk" && <Sykdom />}
            {aktiv === "min" && <MinFerie />}
            {aktiv === "kal" && <Kalender />}
            {aktiv === "sok" && <Soknader />}
            {aktiv === "regler" && <Regler />}
          </div>
        )}
        {aktiv === "lonn" && <Lonn />}
        {aktiv === "oppsett" && <Oppsett />}
        {aktiv === "personvern" && <Personvern sprak={meg.sprak === "pl" ? "pl" : "nb"} lukk={() => velg("timer")} tilVilkar={() => { velg("vilkar"); window.scrollTo(0, 0); }} />}
        {aktiv === "vilkar" && <Vilkar sprak={meg.sprak === "pl" ? "pl" : "nb"} lukk={() => velg("timer")} tilPersonvern={() => { velg("personvern"); window.scrollTo(0, 0); }} />}
        <div className="small muted" style={{ textAlign: "center", margin: "18px 0 90px" }}>
          <a href="#personvern" onClick={(e) => { e.preventDefault(); velg("personvern"); window.scrollTo(0, 0); }}>Personvern</a>
          {" · "}<a href="#vilkar" onClick={(e) => { e.preventDefault(); velg("vilkar"); window.scrollTo(0, 0); }}>Avtalevilkår</a>
          {" · "}<a href="https://bygglogg.app" target="_blank" rel="noopener">ByggLogg fra Jonassen AS</a>
        </div>
      </div>
      {toast && <div className={`toast${toast.feil ? " feil" : ""}`} role="status">{toast.t}</div>}
    </AppCtx.Provider>
  );
}

function Skall({ children, epost }: { children: React.ReactNode; epost?: string }) {
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><small>{PROFIL.undertittel}</small><h1>ByggLogg</h1></div>
        {epost && <button className="btn sm" onClick={() => api.loggUt()}>Logg ut</button>}
      </header>
      {children}
    </div>
  );
}
