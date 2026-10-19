import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api, type PlattformBedrift, type TripletexStatus } from "../lib/api";
import type { Bedrift, Tema } from "../lib/ferie";

const TEMA: [Tema, string][] = [["byggfag", "ByggLogg-blå"], ["bfportal", "Lys blå"], ["standard", "Skandinavisk"], ["fargerik", "Fargerik"], ["mork", "Mørk"], ["thaugland", "Rød og grå"]];

interface StedTreff { navn: string; kommune: string; lat: number; lon: number }

/** Søk i Kartverkets stedsnavn (åpent, ingen nøkkel) */
async function finnSted(sok: string): Promise<StedTreff[]> {
  const r = await fetch(`https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(sok)}&fuzzy=true&utkoordsys=4258&treffPerSide=8`);
  if (!r.ok) throw new Error("Fant ikke stedet akkurat nå. Prøv igjen.");
  const j = await r.json() as { navn?: { skrivemåte: string; kommuner?: { kommunenavn: string }[]; representasjonspunkt: { nord: number; øst: number } }[] };
  return (j.navn ?? []).map((n) => ({ navn: n.skrivemåte, kommune: n.kommuner?.[0]?.kommunenavn ?? "", lat: n.representasjonspunkt.nord, lon: n.representasjonspunkt.øst }));
}

