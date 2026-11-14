// KI-hjelp: tale til tekst i nettleseren, og om KI er satt opp for bedriften.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { bruker } from "../lib/moduler";

let status: Promise<boolean> | null = null;
/** Er KI-hjelpen slått på og satt opp (har nøkkel på serveren)? */
export function useKi(): boolean {
  const { d } = useApp();
  const [ok, setOk] = useState(false);
  const paa = bruker(d, "ai");
  useEffect(() => {
    if (!paa) { setOk(false); return; }
    status ??= api.ai<{ ok: boolean }>("status").then((x) => !!x.ok).catch(() => false);
    let levende = true;
    status.then((x) => { if (levende) setOk(x); });
    return () => { levende = false; };
  }, [paa]);
  return ok;
}

type Gjenkjenner = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const Talegjenkjenning = (): (new () => Gjenkjenner) | undefined =>
  (window as unknown as { SpeechRecognition?: new () => Gjenkjenner; webkitSpeechRecognition?: new () => Gjenkjenner }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Gjenkjenner }).webkitSpeechRecognition;
const SPRAK: Record<string, string> = { nb: "nb-NO", pl: "pl-PL", en: "en-GB", lt: "lt-LT" };

/** Tekstfelt der man kan snakke inn tekst (mikrofonknapp), eller skrive / bruke tastaturets mikrofon */
export function Snakk({ value, onChange, placeholder, rader = 4 }: { value: string; onChange: (t: string) => void; placeholder?: string; rader?: number }) {
  const { meg } = useApp();
  const G = Talegjenkjenning();
  const [lytter, setLytter] = useState(false);
  const [feil, setFeil] = useState("");
  const g = useRef<Gjenkjenner | null>(null);
  const start = useRef("");
  useEffect(() => () => g.current?.stop(), []);
  const lytt = () => {
    if (!G) return;
    if (lytter) { g.current?.stop(); return; }
    setFeil("");
    const r = new G();
    r.lang = SPRAK[meg.sprak ?? "nb"] ?? "nb-NO";
    r.continuous = true; r.interimResults = true;
    start.current = value.trim() ? `${value.trim()} ` : "";
    let ferdig = "";
    r.onresult = (e) => {
      let foreløpig = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i]!;
        if (x.isFinal) ferdig += `${x[0]!.transcript.trim()} `; else foreløpig += x[0]!.transcript;
      }
      onChange(`${start.current}${ferdig}${foreløpig}`.trimStart());
    };
    r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setFeil(e.error === "not-allowed" ? "Appen får ikke bruke mikrofonen. Gi tillatelse i nettleseren." : "Talegjenkjenningen stoppet. Prøv igjen, eller bruk mikrofonen på tastaturet."); };
    r.onend = () => setLytter(false);
    g.current = r;
    r.start();
    setLytter(true);
  };
  return (
    <div className="snakk">
      <textarea rows={rader} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <div className="row" style={{ alignItems: "center" }}>
        {G ? (
          <button type="button" className={`btn sm${lytter ? " lytter" : ""}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }} onClick={lytt} aria-pressed={lytter}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            <span>{lytter ? "Stopp" : "Snakk inn"}</span>
          </button>
        ) : <span className="small muted">Trykk på mikrofonen på tastaturet for å snakke inn.</span>}
        {lytter && <span className="small muted">Lytter … snakk i vei, trykk Stopp når du er ferdig.</span>}
      </div>
      {feil && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>{feil}</p>}
    </div>
  );
}

/** Henter et bilde og gjør det mindre (maks 1024 px), som base64-JPEG til KI */
export async function bildeTilKi(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bm = await createImageBitmap(await r.blob());
    const f = Math.min(1, 1024 / Math.max(bm.width, bm.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bm.width * f); c.height = Math.round(bm.height * f);
    c.getContext("2d")!.drawImage(bm, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8).split(",")[1] ?? null;
  } catch { return null; }
}
