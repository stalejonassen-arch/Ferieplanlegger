// Bestilling av materiell fra byggeplassen til butikken, og plukklisten hos butikk/prosjektleder.
import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { BESTILLING_STATUS, aapenBestilling, type Bestilling, type BestillingStatus, type Bestillingslinje } from "../lib/kvalitet";
import { t2, type Prosjekt } from "../lib/timer";
import { usePlanlegger } from "./Plan";

const tall = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;
const STATUS_CHIP: Record<BestillingStatus, string> = { ny: "venter", plukkes: "venter", klar: "godkjent", levert: "demo", avvist: "avslatt" };
type Rad = { beskrivelse: string; antall: string; enhet: string; nobb: string };
const tomRad = (): Rad => ({ beskrivelse: "", antall: "", enhet: "stk", nobb: "" });
const varetekst = (l: Bestillingslinje) => `${l.antall ? `${t2(l.antall)} ${l.enhet} ` : ""}${l.beskrivelse}`;

function BestillSkjema({ p, start, lukk }: { p: Prosjekt; start?: Bestilling; lukk: () => void }) {
  const { kjor, idag } = useApp();
  const [rader, setRader] = useState<Rad[]>(start ? start.linjer.map((l) => ({ beskrivelse: l.beskrivelse, antall: l.antall ? String(l.antall).replace(".", ",") : "", enhet: l.enhet, nobb: l.nobb ?? "" })) : [tomRad(), tomRad()]);
  const [dato, setDato] = useState(start?.onsket_dato ?? "");
  const [merknad, setMerknad] = useState(start?.merknad ?? "");
  const linjer = rader.filter((r) => r.beskrivelse.trim()).map((r) => ({ beskrivelse: r.beskrivelse.trim(), antall: tall(r.antall), enhet: r.enhet.trim(), ...(r.nobb.trim() ? { nobb: r.nobb.trim() } : {}) }));
  const sett = (i: number, x: Partial<Rad>) => {
    const ny = rader.map((r, n) => (n === i ? { ...r, ...x } : r));
    if (i === ny.length - 1 && ny[i]!.beskrivelse.trim()) ny.push(tomRad());
    setRader(ny);
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linjer.length) return;
    const ok = await kjor(() => api.bestill({ id: start?.id, prosjekt_id: p.id, onsket_dato: dato || null, merknad: merknad.trim(), linjer }), start ? "Bestillingen er endret" : "Bestillingen er sendt til butikken");
    if (ok) lukk();
  };
  return (
    <form onSubmit={send} style={{ display: "grid", gap: 8 }}>
      <datalist id="enheter-b">{["stk", "m", "lm", "m2", "pk", "rull", "sekk", "spann", "kg", "liter", "boks"].map((e) => <option key={e} value={e} />)}</datalist>
      {rader.map((r, i) => (
        <div key={i} className="row mat-ny" style={{ gap: 6 }}>
          <input aria-label={`Vare ${i + 1}`} value={r.beskrivelse} onChange={(e) => sett(i, { beskrivelse: e.target.value })} placeholder={i === 0 ? "F.eks. Skruer 5x50 rustfri" : "Vare"} style={{ flex: "3 1 200px" }} maxLength={300} />
          <input aria-label={`Antall ${i + 1}`} inputMode="decimal" value={r.antall} onChange={(e) => sett(i, { antall: e.target.value })} placeholder="Antall" style={{ flex: "0 1 80px", minWidth: 64 }} />
          <input aria-label={`Enhet ${i + 1}`} list="enheter-b" value={r.enhet} onChange={(e) => sett(i, { enhet: e.target.value })} style={{ flex: "0 1 80px", minWidth: 64 }} />
        </div>
      ))}
      <div className="row" style={{ gap: 10 }}>
        <label className="field kort"><span className="label">Trengs til</span>
          <input type="date" value={dato} min={idag} onChange={(e) => setDato(e.target.value)} /></label>
        <label className="field" style={{ flex: "2 1 220px" }}><span className="label">Beskjed til butikken (valgfritt)</span>
          <input value={merknad} onChange={(e) => setMerknad(e.target.value)} placeholder="F.eks. henter selv kl. 15, eller lever på byggeplassen" maxLength={2000} /></label>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!linjer.length}>{start ? "Lagre" : `Send bestilling (${linjer.length} ${linjer.length === 1 ? "vare" : "varer"})`}</button>
        <button type="button" className="btn" onClick={lukk}>Avbryt</button>
      </div>
    </form>
  );
}