/** Leder: bedriftens navn, adresse og kontaktinfo (brukes i sluttdokumentasjon og lønnsfiler), sted for værmeldingen, farger og kampanjenavn */
export function Bedriftsprofil() {
  const { d, kjor } = useApp();
  const b = d.bedrift;
  const [f, setF] = useState<Partial<Bedrift>>(() => ({ ...b }));
  const [sok, setSok] = useState("");
  const [treff, setTreff] = useState<StedTreff[] | null>(null);
  const [feil, setFeil] = useState("");
  if (!b) return null;

  const felt = (k: keyof Bedrift, navn: string, ekstra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span className="label">{navn}</span><input value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} {...ekstra} /></label>
  );
  const endret = (Object.keys(f) as (keyof Bedrift)[]).some((k) => (f[k] ?? "") !== (b[k] ?? ""));
  const lagre = (e: React.FormEvent) => {
    e.preventDefault();
    const { id: _id, ...rest } = f;
    kjor(() => api.lagreBedriftsprofil(rest), "Bedriftsprofilen er lagret");
  };
  const sokSted = async () => {
    setFeil(""); setTreff(null);
    if (!sok.trim()) return;
    try { setTreff(await finnSted(sok.trim())); } catch (e) { setFeil(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="panel" id="bedriftsprofil">
      <h2>Bedriftsprofil</h2>
      <p className="small muted">Navn og kontaktinfo brukes øverst i appen, i sluttdokumentasjonen til kunden og i lønnsfilene. Stedet styrer værmeldingen på startsiden.</p>
      <form onSubmit={lagre} className="skjema-rutenett" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {felt("navn", "Firmanavn", { required: true })}
        {felt("undertittel", "Linje over «ByggLogg»", { placeholder: "Byggfag · Firma AS" })}
        {felt("orgnr", "Org.nr.", { inputMode: "numeric" })}
        {felt("telefon", "Telefon", { type: "tel" })}
        {felt("epost", "E-post", { type: "email" })}
        {felt("adresse", "Adresse")}
        {felt("postnr", "Postnr.", { inputMode: "numeric", maxLength: 4 })}
        {felt("poststed", "Poststed")}
        {felt("kampanje_tittel", "Navn på kampanjekortet", { placeholder: "Kampanje fra Byggfag" })}
        <label className="field"><span className="label">Standardfarger</span>
          <select value={f.tema ?? "byggfag"} onChange={(e) => setF((x) => ({ ...x, tema: e.target.value as Tema }))}>
            {TEMA.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="field" style={{ flex: 1, minWidth: 200 }}><span className="label">Sted for værmeldingen</span>
            <input value={sok} placeholder={f.sted_navn ? `Nå: ${f.sted_navn}` : "Skriv et stedsnavn"} onChange={(e) => setSok(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sokSted(); } }} />
          </label>
          <button type="button" className="btn" onClick={sokSted}>Finn sted</button>
        </div>
        {feil && <p className="small" style={{ gridColumn: "1 / -1", color: "var(--feil, #b00)" }}>{feil}</p>}
        {treff && (
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {treff.length === 0 && <span className="small muted">Ingen treff.</span>}
            {treff.map((t, i) => (
              <button type="button" key={i} className="btn sm" onClick={() => { setF((x) => ({ ...x, sted_navn: t.navn, sted_lat: Math.round(t.lat * 1000) / 1000, sted_lon: Math.round(t.lon * 1000) / 1000 })); setTreff(null); setSok(""); }}>
                {t.navn}{t.kommune && t.kommune !== t.navn ? ` (${t.kommune})` : ""}
              </button>
            ))}
          </div>
        )}
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn primary" disabled={!endret}>Lagre bedriftsprofil</button>
        </div>
      </form>
    </section>
  );
}

/** Leder: koble bedriften til Tripletex med en ansattnøkkel. Prosjekter, kunder og ansatte hentes derfra, og godkjente timer sendes tilbake. */
export function Tripletex() {
  const { kjor } = useApp();
  const [st, setSt] = useState<TripletexStatus | null>(null);
  const [nokkel, setNokkel] = useState("");
  const [vis, setVis] = useState(false);
  const [melding, setMelding] = useState("");
  const [jobber, setJobber] = useState(false);
  const last = () => api.tripletexStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { last(); }, []);
  if (!st) return null;

  const koble = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await kjor(() => api.kobleTripletex(nokkel), "Koblet til Tripletex");
    if (ok) { setNokkel(""); setVis(false); await last(); hentNa(); }
  };
  const hentNa = async () => {
    setJobber(true); setMelding("");
    try { setMelding(await api.tripletexHentNa()); } catch (e) { setMelding(e instanceof Error ? e.message : String(e)); }
    finally { setJobber(false); last(); }
  };
  const koblet = st.aktiv && st.har_nokkel;

  return (
    <section className="panel" id="tripletex">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Tripletex</h2>
        <span className={`chip ${koblet ? "godkjent" : "demo"}`}>{koblet ? "Koblet til" : "Ikke koblet til"}</span>
      </div>
      <p className="small muted">Bruker bedriften Tripletex til regnskap og lønn, hentes prosjekter, kunder og ansatte derfra hvert kvarter. Godkjente timer sendes tilbake som timeføringer på prosjektet, så lønn og fakturering kan gjøres i Tripletex uten å skrive noe av på nytt.</p>
      {koblet ? (
        <>
          <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", margin: 0 }}>
            <dt className="muted">Sist hentet</dt><dd style={{ margin: 0 }}>{st.sist ? new Date(st.sist).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }) : "Ikke ennå"}</dd>
            <dt className="muted">Status</dt><dd style={{ margin: 0 }}>{st.status || "–"}</dd>
            <dt className="muted">Timeføringer sendt</dt><dd style={{ margin: 0 }}>{st.sendt_timer}</dd>
          </dl>
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" id="tx-send-timer" checked={st.send_timer}
              onChange={(e) => kjor(() => api.tripletexInnstillinger(e.target.checked, st.aktivitet_id), e.target.checked ? "Godkjente timer sendes til Tripletex" : "Timer sendes ikke lenger til Tripletex").then(last)} />
            Send godkjente timer til Tripletex
          </label>
          {melding && <p className="small">{melding}</p>}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn" disabled={jobber} onClick={hentNa}>{jobber ? "Henter …" : "Hent nå"}</button>
            <button className="btn" onClick={() => setVis((x) => !x)}>Bytt nøkkel</button>
            <button className="btn" onClick={() => kjor(() => api.kobleFraTripletex(), "Koblet fra Tripletex").then(last)}>Koble fra</button>
          </div>
        </>
      ) : (
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Logg inn i Tripletex som administrator.</li>
          <li>Gå til brukermenyen øverst til høyre og velg <b>API-tilgang</b>.</li>
          <li>Lag en ny <b>ansattnøkkel</b> for applikasjonen «ByggLogg» og kopier den.</li>
          <li>Lim den inn her og trykk «Koble til».</li>
        </ol>
      )}
      {(!koblet || vis) && (
        <form onSubmit={koble} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="field" style={{ flex: 1, minWidth: 220 }}><span className="label">Ansattnøkkel fra Tripletex</span>
            <input id="tx-nokkel" type="password" autoComplete="off" value={nokkel} onChange={(e) => setNokkel(e.target.value)} placeholder="Lim inn nøkkelen" />
          </label>
          <button className="btn primary" disabled={nokkel.trim().length < 10}>Koble til</button>
        </form>
      )}
      <p className="small muted" style={{ margin: 0 }}>Nøkkelen lagres på serveren og kan ikke leses av noen i appen, heller ikke av leder. Ansatte kobles på e-post eller ansattnummer, så bruk samme e-post i ByggLogg og Tripletex.</p>
    </section>
  );
}

const iDag = () => new Date().toISOString().slice(0, 10);
const datoVis = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("nb-NO") : "–");

