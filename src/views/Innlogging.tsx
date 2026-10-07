import { useState } from "react";
import { api, feiltekst } from "../lib/api";

const DEMO = [
  ["stale@demo.no", "Ståle (leder)"], ["mads@demo.no", "Mads Kjerstad"], ["jim@demo.no", "Jim Kato"], ["karianne@demo.no", "Karianne"],
];

export function Innlogging() {
  const [epost, setEpost] = useState("");
  const [kode, setKode] = useState("");
  const [steg, setSteg] = useState<"epost" | "kode">("epost");
  const [jobber, setJobber] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setJobber(true); setFeil(null);
    try { await api.sendKode(epost); setSteg("kode"); }
    catch (x) { setFeil(feiltekst(x)); }
    finally { setJobber(false); }
  };
  const bekreft = async (e: React.FormEvent) => {
    e.preventDefault();
    setJobber(true); setFeil(null);
    try { await api.bekreftKode(epost, kode); }
    catch (x) { setFeil(feiltekst(x)); setJobber(false); }
  };

  return (
    <div className="wrap">
      <div className="login panel">
        <div className="brand"><small className="label">N L Austnes AS</small><h1>Ferieplanlegger</h1></div>

        {api.modus === "demo" ? (
          <>
            <p className="muted">Demomodus. Velg hvem du vil logge inn som.</p>
            <div className="list">
              {DEMO.map(([e, navn]) => (
                <button key={e} className="btn" onClick={() => api.bekreftKode(e, "")}>{navn}</button>
              ))}
            </div>
          </>
        ) : steg === "epost" ? (
          <form onSubmit={send} className="list">
            <p>Skriv inn jobb-e-posten din. Du får en kode på e-post.</p>
            <label className="field">
              <span className="label">E-post</span>
              <input id="epost" type="email" autoComplete="email" required value={epost} onChange={(e) => setEpost(e.target.value)} placeholder="navn@austnes.no" />
            </label>
            <div><button className="btn primary" disabled={jobber || !epost}>{jobber ? "Sender …" : "Send kode"}</button></div>
          </form>
        ) : (
          <form onSubmit={bekreft} className="list">
            <p>Vi har sendt en kode til <b>{epost}</b>. Skriv den inn her, eller trykk på lenken i e-posten.</p>
            <label className="field">
              <span className="label">Kode</span>
              <input id="kode" type="text" inputMode="numeric" autoComplete="one-time-code" required value={kode} onChange={(e) => setKode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            </label>
            <div className="row">
              <button className="btn primary" disabled={jobber || kode.length < 6}>{jobber ? "Logger inn …" : "Logg inn"}</button>
              <button type="button" className="linkbtn" onClick={() => { setSteg("epost"); setKode(""); }}>Bruk en annen e-post</button>
            </div>
          </form>
        )}
        {feil && <p style={{ color: "var(--warn)" }}>{feil}</p>}
      </div>
    </div>
  );
}
