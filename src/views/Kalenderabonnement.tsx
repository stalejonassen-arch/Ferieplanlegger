import { useState } from "react";
import { useApp } from "../App";
import { api, feiltekst } from "../lib/api";

/** Lar den ansatte abonnere på sin egen godkjente ferie i mobilkalenderen. Leder kan også få hele firmaet. */
export function Kalenderabonnement() {
  const { leder } = useApp();
  const [token, setToken] = useState<string | null>(null);
  const [alle, setAlle] = useState(false);
  const [jobber, setJobber] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const hent = async (ny = false) => {
    setJobber(true); setMelding(null);
    try { setToken(await api.kalenderToken(ny)); if (ny) setMelding("Ny lenke laget. Den gamle virker ikke lenger."); }
    catch (e) { setMelding(feiltekst(e)); }
    finally { setJobber(false); }
  };

  const https = token ? api.kalenderUrl(token, alle) : "";
  const webcal = https.replace(/^https:/, "webcal:");
  const kopier = async () => {
    try { await navigator.clipboard.writeText(https); setMelding("Lenken er kopiert."); }
    catch { setMelding("Kunne ikke kopiere. Marker lenken og kopier den selv."); }
  };

  return (
    <section className="panel">
      <h2>Ferien i mobilkalenderen</h2>
      <p className="small muted">Abonner én gang, så dukker godkjent ferie opp i kalenderen din av seg selv. Endringer kommer med etter noen timer.</p>
      {!token ? (
        <div><button className="btn" disabled={jobber} onClick={() => hent()}>{jobber ? "Henter …" : "Vis kalenderlenke"}</button></div>
      ) : (
        <>
          {leder && (
            <label className="row small"><input type="checkbox" id="kal-alle" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> Vis ferien til alle ansatte (bare for leder)</label>
          )}
          <div className="row">
            <a className="btn primary" href={webcal}>Abonner (iPhone og Mac)</a>
            <button className="btn" onClick={kopier}>Kopier lenke</button>
          </div>
          <input type="text" id="kal-lenke" readOnly value={https} onFocus={(e) => e.target.select()} aria-label="Kalenderlenke" />
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>iPhone:</b> trykk «Abonner» og deretter «Abonner» igjen i kalenderen.</li>
            <li><b>Android / Google Kalender:</b> kopier lenken, åpne calendar.google.com på PC, velg «Andre kalendere» → «+» → «Fra nettadresse» og lim inn. Den dukker så opp på telefonen.</li>
            <li><b>Outlook:</b> «Legg til kalender» → «Abonner fra nettet» og lim inn lenken.</li>
          </ul>
          <p className="small muted">Lenken er personlig. Del den ikke med andre. <button className="linkbtn" disabled={jobber} onClick={() => hent(true)}>Lag ny lenke</button></p>
        </>
      )}
      {melding && <p className="small">{melding}</p>}
    </section>
  );
}
