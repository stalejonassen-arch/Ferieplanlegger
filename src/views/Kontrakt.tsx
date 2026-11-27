// ByggLogg Kontrakt: fanen «Kontrakt» på prosjektet.
// Kontraktskortet (standard, byggherrens representant, frister i kontrakten), fristlisten fra fristmotoren
// og sakene på prosjektet. Appen holder orden på frister og varsler – den avgjør ingen juridiske spørsmål.
import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato, langDato } from "../lib/ferie";
import { lokalDato } from "../lib/dag";
import {
  FRISTTYPER, NIVA_CHIP, NIVA_TEKST, SAKTYPER, SAK_CHIP, SAK_STATUS, STANDARDER,
  epostHolder, frister, fraSkjema, punkt, sorterSaker, tilSkjema,
  type FristType, type KontraktSkjema, type NsKontrakt, type Standard,
} from "../lib/ns";
import type { Prosjekt } from "../lib/timer";
import { usePlanlegger } from "./Plan";

const kr = (n: number) => `kr ${n.toLocaleString("nb-NO")}`;

/** Antall frister som er passert, i dag eller snart – tallet på fanen */
export function presserendeFrister(d: ReturnType<typeof useApp>["d"], prosjektId: string, idag: string): number {
  const k = (d.kontrakter ?? []).find((x) => x.prosjekt_id === prosjektId);
  if (!k) return 0;
  const saker = (d.nsSaker ?? []).filter((s) => s.kontrakt_id === k.id);
  return frister(k, saker, d.nsVarsler ?? [], (d.kontraktFrister ?? []).filter((f) => f.kontrakt_id === k.id), idag).filter((f) => f.niva !== "ok").length;
}

export function KontraktDel({ p }: { p: Prosjekt }) {
  const { d } = useApp();
  const planlegger = usePlanlegger();
  const k = (d.kontrakter ?? []).find((x) => x.prosjekt_id === p.id);
  const [endre, setEndre] = useState(false);
  useEffect(() => setEndre(false), [p.id]);

  if (!k || endre) {
    if (!planlegger) return <section className="panel"><p className="muted" style={{ margin: 0 }}>Prosjektet har ingen NS-kontrakt registrert. Leder eller prosjektleder legger den inn.</p></section>;
    return <KontraktSkjemaDel p={p} k={k} lukk={() => setEndre(false)} />;
  }
  return (
    <>
      <Kontraktskort k={k} endre={() => setEndre(true)} />
      <Fristliste k={k} />
      <Saker k={k} />
      {planlegger && <Kontraktsfrister k={k} />}
    </>
  );
}

// ------------------------------------------------------------ Kontraktskortet