/** På prosjektet: bestill materiell og se hva som er bestilt */
export function BestillDel({ p }: { p: Prosjekt }) {
  const { d, meg, kjor } = useApp();
  const [skjema, setSkjema] = useState<Bestilling | "ny" | null>(null);
  const liste = (d.bestillinger ?? []).filter((b) => b.prosjekt_id === p.id).sort((a, b) => b.opprettet.localeCompare(a.opprettet));
  const navn = (id: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Bestill materiell</h2>
        {!skjema && <button className="btn primary" onClick={() => setSkjema("ny")}>+ Ny bestilling</button>}
      </div>
      {skjema && <BestillSkjema p={p} start={skjema === "ny" ? undefined : skjema} lukk={() => setSkjema(null)} />}
      {!skjema && !liste.length && <p className="muted small" style={{ margin: 0 }}>Mangler noe på byggeplassen? Bestill det her, så får butikken beskjed med en gang.</p>}
      {liste.length > 0 && (
        <ul className="plan-liste">
          {liste.slice(0, 10).map((b) => (
            <li key={b.id} className="plan-oppgave" style={{ borderLeftColor: b.status === "avvist" ? "var(--warn)" : aapenBestilling(b) ? "var(--pending)" : "var(--approved)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="small">{navn(b.bestilt_av)} · {kortDato(b.opprettet.slice(0, 10))}{b.onsket_dato ? ` · trengs ${kortDato(b.onsket_dato)}` : ""}</span>
                <span className={`chip ${STATUS_CHIP[b.status]}`}>{BESTILLING_STATUS[b.status]}</span>
              </div>
              <div>{b.linjer.map(varetekst).join(", ")}</div>
              {b.merknad && <div className="small muted">{b.merknad}</div>}
              {b.svar && <div className="small"><b>Svar fra butikken:</b> {b.svar}</div>}
              {b.status === "ny" && b.bestilt_av === meg.id && (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm" onClick={() => setSkjema(b)}>Endre</button>
                  <button className="btn sm" onClick={() => kjor(() => api.slettBestilling(b.id), "Bestillingen er trukket tilbake")}>Trekk tilbake</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** For butikk og prosjektleder: bestillinger fra byggeplassene som skal plukkes og leveres */
export function Bestillingsoversikt() {
  const { d, kjor } = useApp();
  const planlegger = usePlanlegger();
  const [vis, setVis] = useState<"aapne" | "alle">("aapne");
  const [svar, setSvar] = useState<Record<string, string>>({});
  const [plukket, setPlukket] = useState<Record<string, boolean>>({});
  if (!planlegger) return null;
  const liste = (d.bestillinger ?? []).filter((b) => vis === "alle" || aapenBestilling(b))
    .sort((a, b) => (a.onsket_dato ?? "9999").localeCompare(b.onsket_dato ?? "9999") || a.opprettet.localeCompare(b.opprettet));
  const prosjekt = (id: string) => d.prosjekter.find((p) => p.id === id);
  const navn = (id: string | null) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const sett = (b: Bestilling, s: BestillingStatus, t: string) => kjor(() => api.settBestillingStatus(b.id, s, svar[b.id] ?? undefined), t);
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Bestillinger fra byggeplassen</h2>
        <select aria-label="Vis bestillinger" value={vis} onChange={(e) => setVis(e.target.value as "aapne" | "alle")}>
          <option value="aapne">Åpne</option><option value="alle">Alle</option>
        </select>
      </div>
      {!liste.length && <p className="muted small" style={{ margin: 0 }}>Ingen {vis === "aapne" ? "åpne " : ""}bestillinger.</p>}
      {liste.map((b) => {
        const p = prosjekt(b.prosjekt_id);
        return (
          <div key={b.id} className="leveranse">
            <div className="leveranse-topp">
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{p ? `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}` : "Prosjekt"}</b>
                <div className="small muted">{navn(b.bestilt_av)} · bestilt {kortDato(b.opprettet.slice(0, 10))}{b.onsket_dato ? ` · trengs ${kortDato(b.onsket_dato)}` : ""}{p?.adresse ? ` · ${p.adresse}` : ""}</div>
              </div>
              <span className={`chip ${STATUS_CHIP[b.status]}`}>{BESTILLING_STATUS[b.status]}</span>
            </div>
            <ul className="mat-liste">
              {b.linjer.map((l, i) => {
                const k = `${b.id}-${i}`;
                return (
                  <li key={k} className={plukket[k] ? "levert" : ""}>
                    <label className="mat-hake"><input type="checkbox" checked={!!plukket[k]} onChange={(e) => setPlukket({ ...plukket, [k]: e.target.checked })} aria-label={`Plukket ${l.beskrivelse}`} />
                      <span className="mat-navn">{l.beskrivelse}</span></label>
                    <span className="mat-antall">{l.antall ? `${t2(l.antall)} ${l.enhet}` : l.enhet}</span>
                  </li>
                );
              })}
            </ul>
            {b.merknad && <div className="small"><b>Beskjed:</b> {b.merknad}</div>}
            {aapenBestilling(b) && (
              <input aria-label="Svar til den som bestilte" placeholder="Svar til den som bestilte (valgfritt), f.eks. «Ligger klart i butikken»"
                value={svar[b.id] ?? b.svar} onChange={(e) => setSvar({ ...svar, [b.id]: e.target.value })} />
            )}
            <div className="row" style={{ gap: 6 }}>
              {b.status === "ny" && <button className="btn sm" onClick={() => sett(b, "plukkes", "Tatt i mot")}>Ta i mot</button>}
              {(b.status === "ny" || b.status === "plukkes") && <button className="btn sm primary" onClick={() => sett(b, "klar", "Meldt klar")}>Klar</button>}
              {aapenBestilling(b) && <button className="btn sm" onClick={() => sett(b, "levert", "Levert")}>Levert</button>}
              {aapenBestilling(b) && <button className="btn sm" onClick={() => sett(b, "avvist", "Meldt at den ikke kan leveres")}>Kan ikke leveres</button>}
              {!b.leveranse_id && b.status !== "avvist" && (
                <button className="btn sm" onClick={() => kjor(() => api.bestillingTilLeveranse(b, `Bestilling fra ${navn(b.bestilt_av).split(" ")[0] || "byggeplassen"} ${kortDato(b.opprettet.slice(0, 10))}`), "Lagt i materiallisten på prosjektet")}>Legg i materiallisten</button>
              )}
              {b.leveranse_id && <span className="small muted">Ligger i materiallisten</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