/** Bare for den som selger ByggLogg: alle kundebedrifter, ny kunde, og stenge/åpne abonnement */
export function PlattformAdmin() {
  const { kjor } = useApp();
  const [admin, setAdmin] = useState(false);
  const [liste, setListe] = useState<PlattformBedrift[]>([]);
  const [ny, setNy] = useState({ navn: "", orgnr: "", leder_navn: "", leder_epost: "", avdelinger: "Butikk, Snekker", visma: "" });

  const last = () => api.plattformOversikt().then(setListe).catch(() => setListe([]));
  useEffect(() => { api.erPlattformAdmin().then((a) => { setAdmin(a); if (a) last(); }).catch(() => setAdmin(false)); }, []);
  if (!admin) return null;

  const opprett = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await kjor(async () => {
      await api.opprettBedrift({
        navn: ny.navn.trim(), orgnr: ny.orgnr.replace(/\s/g, ""), leder_navn: ny.leder_navn.trim(), leder_epost: ny.leder_epost.trim(),
        avdelinger: ny.avdelinger.split(",").map((s) => s.trim()).filter(Boolean), visma_firma_nr: ny.visma ? Number(ny.visma) : null,
      });
    }, `${ny.navn.trim()} er opprettet. Lederen kan nå logge inn med e-posten sin.`);
    if (ok) { setNy({ navn: "", orgnr: "", leder_navn: "", leder_epost: "", avdelinger: "Butikk, Snekker", visma: "" }); last(); }
  };
  const sett = (b: PlattformBedrift, aktiv: boolean, til: string | null) => kjor(() => api.settAbonnement(b.id, aktiv, til), aktiv ? `${b.navn} er åpnet` : `${b.navn} er stengt`).then(last);
  const ut = (b: PlattformBedrift) => !b.aktiv || (b.abonnement_til != null && b.abonnement_til < iDag());

  return (
    <section className="panel">
      <h2>Kunder (plattform)</h2>
      <p className="small muted">Bare du ser dette. Hver bedrift ser kun sine egne data. En stengt bedrift kan ikke logge inn, men dataene blir liggende.</p>
      <div className="scroll" style={{ border: 0 }}>
        <table className="tbl">
          <thead><tr><th>Bedrift</th><th>Org.nr.</th><th>Ansatte</th><th>Leder</th><th>Sist timeføring</th><th>Abonnement til</th><th>Status</th><th /></tr></thead>
          <tbody>
            {liste.map((b) => (
              <tr key={b.id}>
                <td><b>{b.navn}</b></td>
                <td>{b.orgnr || "–"}</td>
                <td>{b.ansatte}</td>
                <td className="small">{b.ledere || "–"}</td>
                <td>{datoVis(b.sist_aktiv)}</td>
                <td><input type="date" aria-label={`Abonnement til for ${b.navn}`} defaultValue={b.abonnement_til ?? ""}
                  onBlur={(e) => { const v = e.target.value || null; if (v !== b.abonnement_til) sett(b, b.aktiv, v); }} /></td>
                <td>{ut(b) ? <span className="chip avslatt">Stengt</span> : <span className="chip godkjent">Aktiv</span>}</td>
                <td>{b.aktiv
                  ? <button className="btn sm" onClick={() => sett(b, false, b.abonnement_til)}>Steng</button>
                  : <button className="btn sm" onClick={() => sett(b, true, b.abonnement_til)}>Åpne</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Ny kunde</h3>
      <form onSubmit={opprett} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label className="field"><span className="label">Firmanavn</span><input required value={ny.navn} onChange={(e) => setNy({ ...ny, navn: e.target.value })} /></label>
        <label className="field"><span className="label">Org.nr.</span><input inputMode="numeric" value={ny.orgnr} onChange={(e) => setNy({ ...ny, orgnr: e.target.value })} /></label>
        <label className="field"><span className="label">Leders navn</span><input required value={ny.leder_navn} onChange={(e) => setNy({ ...ny, leder_navn: e.target.value })} /></label>
        <label className="field"><span className="label">Leders e-post</span><input required type="email" value={ny.leder_epost} onChange={(e) => setNy({ ...ny, leder_epost: e.target.value })} /></label>
        <label className="field"><span className="label">Avdelinger (komma mellom)</span><input value={ny.avdelinger} onChange={(e) => setNy({ ...ny, avdelinger: e.target.value })} /></label>
        <label className="field"><span className="label">Visma firmanr. (valgfritt)</span><input inputMode="numeric" value={ny.visma} onChange={(e) => setNy({ ...ny, visma: e.target.value.replace(/\D/g, "") })} /></label>
        <div style={{ gridColumn: "1 / -1" }}><button className="btn primary">Opprett bedrift</button></div>
      </form>
    </section>
  );
}