function Kontraktskort({ k, endre }: { k: NsKontrakt; endre: () => void }) {
  const planlegger = usePlanlegger();
  const std = STANDARDER[k.standard];
  return (
    <section className="panel">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>{std.navn}</h2>
        {planlegger && <button className="btn sm" onClick={endre}>Endre kontrakten</button>}
      </div>
      <div className="legend">
        {planlegger && k.kontraktssum != null && <div><span className="label">Kontraktssum</span><span className="v">{kr(k.kontraktssum)}</span><span className="small muted">eks. mva</span></div>}
        <div><span className="label">Sluttfrist</span><span className="v">{k.sluttfrist ? kortDato(k.sluttfrist) : "–"}</span></div>
        {k.dagmulkt_promille != null && <div><span className="label">Dagmulkt</span><span className="v">{String(k.dagmulkt_promille).replace(".", ",")} ‰</span><span className="small muted">per dag</span></div>}
        <div><span className="label">Vår varslingsfrist</span><span className="v">{k.varsel_dager} dager</span></div>
        {k.overtakelse && <div><span className="label">Overtakelse</span><span className="v">{kortDato(k.overtakelse)}</span></div>}
      </div>
      <div className="small" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>Byggherrens representant: {k.bh_navn ? <b>{k.bh_navn}</b> : <span className="muted">ikke registrert</span>}
          {k.bh_epost && <> · <a href={`mailto:${k.bh_epost}`}>{k.bh_epost}</a></>}
          {k.bh_telefon && <> · <a href={`tel:${k.bh_telefon.replace(/[^\d+]/g, "")}`}>{k.bh_telefon}</a></>}</span>
        {k.sikkerhet && <span>Sikkerhet: {k.sikkerhet}</span>}
        <span>{epostHolder(k.standard, k.epost_skriftlig) ? "E-post gjelder som skriftlig varsel på dette prosjektet." : "Det er ikke registrert at e-post gjelder som skriftlig. Sjekk kontrakten før du varsler på e-post."}</span>
        {k.bh_skjema && <span>Byggherren krever egne skjema for varsler.</span>}
        {k.notat && <span style={{ whiteSpace: "pre-wrap" }}>{k.notat}</span>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Appen holder orden på frister og varsler. Den avgjør ingen juridiske spørsmål – er du i tvil, sjekk kontrakten eller spør daglig leder.</p>
    </section>
  );
}

function KontraktSkjemaDel({ p, k, lukk }: { p: Prosjekt; k?: NsKontrakt; lukk: () => void }) {
  const { leder, kjor } = useApp();
  const [f, setF] = useState<KontraktSkjema>(() => tilSkjema(k));
  const [feil, setFeil] = useState("");
  const [slett, setSlett] = useState(false);
  const sett = <K extends keyof KontraktSkjema>(n: K, v: KontraktSkjema[K]) => setF((x) => ({ ...x, [n]: v }));
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = fraSkjema(f, p.id, k?.id);
    if ("feil" in r) { setFeil(r.feil); return; }
    setFeil("");
    if (await kjor(() => api.lagreKontrakt(r.ok).then(() => {}), k ? "Kontrakten er lagret" : "Kontrakten er registrert")) lukk();
  };
  return (
    <form className="panel" onSubmit={lagre}>
      <h2 style={{ margin: 0 }}>{k ? "Endre kontrakten" : "Registrer NS-kontrakt"}</h2>
      {!k && <p className="small muted" style={{ margin: 0 }}>Er prosjektet på en NS-kontrakt, legg den inn her. Da holder appen orden på fristene, og snekkerne kan melde hendelser som kan gi krav på tid eller penger.</p>}
      <label className="field"><span className="label">Standard</span>
        <select value={f.standard} onChange={(e) => sett("standard", e.target.value as Standard)}>
          {(Object.keys(STANDARDER) as Standard[]).map((s) => <option key={s} value={s}>{STANDARDER[s].navn}</option>)}
        </select></label>
      <div className="row">
        <label className="field"><span className="label">Kontraktssum eks. mva</span>
          <input type="text" inputMode="decimal" value={f.kontraktssum} onChange={(e) => sett("kontraktssum", e.target.value)} placeholder="F.eks. 2 450 000" /></label>
        <label className="field"><span className="label">Dagmulkt (promille per dag)</span>
          <input type="text" inputMode="decimal" value={f.dagmulkt} onChange={(e) => sett("dagmulkt", e.target.value)} placeholder="F.eks. 1" /></label>
      </div>
      <div className="row">
        <label className="field"><span className="label">Sluttfrist</span>
          <input type="date" value={f.sluttfrist} onChange={(e) => sett("sluttfrist", e.target.value)} /></label>
        <label className="field"><span className="label">Overtakelse (når den er holdt)</span>
          <input type="date" value={f.overtakelse} onChange={(e) => sett("overtakelse", e.target.value)} /></label>
        <label className="field"><span className="label">Vår varslingsfrist (dager)</span>
          <input type="text" inputMode="numeric" value={f.varsel_dager} onChange={(e) => sett("varsel_dager", e.target.value)} /></label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Standarden sier ofte «uten ugrunnet opphold». Vår varslingsfrist er hvor mange dager vi selv gir oss på å varsle byggherren etter at noe er oppdaget.</p>
      <h3 style={{ margin: "8px 0 0" }}>Byggherrens representant</h3>
      <div className="row">
        <label className="field"><span className="label">Navn og rolle</span>
          <input type="text" value={f.bh_navn} onChange={(e) => sett("bh_navn", e.target.value)} placeholder="F.eks. Eva Lie, byggeleder" /></label>
        <label className="field"><span className="label">E-post</span>
          <input type="email" value={f.bh_epost} onChange={(e) => sett("bh_epost", e.target.value)} /></label>
        <label className="field"><span className="label">Telefon</span>
          <input type="tel" value={f.bh_telefon} onChange={(e) => sett("bh_telefon", e.target.value)} /></label>
      </div>
      <label className="row small" style={{ gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.epost_skriftlig} onChange={(e) => sett("epost_skriftlig", e.target.checked)} />
        <span>Det er avtalt at e-post gjelder som skriftlig varsel</span></label>
      <label className="row small" style={{ gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.bh_skjema} onChange={(e) => sett("bh_skjema", e.target.checked)} />
        <span>Byggherren krever egne skjema for varsler</span></label>
      <label className="field"><span className="label">Sikkerhet</span>
        <input type="text" value={f.sikkerhet} onChange={(e) => sett("sikkerhet", e.target.value)} placeholder="F.eks. Bankgaranti 10 % i byggetiden, 3 % i reklamasjonstiden" /></label>
      <label className="field"><span className="label">Notat</span>
        <textarea rows={2} value={f.notat} onChange={(e) => sett("notat", e.target.value)} placeholder="Byggemøter, hvem som kan gi beskjeder, spesielle avtaler …" /></label>
      {feil && <p className="small feil" style={{ margin: 0 }}>{feil}</p>}
      <div className="row">
        <button className="btn primary">{k ? "Lagre" : "Registrer kontrakten"}</button>
        {k && <button type="button" className="btn" onClick={lukk}>Avbryt</button>}
        {k && leder && !slett && <button type="button" className="btn no" onClick={() => setSlett(true)}>Slett kontrakten</button>}
      </div>
      {k && slett && (
        <div className="row small" style={{ gap: 8, alignItems: "center" }}>
          <span>Kontrakten, fristene, sakene og varslene på prosjektet slettes. Dette kan ikke angres.</span>
          <button type="button" className="btn sm no" onClick={() => kjor(() => api.slettKontrakt(k.id), "Kontrakten er slettet")}>Ja, slett</button>
          <button type="button" className="btn sm" onClick={() => setSlett(false)}>Avbryt</button>
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------ Fristene fra fristmotoren

function Fristliste({ k }: { k: NsKontrakt }) {
  const { d, idag } = useApp();
  const saker = (d.nsSaker ?? []).filter((s) => s.kontrakt_id === k.id);
  const liste = frister(k, saker, d.nsVarsler ?? [], (d.kontraktFrister ?? []).filter((f) => f.kontrakt_id === k.id), idag);
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Frister</h2>
      {liste.length ? (
        <div className="list">
          {liste.map((f, i) => (
            <div key={`${f.sak_id ?? ""}${f.hva}${i}`} className={`item ${f.niva === "over" || f.niva === "idag" ? "avslatt" : f.niva === "snart" ? "venter" : "godkjent"}`}>
              <div style={{ minWidth: 0 }}>
                <div className="t">{f.hva}</div>
                <div className="s">{langDato(f.dato)}{f.preklusiv ? " · kravet kan gå tapt hvis fristen ikke holdes" : ""}{f.hvem === "daglig_leder" ? " · daglig leder er varslet" : ""}</div>
              </div>
              <div className="acts">{NIVA_TEKST[f.niva] && <span className={`chip ${NIVA_CHIP[f.niva]}`}>{NIVA_TEKST[f.niva]}</span>}</div>
            </div>
          ))}
        </div>
      ) : <div className="empty">Ingen åpne frister.</div>}
    </section>
  );
}

// ------------------------------------------------------------ Sakene

function Saker({ k }: { k: NsKontrakt }) {
  const { d } = useApp();
  const planlegger = usePlanlegger();
  const saker = sorterSaker((d.nsSaker ?? []).filter((s) => s.kontrakt_id === k.id));
  const navn = (id: string | null) => (id ? d.ansatte.find((a) => a.id === id)?.navn ?? "" : "");
  const varsler = d.nsVarsler ?? [];
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Saker</h2>
      <p className="small muted" style={{ margin: 0 }}>Hendelser som kan gi krav på tid eller penger: endringer, pålegg, forsinkelser fra byggherren og liknende.</p>
      {saker.length ? (
        <div className="list">
          {saker.map((s) => {
            const pkt = punkt(k.standard, s.type);
            const v = varsler.filter((x) => x.sak_id === s.id);
            return (
              <div key={s.id} className={`item ${SAK_CHIP[s.status] === "demo" ? "godkjent" : SAK_CHIP[s.status]}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">Sak {s.nr}: {s.tittel}</div>
                  <div className="s">{SAKTYPER[s.type].navn}{pkt ? ` (NS ${k.standard} ${pkt})` : ""} · oppdaget {kortDato(lokalDato(s.oppdaget))}{navn(s.meldt_av) ? ` av ${navn(s.meldt_av)}` : ""}</div>
                  {(s.belop != null && planlegger) || s.dager != null ? (
                    <div className="s">{[s.belop != null && planlegger ? `${kr(s.belop)} eks. mva` : "", s.dager != null ? `${s.dager} dager fristforlengelse` : ""].filter(Boolean).join(" · ")}</div>
                  ) : null}
                  {v.length > 0 && <div className="s">{v.length} varsel{v.length === 1 ? "" : "er"} · ansvarlig {navn(s.ansvarlig_id) || "ikke valgt"}</div>}
                </div>
                <div className="acts"><span className={`chip ${SAK_CHIP[s.status]}`}>{SAK_STATUS[s.status]}</span></div>
              </div>
            );
          })}
        </div>
      ) : <div className="empty">Ingen saker på prosjektet ennå.</div>}
    </section>
  );
}

// ------------------------------------------------------------ Frister i kontrakten (delfrister, sluttfrist …)

function Kontraktsfrister({ k }: { k: NsKontrakt }) {
  const { d, kjor } = useApp();
  const liste = (d.kontraktFrister ?? []).filter((f) => f.kontrakt_id === k.id).sort((a, b) => Number(a.ferdig) - Number(b.ferdig) || a.dato.localeCompare(b.dato));
  const tom = { tittel: "", dato: "", type: "delfrist" as FristType, dagmulkt: false };
  const [ny, setNy] = useState(tom);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ny.tittel.trim() || !ny.dato) return;
    if (await kjor(() => api.lagreKontraktFrist({ kontrakt_id: k.id, tittel: ny.tittel.trim(), dato: ny.dato, type: ny.type, dagmulkt: ny.dagmulkt }).then(() => {}), "Fristen er lagt til")) setNy(tom);
  };
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Frister i kontrakten</h2>
      <p className="small muted" style={{ margin: 0 }}>Delfrister, sluttfrist, ettårsbefaring og andre datoer fra kontrakten. Merk dem som ferdige når de er nådd.</p>
      {liste.length > 0 && (
        <div className="list">
          {liste.map((f) => (
            <div key={f.id} className={`item ${f.ferdig ? "godkjent" : "venter"}`}>
              <div style={{ minWidth: 0 }}>
                <div className="t">{f.tittel}</div>
                <div className="s">{FRISTTYPER[f.type]} · {langDato(f.dato)}{f.dagmulkt ? " · dagmulkt" : ""}{f.ferdig ? " · ferdig" : ""}</div>
              </div>
              <div className="acts">
                <button className="btn sm" onClick={() => kjor(() => api.lagreKontraktFrist({ ...f, ferdig: !f.ferdig }).then(() => {}), f.ferdig ? "Åpnet igjen" : "Merket som ferdig")}>{f.ferdig ? "Åpne igjen" : "Ferdig"}</button>
                <button className="btn sm no" onClick={() => kjor(() => api.slettKontraktFrist(f.id), "Slettet")}>Slett</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={lagre} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row">
          <label className="field"><span className="label">Hva gjelder fristen?</span>
            <input type="text" value={ny.tittel} onChange={(e) => setNy({ ...ny, tittel: e.target.value })} placeholder="F.eks. Fasade nord ferdig" /></label>
          <label className="field"><span className="label">Dato</span>
            <input type="date" value={ny.dato} onChange={(e) => setNy({ ...ny, dato: e.target.value })} /></label>
          <label className="field"><span className="label">Type</span>
            <select value={ny.type} onChange={(e) => setNy({ ...ny, type: e.target.value as FristType })}>
              {(Object.keys(FRISTTYPER) as FristType[]).map((t) => <option key={t} value={t}>{FRISTTYPER[t]}</option>)}
            </select></label>
        </div>
        <label className="row small" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={ny.dagmulkt} onChange={(e) => setNy({ ...ny, dagmulkt: e.target.checked })} />
          <span>Fristen er dagmulktbelagt</span></label>
        <div><button className="btn primary sm" disabled={!ny.tittel.trim() || !ny.dato}>Legg til frist</button></div>
      </form>
    </section>
  );
}
