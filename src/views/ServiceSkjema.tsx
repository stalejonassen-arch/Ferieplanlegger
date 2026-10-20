// Skjema på nettet der kunden selv melder inn et serviceoppdrag (uten innlogging).
// Lenken (…?service=<nøkkel>) finnes under Oppsett → Serviceoppdrag og kan legges på hjemmesiden eller Facebook.
import { useEffect, useState } from "react";
import { api, feiltekst } from "../lib/api";

export function ServiceSkjema({ nokkel }: { nokkel: string }) {
  const [firma, setFirma] = useState<string | null | undefined>(undefined);
  const [f, setF] = useState({ navn: "", telefon: "", epost: "", adresse: "", beskrivelse: "", haster: false, felle: "" });
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState("");
  const [sendt, setSendt] = useState(false);
  useEffect(() => { api.serviceSkjemaInfo(nokkel).then((i) => setFirma(i?.navn ?? null)).catch(() => setFirma(null)); document.title = "Bestill service"; }, [nokkel]);
  const sett = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSender(true); setFeil("");
    try { await api.meldService(nokkel, f); setSendt(true); }
    catch (x) { setFeil(feiltekst(x)); }
    finally { setSender(false); }
  };
  return (
    <div className="wrap service-skjema">
      <header className="top login-topp"><div className="brand"><small>{firma ?? ""}</small><h1>Bestill service</h1></div></header>
      <div className="panel" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        {firma === undefined ? <p className="muted">Laster …</p> : firma === null ? (
          <p>Denne lenken er ikke i bruk lenger. Ta kontakt med oss på telefon.</p>
        ) : sendt ? (
          <>
            <h2 style={{ margin: 0 }}>Takk! ✅</h2>
            <p style={{ margin: 0 }}>Vi har fått henvendelsen og tar kontakt med deg på <b>{f.telefon}</b> for å avtale tid.{f.haster ? " Vi ser at det haster, og prioriterer det." : ""}</p>
          </>
        ) : (
          <form onSubmit={send} style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>Trenger du hjelp med en mindre jobb – en dør som må justeres, en lekkasje, noe som skal monteres? Fortell oss hva det gjelder, så ringer vi deg tilbake.</p>
            <label className="field"><span className="label">Navn</span><input value={f.navn} onChange={(e) => sett({ navn: e.target.value })} autoComplete="name" required maxLength={200} /></label>
            <div className="row">
              <label className="field"><span className="label">Telefon</span><input type="tel" value={f.telefon} onChange={(e) => sett({ telefon: e.target.value })} autoComplete="tel" required maxLength={40} /></label>
              <label className="field"><span className="label">E-post (valgfritt)</span><input type="email" value={f.epost} onChange={(e) => sett({ epost: e.target.value })} autoComplete="email" maxLength={200} /></label>
            </div>
            <label className="field"><span className="label">Adresse der jobben skal gjøres</span><input value={f.adresse} onChange={(e) => sett({ adresse: e.target.value })} autoComplete="street-address" maxLength={300} /></label>
            <label className="field"><span className="label">Hva skal gjøres?</span>
              <textarea rows={4} value={f.beskrivelse} onChange={(e) => sett({ beskrivelse: e.target.value })} required maxLength={5000} placeholder="F.eks. «Ytterdøra går ikke i lås, må justeres»" /></label>
            <label className="hake"><input type="checkbox" checked={f.haster} onChange={(e) => sett({ haster: e.target.checked })} /><span>Det haster (i dag eller i morgen)</span></label>
            {/* Felle for roboter – skjult for mennesker */}
            <input type="text" name="nettsted" tabIndex={-1} autoComplete="off" value={f.felle} onChange={(e) => sett({ felle: e.target.value })} style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
            {feil && <p style={{ color: "var(--warn)", margin: 0 }}>{feil}</p>}
            <div><button className="btn primary" disabled={sender}>{sender ? "Sender …" : "Send"}</button></div>
            <p className="small muted" style={{ margin: 0 }}>Opplysningene brukes bare til å følge opp henvendelsen din.</p>
          </form>
        )}
      </div>
    </div>
  );
}
