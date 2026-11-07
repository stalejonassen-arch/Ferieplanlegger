// Kunderegister: søk, nye kunder og retting av kontaktinfo. Kunder fra Visma vises, men endres i Visma.
import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { telLenke } from "../lib/kart";
import type { Kunde } from "../lib/timer";
import { harVisma } from "../lib/visma";

type Skjema = Pick<Kunde, "navn" | "telefon" | "epost" | "adresse" | "postnr" | "poststed"> & { id?: string };
const tom: Skjema = { navn: "", telefon: "", epost: "", adresse: "", postnr: "", poststed: "" };

export function Kunder() {
  const { d, kjor } = useApp();
  const visma = harVisma(d);
  const [sok, setSok] = useState("");
  const [skjema, setSkjema] = useState<Skjema | null>(null);
  const [alle, setAlle] = useState(false);
  const q = sok.trim().toLowerCase(), siffer = sok.replace(/\D/g, "");
  const treff = d.kunder.filter((k) => !q || k.navn.toLowerCase().includes(q) || (siffer.length >= 3 && k.telefon.replace(/\D/g, "").includes(siffer))
    || k.epost.toLowerCase().includes(q) || `${k.adresse} ${k.poststed}`.toLowerCase().includes(q) || String(k.visma_nr ?? "") === q);
  const vis = alle || q ? treff.slice(0, 200) : treff.slice(0, 20);
  const antallProsjekter = (id: string) => d.prosjekter.filter((p) => p.kunde_id === id).length;
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skjema?.navn.trim()) return;
    const rad = Object.fromEntries(Object.entries(skjema).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as Skjema;
    if (await kjor(async () => { await api.lagreKunde(rad); }, skjema.id ? "Kunden er lagret" : `${rad.navn} er lagt til`)) setSkjema(null);
  };
  const felt = (k: keyof Skjema, label: string, x: { type?: string; kort?: boolean } = {}) => (
    <label className={`field${x.kort ? " kort" : ""}`}><span className="label">{label}</span>
      <input type={x.type ?? "text"} value={(skjema?.[k] as string) ?? ""} onChange={(e) => setSkjema({ ...skjema!, [k]: e.target.value })} required={k === "navn"} /></label>
  );

  return (
    <details className="panel" id="kunder">
      <summary><h2 style={{ display: "inline" }}>Kunder</h2> <span className="small muted">{d.kunder.length} kunder{visma ? " · hentes fra Visma" : ""}</span></summary>
      {skjema ? (
        <form onSubmit={lagre} style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div className="row">{felt("navn", "Navn")}{felt("telefon", "Telefon", { type: "tel", kort: true })}{felt("epost", "E-post", { type: "email" })}</div>
          <div className="row">{felt("adresse", "Adresse")}{felt("postnr", "Postnr", { kort: true })}{felt("poststed", "Poststed", { kort: true })}</div>
          <div className="row"><button className="btn primary" disabled={!skjema.navn.trim()}>{skjema.id ? "Lagre" : "Legg til kunde"}</button><button type="button" className="btn" onClick={() => setSkjema(null)}>Avbryt</button></div>
        </form>
      ) : (
        <>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <input type="search" value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Søk på navn, telefon, e-post eller adresse" aria-label="Søk i kunder" style={{ flex: 1, minWidth: 200 }} />
            <button className="btn primary sm" onClick={() => setSkjema({ ...tom, navn: sok.trim() && !/^\d+$/.test(sok.trim()) ? sok.trim() : "" })}>+ Ny kunde</button>
          </div>
          <div className="list">
            {vis.map((k) => (
              <div key={k.id} className="item" style={{ alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{k.navn}{k.visma_nr ? <span className="small muted"> · kundenr {k.visma_nr}</span> : null}</div>
                  <div className="s">
                    {[k.telefon && <a key="t" href={telLenke(k.telefon)}>{k.telefon}</a>, k.epost && <a key="e" href={`mailto:${k.epost}`}>{k.epost}</a>,
                      [k.adresse, [k.postnr, k.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", "), antallProsjekter(k.id) ? `${antallProsjekter(k.id)} prosjekter` : ""]
                      .filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}
                  </div>
                </div>
                {k.visma_nr == null
                  ? <button className="btn sm" onClick={() => setSkjema({ id: k.id, navn: k.navn, telefon: k.telefon, epost: k.epost, adresse: k.adresse, postnr: k.postnr, poststed: k.poststed })}>Endre</button>
                  : <span className="small muted">Endres i Visma</span>}
              </div>
            ))}
            {!vis.length && <div className="empty">{q ? "Ingen kunder passer søket." : "Ingen kunder ennå."}</div>}
          </div>
          {!q && !alle && treff.length > vis.length && <button className="linkbtn small" onClick={() => setAlle(true)}>Vis alle {treff.length}</button>}
        </>
      )}
    </details>
  );
}
