import { useEffect, useState } from "react";

/** Nettleserens installasjonshendelse (Chrome, Edge, Samsung Internet på Android og PC) */
type InstallHendelse = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let lagret: InstallHendelse | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); lagret = e as InstallHendelse; window.dispatchEvent(new Event("bygglogg-kan-installeres")); });
}

const erInstallert = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const erIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const erIosSafari = () => erIos() && !/crios|fxios|edgios/i.test(navigator.userAgent);
const erAndroid = () => /android/i.test(navigator.userAgent);
/** Innebygd nettleser i Messenger, Facebook, Instagram, Gmail o.l. – der kan man ikke installere */
const erInnebygd = () => /FBAN|FBAV|FB_IAB|Instagram|Line\/|; wv\)|GSA\//i.test(navigator.userAgent);
const erSamsung = () => /SamsungBrowser/i.test(navigator.userAgent);
const SKJULT = "lagre-som-app-skjult";

/** Synlig stripe med «Lagre som app» – vises bare når appen ikke allerede er lagt på hjemskjermen. */
export function LagreSomApp() {
  const [kan, setKan] = useState(!!lagret);
  const [ferdig, setFerdig] = useState(erInstallert);
  const [veiledning, setVeiledning] = useState(false);
  const [skjult, setSkjult] = useState(() => {
    try { const t = Number(localStorage.getItem(SKJULT) || 0); return t > Date.now(); } catch { return false; }
  });

  useEffect(() => {
    const kanNaa = () => setKan(true);
    const installert = () => { setFerdig(true); lagret = null; };
    window.addEventListener("bygglogg-kan-installeres", kanNaa);
    window.addEventListener("appinstalled", installert);
    return () => { window.removeEventListener("bygglogg-kan-installeres", kanNaa); window.removeEventListener("appinstalled", installert); };
  }, []);

  const ios = erIos(), android = erAndroid();
  if (ferdig || (skjult && !veiledning)) return null;
  if (!kan && !ios && !android) return null; // PC-nettleser som ikke kan installere (f.eks. Firefox)

  /** Når knappen er trykket én gang, skal den ikke vises igjen på denne enheten */
  const fjernForGodt = () => {
    try { localStorage.setItem(SKJULT, String(Date.now() + 10 * 365 * 864e5)); } catch { /* privat modus */ }
  };
  const lagre = async () => {
    fjernForGodt();
    if (lagret) {
      await lagret.prompt();
      const { outcome } = await lagret.userChoice;
      if (outcome === "accepted") setFerdig(true);
      lagret = null; setKan(false); setSkjult(true);
    } else setVeiledning(true);
  };
  const ikkeNaa = () => {
    try { localStorage.setItem(SKJULT, String(Date.now() + 7 * 864e5)); } catch { /* privat modus */ }
    setSkjult(true);
  };

  return (
    <>
      <div className="lagre-app" role="region" aria-label="Lagre som app">
        <span className="lagre-app-ikon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M12 7v7M9 11l3 3 3-3M10 18h4" /></svg>
        </span>
        <span className="lagre-app-tekst"><b>Lagre ByggLogg som app</b><span>Få ikon på hjemskjermen og åpne appen med ett trykk.</span></span>
        <button className="btn primary lagre-app-knapp" onClick={lagre}>Lagre som app</button>
        <button className="lagre-app-lukk" onClick={ikkeNaa} aria-label="Ikke nå">×</button>
      </div>
      {veiledning && (
        <div className="lysboks" role="dialog" aria-label="Slik lagrer du som app" onClick={() => { setVeiledning(false); setSkjult(true); }}>
          <div className="panel lagre-app-veiledning" onClick={(e) => e.stopPropagation()}>
            <h2>{android ? "Lagre som app på Android" : "Lagre som app på iPhone"}</h2>
            {android ? (erInnebygd() ? (
              <p>Du har åpnet ByggLogg inne i en annen app (for eksempel Messenger eller e-post). Trykk på <b>⋮</b> øverst og velg <b>«Åpne i Chrome»</b>, så trykker du «Lagre som app» der.</p>
            ) : erSamsung() ? (
              <ol>
                <li>Trykk på menyen <b>☰</b> nederst til høyre.</li>
                <li>Velg <b>«Legg til side til»</b> og så <b>«Startskjerm»</b>.</li>
                <li>Trykk <b>«Legg til»</b>.</li>
              </ol>
            ) : (
              <ol>
                <li>Trykk på de tre prikkene <b>⋮</b> øverst til høyre i Chrome.</li>
                <li>Velg <b>«Installer app»</b> eller <b>«Legg til på startsiden»</b>.</li>
                <li>Trykk <b>«Installer»</b> / <b>«Legg til»</b>.</li>
              </ol>
            )) : erIosSafari() ? (
              <ol>
                <li>Trykk på <b>Del</b>-knappen <span className="del-ikon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v8h14v-8" /></svg></span> nederst (eller øverst på iPad).</li>
                <li>Bla ned og velg <b>«Legg til på Hjem-skjerm»</b>.</li>
                <li>Trykk <b>«Legg til»</b> øverst til høyre.</li>
              </ol>
            ) : (
              <p>Åpne denne siden i <b>Safari</b> – på iPhone kan apper bare lagres på hjemskjermen derfra. Kopier adressen og lim den inn i Safari, så følger du stegene der.</p>
            )}
            <p className="small muted">Da får du ByggLogg-ikonet på hjemskjermen, og appen åpner i fullskjerm uten adresselinje.</p>
            <div><button className="btn primary" onClick={() => { setVeiledning(false); setSkjult(true); }}>Skjønner</button></div>
          </div>
        </div>
      )}
    </>
  );
}
