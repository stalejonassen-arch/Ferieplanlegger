import { useEffect, useState } from "react";
import { PROFIL } from "../lib/profil";
import { useApp } from "../App";
import { api } from "../lib/api";
import { sorterAnsatte, type Ansatt } from "../lib/ferie";
import { PLAGG, STANDARD_KVOTER, type Kvoter } from "../lib/utstyr";
import { arkivProsjekter, foreslaKobling, importRader, lesSvenn, lesSvennArkiv, lesXlsx, svennBildetekst, svennProsjekter, type Kobling, type SvennFil, type SvennProsjekt, type SvennRad } from "../lib/svenn";
import type { SvennResultat } from "../lib/api";
import { KampanjeOppsett } from "./Kampanjer";
import { MODULER, bruker, type Modul } from "../lib/moduler";
import { ProsjektVelger } from "./ProsjektVelger";
import { DraktOppsett } from "./Drakt";
import { VarselOversikt } from "./Varsler";

/** Valg for varsel når noen fortsatt er stemplet inn: 7 t 30 min til 11 t, hvert kvarter */
const VARSEL_STEMPLET = Array.from({ length: 15 }, (_, i) => 450 + i * 15);
const timerMin = (m: number) => `${Math.floor(m / 60)} t${m % 60 ? ` ${m % 60} min` : ""}`;

export function Oppsett() {
  const { d, aar, kjor } = useApp();
  const [nyNavn, setNyNavn] = useState("");
  const [nyEpost, setNyEpost] = useState("");
  const [nyAvd, setNyAvd] = useState(d.avdelinger[0]?.id ?? 0);

  const lagre = (a: Ansatt, endring: Partial<Ansatt>) =>
    kjor(() => api.lagreAnsatt({ id: a.id, navn: a.navn, avdeling_id: a.avdeling_id, ...endring }), "Lagret");
  const overfort = (a: Ansatt) => d.ferieaar.find((f) => f.ansatt_id === a.id && f.aar === aar)?.overfort ?? 0;

  const leggTil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nyNavn.trim()) return;
    const ok = await kjor(() => api.lagreAnsatt({ navn: nyNavn.trim(), epost: nyEpost.trim() || null, avdeling_id: nyAvd, rekkefolge: 99 }), `${nyNavn.trim()} er lagt til`);
    if (ok) { setNyNavn(""); setNyEpost(""); }
  };

  const [aapen, setAapen] = useState<string | null>(null);
  const [inn, setInn] = useState<Map<string, Innlogging>>(new Map());
  const lastInn = () => api.ansatteInnlogging().then((r) => setInn(new Map(r.map((x) => [x.ansatt_id, x])))).catch(() => {});
  useEffect(() => { lastInn(); }, [d.ansatte.length]);
  const [visInaktive, setVisInaktive] = useState(false);
  const alle = sorterAnsatte(d);
  const liste = alle.filter((a) => a.aktiv || visInaktive);
  const inaktive = alle.filter((a) => !a.aktiv).length;

  return (
    <>
      <nav className="oppsett-meny" aria-label="Deler av oppsettet">
        {[["opp-ansatte", "Ansatte"], ["opp-logo", "Logo og farger"], ["opp-deler", "Deler av appen"], ["opp-bemanning", "Bemanning"],
          ...(bruker(d, "kampanjer") ? [["opp-kampanjer", "Kampanjer"]] : []), ...(bruker(d, "utstyr") ? [["opp-utstyr", "Utstyr"]] : []), ["opp-svenn", "Import fra Svenn"]]
          .map(([id, t]) => <a key={id} href={`#oppsett`} onClick={(e) => { e.preventDefault(); document.getElementById(id!)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t}</a>)}
      </nav>

      <section className="panel" id="opp-ansatte">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Ansatte</h2>
          {inaktive > 0 && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={visInaktive} onChange={(e) => setVisInaktive(e.target.checked)} /> Vis {inaktive} som har sluttet</label>}
        </div>
        <p className="small muted" style={{ margin: 0 }}>Trykk på en ansatt for å endre innlogging, ferie, arbeidstid, lønn, varsler, utstyr og HMS-kort. Endringer lagres med en gang.</p>
        <VarselOversikt />
        <ul className="ansatt-liste">
          {liste.map((a) => {
            const avd = d.avdelinger.find((g) => g.id === a.avdeling_id)?.navn ?? "";
            const merk = [!a.epost && "mangler e-post", !a.ansattnr && "mangler ansattnr"].filter(Boolean) as string[];
            return (
              <li key={a.id} className={`${a.aktiv ? "" : "inaktiv"}${aapen === a.id ? " aapen" : ""}`}>
                <button type="button" className="ansatt-topp" aria-expanded={aapen === a.id} onClick={() => setAapen(aapen === a.id ? null : a.id)}>
                  <span className="ansatt-navn"><b>{a.navn}</b><span className="small muted">{avd}{a.epost ? ` · ${a.epost}` : ""}</span></span>
                  <span className="ansatt-merker">
                    {a.rolle === "leder" && <span className="chip godkjent">Leder</span>}
                    {a.rolle !== "leder" && a.prosjektleder && <span className="chip venter">Prosjektleder</span>}
                    {!a.aktiv && <span className="chip demo">Sluttet</span>}
                    {merk.length > 0 && a.aktiv && <span className="small" style={{ color: "var(--warn)" }}>{merk.join(", ")}</span>}
                    {a.aktiv && a.epost && inn.size > 0 && !inn.get(a.id)?.innlogget && <span className="chip demo">{inn.get(a.id)?.invitert ? "Invitert" : "Ikke logget inn"}</span>}
                  </span>
                  <span className="ansatt-pil" aria-hidden="true">{aapen === a.id ? "▴" : "▾"}</span>
                </button>
                {aapen === a.id && <AnsattKort a={a} lagre={lagre} overfort={overfort(a)} inn={inn.get(a.id)} oppdaterInn={lastInn} />}
              </li>
            );
          })}
        </ul>
        <form className="row" onSubmit={leggTil} style={{ alignItems: "flex-end" }}>
          <label className="field"><span className="label">Ny ansatt</span>
            <input type="text" id="ny-navn" value={nyNavn} onChange={(e) => setNyNavn(e.target.value)} placeholder="Navn" />
          </label>
          <label className="field"><span className="label">E-post</span>
            <input type="email" id="ny-epost" value={nyEpost} onChange={(e) => setNyEpost(e.target.value)} placeholder={PROFIL.id === "austnes" ? "navn@austnes.no" : "navn@firma.no"} />
          </label>
          <label className="field"><span className="label">Avdeling</span>
            <select id="ny-avd" value={nyAvd} onChange={(e) => setNyAvd(Number(e.target.value))}>
              {d.avdelinger.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
            </select>
          </label>
          <button className="btn" disabled={!nyNavn.trim()}>Legg til</button>
        </form>
      </section>

      <DraktOppsett />

      <ModulOppsett />

      <section className="panel" id="opp-bemanning">
        <h2>Bemanning</h2>
        <p className="small muted">Hvor mange i hver avdeling som kan være borte samme dag før appen varsler.</p>
        <div className="row">
          {d.avdelinger.map((g) => (
            <label key={`${g.id}-${g.maks_borte}`} className="field"><span className="label">{g.navn}</span>
              <input type="number" id={`maks-${g.id}`} min={0} max={50} defaultValue={g.maks_borte}
                onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== g.maks_borte) kjor(() => api.lagreAvdeling({ id: g.id, maks_borte: v }), "Lagret"); }} />
            </label>
          ))}
        </div>
      </section>
      {bruker(d, "kampanjer") && <div id="opp-kampanjer"><KampanjeOppsett /></div>}
      {bruker(d, "utstyr") && <UtstyrOppsett />}
      <details className="panel oppsett-svenn" id="opp-svenn">
        <summary><h2 style={{ display: "inline" }}>Import fra Svenn</h2> <span className="small muted">Timer og dokumentasjon fra Svenn. Trengs bare så lenge dere har Svenn.</span></summary>
        <SvennImport />
        <SvennDokumentasjon />
      </details>
    </>
  );
}

/** Alt om én ansatt på ett sted: innlogging og rolle, ferie, arbeidstid og lønn, varsler, utstyr og HMS-kort */
type Innlogging = { ansatt_id: string; invitert: string | null; innlogget: string | null };
const naarTekst = (iso: string) => {
  const t = new Date(iso), n = new Date();
  const kl = t.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const dag = Math.round((new Date(n.toDateString()).getTime() - new Date(t.toDateString()).getTime()) / 864e5);
  return dag === 0 ? `i dag kl. ${kl}` : dag === 1 ? `i går kl. ${kl}` : t.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: t.getFullYear() === n.getFullYear() ? undefined : "numeric" });
};

/** Send invitasjon til appen på e-post, med status for sist sendt og innlogging */
function Invitasjon({ a, inn, oppdater }: { a: Ansatt; inn?: Innlogging; oppdater: () => void }) {
  const { kjor } = useApp();
  const [jobber, setJobber] = useState(false);
  if (!a.aktiv) return null;
  const send = async () => {
    setJobber(true);
    if (await kjor(() => api.sendInvitasjon(a.id), `Invitasjon sendt til ${a.epost}`)) oppdater();
    setJobber(false);
  };
  return (
    <div className="invitasjon" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "8px 0" }}>
      <button type="button" className="btn sm" disabled={jobber || !a.epost} onClick={send}
        title={a.epost ? "E-post med lenke, innlogging med kode, lagre som app (iPhone og Android) og varsler" : "Legg inn e-post først"}>
        {jobber ? "Sender …" : inn?.invitert ? "✉️ Send invitasjon på nytt" : "✉️ Send invitasjon"}
      </button>
      <span className="small muted">
        {!a.epost ? "Legg inn e-post for å kunne invitere." : [
          inn?.invitert ? `Sist sendt ${naarTekst(inn.invitert)}` : "Ikke invitert fra appen ennå",
          inn?.innlogget ? `Logget inn ${naarTekst(inn.innlogget)} ✓` : "Har ikke logget inn",
        ].join(" · ")}
      </span>
    </div>
  );
}

function AnsattKort({ a, lagre, overfort, inn, oppdaterInn }: { a: Ansatt; lagre: (a: Ansatt, e: Partial<Ansatt>) => Promise<boolean>; overfort: number; inn?: Innlogging; oppdaterInn: () => void }) {
  const { d, aar, kjor, idag } = useApp();
  const kontoer = d.prosjekter.filter((p) => /utstyr|verkt|arbeidskl|arbeidst/i.test(p.navn) || d.ansatte.some((x) => x.utstyr_prosjekt_id === p.id));
  const tekst = (felt: keyof Ansatt, label: string, x: { type?: string; placeholder?: string; inputMode?: "numeric" } = {}) => (
    <label className="field"><span className="label">{label}</span>
      <input type={x.type ?? "text"} inputMode={x.inputMode} placeholder={x.placeholder} defaultValue={(a[felt] as string | null | undefined) ?? ""}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== ((a[felt] as string | null | undefined) ?? "")) lagre(a, { [felt]: v || (felt === "navn" ? a.navn : null) } as Partial<Ansatt>); }} /></label>
  );
  const hake = (felt: keyof Ansatt, label: string, verdi: boolean, hjelp?: string) => (
    <label className="hake"><input type="checkbox" checked={verdi} onChange={(e) => lagre(a, { [felt]: e.target.checked } as Partial<Ansatt>)} />
      <span>{label}{hjelp && <span className="small muted"> – {hjelp}</span>}</span></label>
  );
  const hmsUtlopt = a.hms_kort_gyldig && a.hms_kort_gyldig < idag;
  return (
    <div className="ansatt-kort">
      <fieldset><legend>Innlogging og rolle</legend>
        <div className="row">
          {tekst("navn", "Navn")}
          {tekst("epost", "E-post (brukes til innlogging)", { type: "email", placeholder: "Mangler – kan ikke logge inn" })}
        </div>
        <div className="row">
          <label className="field"><span className="label">Avdeling</span>
            <select value={a.avdeling_id} onChange={(e) => lagre(a, { avdeling_id: Number(e.target.value) })}>
              {d.avdelinger.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
            </select></label>
          <label className="field"><span className="label">Rolle</span>
            <select value={a.rolle} onChange={(e) => lagre(a, { rolle: e.target.value as Ansatt["rolle"] })}>
              <option value="ansatt">Ansatt</option><option value="leder">Leder</option>
            </select></label>
        </div>
        {a.rolle !== "leder" && hake("prosjektleder", "Prosjektleder", !!a.prosjektleder, "kan dele ut arbeid og styre materiell og bestillinger, men ser ikke lønn og oppsett")}
        {hake("aktiv", "Aktiv", a.aktiv, "ta bort haken når noen slutter. Historikken beholdes")}
        <Invitasjon a={a} inn={inn} oppdater={oppdaterInn} />
      </fieldset>
      <fieldset><legend>Ferie</legend>
        <div className="row">
          <label className="field kort"><span className="label">Feriedager per år</span>
            <select value={a.dager} onChange={(e) => lagre(a, { dager: Number(e.target.value) })}>
              <option value={21}>21 (lovens minimum)</option><option value={25}>25 (5 uker)</option>
            </select></label>
          <label className="field kort"><span className="label">Overført fra {aar - 1}</span>
            <input type="number" min={0} max={60} defaultValue={overfort}
              onBlur={(e) => { const v = Math.max(0, Math.min(60, Number(e.target.value) || 0)); if (v !== overfort) kjor(() => api.lagreOverfort(a.id, aar, v), "Lagret"); }} /></label>
        </div>
        {hake("over60", "Over 60 år", a.over60, "gir ekstra feriepenger")}
      </fieldset>
      <fieldset><legend>Arbeidstid og lønn</legend>
        <div className="row">
          {tekst("ansattnr", "Ansattnr (som i Svenn/lønn)", { inputMode: "numeric" })}
          <label className="field kort"><span className="label">Normaltid per uke</span>
            <select value={String(a.normaltid_uke ?? 37.5)} onChange={(e) => lagre(a, { normaltid_uke: Number(e.target.value) })}>
              <option value="37.5">37,5 timer</option><option value="40">40 timer</option></select></label>
          <label className="field kort"><span className="label">Lunsj (minutter)</span>
            <input type="number" min={0} max={120} step={5} defaultValue={a.lunsj_min ?? 30}
              onBlur={(e) => { const v = Math.max(0, Math.min(120, Number(e.target.value) || 0)); if (v !== (a.lunsj_min ?? 30)) lagre(a, { lunsj_min: v }); }} /></label>
        </div>
        {hake("lunsjtrekk", "Lunsjtrekk", !!a.lunsjtrekk, "lunsj trekkes på dager over 5,5 timer uten registrert lunsj")}
        {hake("i_timerapport", "Med i timerapporten", a.i_timerapport !== false, "telles i oversikten over kundetimer og interntid")}
      </fieldset>
      <fieldset><legend>Varsler</legend>
        {hake("varsel_prosjekt", "Varsel om nye prosjekter", a.varsel_prosjekt !== false)}
        <label className="field kort"><span className="label">Varsel hvis fortsatt stemplet inn</span>
          <select value={a.varsel_stemplet_min === null ? "av" : String(a.varsel_stemplet_min ?? 495)}
            onChange={(e) => lagre(a, { varsel_stemplet_min: e.target.value === "av" ? null : Number(e.target.value) })}>
            <option value="av">Av</option>
            {VARSEL_STEMPLET.map((m) => <option key={m} value={m}>Etter {timerMin(m)}</option>)}
          </select></label>
      </fieldset>
      {(bruker(d, "utstyr") || bruker(d, "sja")) && (
        <fieldset><legend>Utstyr og HMS-kort</legend>
          <div className="row">
            {bruker(d, "utstyr") && (
              <label className="field"><span className="label">Utstyrskonto i Visma</span>
                <select value={a.utstyr_prosjekt_id ?? ""} onChange={(e) => lagre(a, { utstyr_prosjekt_id: e.target.value || null })}>
                  <option value="">Ingen</option>
                  {kontoer.map((p) => <option key={p.id} value={p.id} disabled={d.ansatte.some((x) => x.id !== a.id && x.utstyr_prosjekt_id === p.id)}>{p.visma_nr ? `${p.visma_nr} ` : ""}{p.navn}</option>)}
                </select></label>
            )}
            {tekst("hms_kort_nr", "HMS-kort (nummer)")}
            <label className="field kort"><span className="label">HMS-kort gyldig til</span>
              <input type="date" defaultValue={a.hms_kort_gyldig ?? ""} onBlur={(e) => { const v = e.target.value || null; if (v !== (a.hms_kort_gyldig ?? null)) lagre(a, { hms_kort_gyldig: v }); }} /></label>
          </div>
          {hmsUtlopt && <span className="small" style={{ color: "var(--warn)" }}>HMS-kortet har gått ut.</span>}
        </fieldset>
      )}
    </div>
  );
}

/** Hvilke deler av appen bedriften bruker. Det som slås av, forsvinner fra menyene for alle, men ingenting slettes. */
function ModulOppsett() {
  const { d, kjor } = useApp();
  const av = new Set(d.modulerAv ?? []);
  const sett = (m: Modul, paa: boolean) => {
    const ny = new Set(av);
    if (paa) ny.delete(m); else ny.add(m);
    const navn = MODULER.find((x) => x.id === m)?.navn ?? m;
    kjor(() => api.lagreModuler([...ny]), paa ? `${navn} er slått på` : `${navn} er slått av`);
  };
  return (
    <section className="panel" id="opp-deler">
      <h2>Deler av appen</h2>
      <p className="small muted">Slå av det dere ikke bruker, så blir appen enklere for de ansatte. Det som slås av, forsvinner fra menyene for alle, men ingenting slettes – slår du det på igjen, ligger alt der som før. Timer, prosjekter, ferie og fravær, lønn og oppsett er alltid med.</p>
      <ul className="modul-liste">
        {MODULER.map((m) => (
          <li key={m.id}>
            <label className="modul-valg">
              <input type="checkbox" role="switch" checked={!av.has(m.id)} onChange={(e) => sett(m.id, e.target.checked)} aria-label={m.navn} />
              <span><b>{m.navn}</b><span className="small muted">{m.hva}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {bruker(d, "reklamasjon") && <ReklamasjonsprosjektValg />}
      {bruker(d, "service") && <ServiceOppsett />}
    </section>
  );
}

/** Hvordan bedriften håndterer reklamasjon: hvor timene føres, hvem som får ansvaret og standard frist */
/** Serviceoppdrag: fast serviceprosjekt i Visma og lenke til kundeskjemaet */
function ServiceOppsett() {
  const { d, kjor } = useApp();
  const [nokkel, setNokkel] = useState<string | null>(null);
  useEffect(() => { api.serviceSkjemaNokkel().then(setNokkel).catch(() => {}); }, []);
  const lenke = nokkel ? `${location.origin}${location.pathname}?service=${nokkel}` : "";
  return (
    <div className="oppsett-under" style={{ marginTop: 12 }} id="opp-service">
      <h3 style={{ margin: "0 0 4px" }}>Serviceoppdrag</h3>
      <p className="small muted" style={{ margin: "0 0 8px" }}>Timer på serviceoppdrag føres på ett fast prosjekt i Visma (f.eks. «Service»), og hvert oppdrag faktureres på en egen ordre til kunden. Timene er fakturerbare.</p>
      <ProsjektVelger label="Serviceprosjekt i Visma" tom="Ikke valgt" value={d.serviceProsjekt ?? ""} onChange={(id) => kjor(() => api.lagreServiceprosjekt(id || null), "Serviceprosjektet er lagret")}
        prosjekter={d.prosjekter.filter((p) => p.aktiv && p.id !== d.reklamasjonProsjekt)} />
      {lenke && (
        <div className="small" style={{ marginTop: 10, display: "grid", gap: 6 }}>
          <b>Skjema for kundene</b>
          <span className="muted">Legg lenken på hjemmesiden eller Facebook. Kunden fyller inn navn, telefon og hva som skal gjøres, og oppdraget dukker opp her som «Ny» med varsel til leder og prosjektleder.</span>
          <div className="row" style={{ gap: 8 }}>
            <input readOnly value={lenke} onFocus={(e) => e.target.select()} style={{ flex: "1 1 260px" }} />
            <button type="button" className="btn sm" onClick={() => navigator.clipboard?.writeText(lenke).then(() => kjor(async () => {}, "Lenken er kopiert"))}>Kopier</button>
            <a className="btn sm" href={lenke} target="_blank" rel="noreferrer">Åpne</a>
            <button type="button" className="btn sm" onClick={() => { if (confirm("Lage ny lenke? Den gamle slutter å virke.")) api.serviceSkjemaNokkel(true).then(setNokkel); }}>Ny lenke</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReklamasjonsprosjektValg() {
  const { d, kjor } = useApp();
  const fra = () => d.reklOppsett ?? { timer: d.reklamasjonProsjekt ? "prosjekt" as const : "jobben" as const, ansvar: "snekker" as const, fristDager: 14, prosjekt: d.reklamasjonProsjekt ?? null };
  const [o, setO] = useState(fra);
  useEffect(() => { setO(fra()); }, [d.reklOppsett?.timer, d.reklOppsett?.ansvar, d.reklOppsett?.fristDager, d.reklOppsett?.prosjekt]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = fra();
  const endret = o.timer !== n.timer || o.ansvar !== n.ansvar || o.fristDager !== n.fristDager || (o.timer === "prosjekt" && o.prosjekt !== n.prosjekt);
  const valg = <T extends string>(navn: string, verdi: T, tekst: string, hint: string, sett: (v: T) => void, aktiv: T) => (
    <label className="rekl-valg"><input type="radio" name={navn} checked={aktiv === verdi} onChange={() => sett(verdi)} /><span><b>{tekst}</b><span className="small muted">{hint}</span></span></label>
  );
  return (
    <div className="oppsett-under" style={{ marginTop: 12 }} id="opp-reklamasjon">
      <h3 style={{ margin: "0 0 4px" }}>Reklamasjon</h3>
      <p className="small muted" style={{ marginTop: 0 }}>Uansett valg merkes timene med hvilken reklamasjon de gjelder, og de blir aldri fakturert.</p>
      <fieldset className="rekl-gruppe"><legend className="label">Hvor føres timene på reklamasjon?</legend>
        {valg("rekl-timer", "prosjekt", "Fast reklamasjonsprosjekt i regnskapet", "Samler kostnaden for alle reklamasjoner på ett internt prosjekt.", (v) => setO({ ...o, timer: v }), o.timer)}
        {o.timer === "prosjekt" && (
          <div style={{ marginLeft: 28 }}>
            <ProsjektVelger label="Reklamasjonsprosjekt" placeholder="Velg prosjekt" value={o.prosjekt ?? ""} tom="Ikke valgt"
              prosjekter={d.prosjekter.filter((p) => p.aktiv || p.id === o.prosjekt)} onChange={(id) => setO({ ...o, prosjekt: id || null })} />
          </div>
        )}
        {valg("rekl-timer", "jobben", "På originaljobben", "Viser hva hver jobb faktisk kostet, med etterarbeid.", (v) => setO({ ...o, timer: v }), o.timer)}
        {valg("rekl-timer", "intern", "Som interntid", "Uten prosjekt. For dem som ikke følger opp reklamasjon i regnskapet.", (v) => setO({ ...o, timer: v }), o.timer)}
      </fieldset>
      <fieldset className="rekl-gruppe"><legend className="label">Hvem får ansvaret når en reklamasjon registreres?</legend>
        {valg("rekl-ansvar", "snekker", "Snekkeren på originaljobben", "", (v) => setO({ ...o, ansvar: v }), o.ansvar)}
        {valg("rekl-ansvar", "selger", "Selger/prosjektleder på jobben", "Snekkeren hvis jobben ikke har selger.", (v) => setO({ ...o, ansvar: v }), o.ansvar)}
        {valg("rekl-ansvar", "ingen", "Leder velger hver gang", "", (v) => setO({ ...o, ansvar: v }), o.ansvar)}
      </fieldset>
      <label className="field kort"><span className="label">Standard svarfrist (dager etter at kunden meldte fra)</span>
        <input type="number" min={0} max={365} value={o.fristDager} onChange={(e) => setO({ ...o, fristDager: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} /></label>
      <p className="small muted" style={{ margin: "4px 0 8px" }}>{o.fristDager ? `Den ansvarlige og leder får varsel to dager før fristen og dagen etter hvis den er passert.` : "0 = ingen frist settes automatisk."}</p>
      <div className="row">
        <button className="btn primary" disabled={!endret || (o.timer === "prosjekt" && !o.prosjekt)} onClick={() => kjor(() => api.lagreReklamasjonOppsett(o), "Oppsettet for reklamasjon er lagret")}>Lagre</button>
        {endret && <button className="btn" onClick={() => setO(fra())}>Angre</button>}
      </div>
    </div>
  );
}

/** Utstyrskonto per ansatt (prosjektet i Visma der verktøy og arbeidstøy føres) og grenser per år */
function UtstyrOppsett() {
  const { d, kjor } = useApp();
  const [kv, setKv] = useState<Kvoter>(() => structuredClone(d.utstyrGrenser?.kvoter ?? STANDARD_KVOTER));
  const sett = (type: string, felt: "antall" | "aar", v: number) => setKv((x) => ({ ...x, [type]: { ...(x[type] ?? { antall: 0, aar: 1 }), [felt]: v } }));
  return (
    <section className="panel" id="opp-utstyr">
      <h2>Utstyr: kvoter for arbeidstøy</h2>
      <p className="small muted">Hver ansatt har en utstyrskonto i Visma. Det som føres der, hentes inn i ByggLogg med dato og pris og sorteres som verktøy, arbeidstøy, verneutstyr eller forbruk. Kvotene gjelder per ansatt i en rullerende periode. Øvrig verneutstyr (hansker, briller, hørselvern) gis etter behov og har ingen kvote. Håndverktøy byttes nytt mot gammelt.</p>
      <form onSubmit={(e) => { e.preventDefault(); kjor(() => api.settUtstyrKvoter(kv), "Kvotene er lagret"); }}>
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Plagg</th><th>Antall</th><th>Per</th></tr></thead>
            <tbody>
              {PLAGG.map((p) => (
                <tr key={p.type}>
                  <td>{p.navn}</td>
                  <td><input type="number" min={0} max={100} style={{ width: 80 }} aria-label={`Antall ${p.navn}`} value={kv[p.type]?.antall ?? 0} onChange={(e) => sett(p.type, "antall", Math.max(0, Number(e.target.value) || 0))} /></td>
                  <td><select aria-label={`Periode ${p.navn}`} value={kv[p.type]?.aar ?? 1} onChange={(e) => sett(p.type, "aar", Number(e.target.value))}>
                    <option value={1}>år</option><option value={2}>annethvert år</option><option value={3}>tredje år</option></select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row"><button className="btn">Lagre kvoter</button><span className="small muted">0 = ingen kvote for det plagget.</span></div>
      </form>
      <p className="small muted" style={{ margin: 0 }}>Utstyrskontoen velges på hver ansatt under «Ansatte». Mangler en konto i lista? Opprett prosjektet i Visma med «utstyr» eller «arbeidsklær» i navnet, så dukker det opp her innen et kvarter.</p>
    </section>
  );
}

const t1 = (n: number) => n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });

/** Import av timer fra Svenn: last opp timelista (Excel), koble prosjektene, importer */
function SvennImport() {
  const { d, kjor } = useApp();
  const [fil, setFil] = useState<{ navn: string; rader: SvennRad[]; tomme: number } | null>(null);
  const [kob, setKob] = useState<Record<string, Kobling>>({});
  const [feil, setFeil] = useState("");
  const [svar, setSvar] = useState<SvennResultat | null>(null);
  const [jobber, setJobber] = useState(false);
  const prosjekter = [...d.prosjekter].sort((a, b) => (b.visma_nr ?? 0) - (a.visma_nr ?? 0) || a.navn.localeCompare(b.navn));
  const sp: SvennProsjekt[] = fil ? svennProsjekter(fil.rader) : [];

  /** Nye ansatte uten ansattnr: sett nummeret fra Svenn når navnet stemmer med nøyaktig én i ByggLogg */
  const kobleAnsattnr = async (rader: SvennRad[]) => {
    const ord = (s: string) => new Set(s.toLowerCase().normalize("NFC").split(/[^\p{L}]+/u).filter(Boolean));
    const ledige = d.ansatte.filter((a) => a.aktiv !== false && !a.ansattnr);
    for (const [nr, navn] of new Map(rader.map((r) => [r.ansattnr, r.ansatt]))) {
      if (!nr || d.ansatte.some((a) => a.ansattnr === nr)) continue;
      const s = ord(navn ?? "");
      const treff = ledige.filter((a) => { const w = ord(a.navn); return w.size > 0 && [...w].every((x) => s.has(x)); });
      if (treff.length !== 1) continue;
      await api.lagreAnsatt({ id: treff[0].id, navn: treff[0].navn, avdeling_id: treff[0].avdeling_id, ansattnr: nr });
      ledige.splice(ledige.indexOf(treff[0]), 1);
    }
  };

  const velgFil = async (f: File | undefined) => {
    setFeil(""); setSvar(null); setFil(null);
    if (!f) return;
    try {
      const les = lesSvenn(await lesXlsx(await f.arrayBuffer()));
      if (!les.rader.length) throw new Error("Fant ingen timer i fila.");
      await kobleAnsattnr(les.rader);
      const lagret = new Map((await api.svennKoblinger()).map((k) => [k.nokkel, k]));
      setKob(Object.fromEntries(svennProsjekter(les.rader).map((p) => [p.nokkel, foreslaKobling(p, d.prosjekter, lagret, PROFIL.firma)])));
      setFil({ navn: f.name, ...les });
    } catch (e) { setFeil(e instanceof Error ? e.message : String(e)); }
  };
  const sett = (n: string, e: Partial<Kobling>) => setKob((k) => ({ ...k, [n]: { ...k[n], ...e } }));
  const valg = (k: Kobling) => (k.prosjekt_id ? k.prosjekt_id : k.ny_navn != null ? "ny" : "intern");

  const ansatte = fil ? [...new Map(fil.rader.map((r) => [r.ansattnr, r.ansatt])).entries()].map(([nr, navn]) => ({
    nr, navn, timer: fil.rader.filter((r) => r.ansattnr === nr).reduce((n, r) => n + r.arbeid / 60, 0), her: d.ansatte.find((a) => a.ansattnr === nr) })) : [];
  const totalt = fil ? fil.rader.reduce((n, r) => n + r.arbeid / 60, 0) : 0;
  const periode = fil ? [fil.rader.reduce((m, r) => (r.dato < m ? r.dato : m), "9999"), fil.rader.reduce((m, r) => (r.dato > m ? r.dato : m), "")] : ["", ""];
  const dato = (s: string) => s.split("-").reverse().join(".");

  const importer = async () => {
    if (!fil) return;
    if (!window.confirm(`Importere ${fil.rader.length} føringer (${t1(totalt)} timer) fra Svenn for ${dato(periode[0])}–${dato(periode[1])}?\n\nTidligere Svenn-import i samme periode erstattes.`)) return;
    setJobber(true);
    let res: SvennResultat | null = null;
    await kjor(async () => { res = await api.importerSvenn(Object.values(kob), importRader(fil.rader)); }, "Timene fra Svenn er importert");
    setJobber(false);
    if (res) { setSvar(res); setFil(null); }
  };

  return (
    <div className="oppsett-under">
      <h3>Timer fra Svenn</h3>
      <p className="small muted">Hent inn timer fra Svenn som statistikk på prosjektene. I Svenn: <b>Rapporter → Timeliste</b>, velg periode og eksporter til <b>Excel</b>. Last opp fila her, sjekk at hvert Svenn-prosjekt peker på riktig prosjekt, og importer. Timene legges inn som godkjent og merket «Fra Svenn». Valgene huskes til neste gang, og en ny import av samme periode erstatter den forrige.</p>
      <label className="btn">Velg Excel-fil fra Svenn
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { velgFil(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {feil && <p className="small" style={{ color: "var(--no, #b42318)" }}>{feil}</p>}
      {svar && (
        <p className="small"><b>Ferdig:</b> {svar.importert} føringer, {t1(svar.timer)} timer ({t1(svar.fakturerbart)} fakturerbare, {t1(svar.internt)} internt) for {dato(svar.fra)}–{dato(svar.til)}.
          {svar.nye_prosjekter > 0 && ` ${svar.nye_prosjekter} nye prosjekter er opprettet (avsluttet, merket «fra Svenn»).`}
          {svar.ukjente_ansattnr.length > 0 && ` Hoppet over ansattnr uten treff i ByggLogg: ${svar.ukjente_ansattnr.join(", ")}.`}</p>
      )}
      {fil && (
        <>
          <p className="small"><b>{fil.navn}</b>: {fil.rader.length} føringer, {t1(totalt)} timer, {dato(periode[0])}–{dato(periode[1])}.{fil.tomme > 0 && ` ${fil.tomme} føringer med 0 timer hoppes over.`}</p>
          <div className="scroll" style={{ border: 0 }}>
            <table className="tbl">
              <thead><tr><th>Ansatt i Svenn</th><th>Nr</th><th>Timer</th><th>I ByggLogg</th></tr></thead>
              <tbody>{ansatte.map((a) => (
                <tr key={a.nr}><td>{a.navn}</td><td>{a.nr}</td><td>{t1(a.timer)}</td><td>{a.her ? a.her.navn : <span style={{ color: "var(--no, #b42318)" }}>Ingen med ansattnr {a.nr} – hoppes over</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="scroll" style={{ border: 0 }}>
            <table className="tbl">
              <thead><tr><th>Prosjekt i Svenn</th><th>Timer</th><th>Blir i ByggLogg</th><th>Fakturerbart</th></tr></thead>
              <tbody>{sp.map((p) => {
                const k = kob[p.nokkel];
                return (
                  <tr key={p.nokkel}>
                    <td>{p.navn || <i>Uten prosjekt</i>}{p.nr && <span className="muted"> #{p.nr}</span>}{p.kunde && <div className="small muted">{p.kunde}</div>}</td>
                    <td>{t1(p.timer)}</td>
                    <td>
                      <select aria-label={`Kobling ${p.navn || p.kunde}`} value={valg(k)} onChange={(e) => {
                        const v = e.target.value;
                        if (v === "intern") sett(p.nokkel, { prosjekt_id: null, ny_navn: null, fakturerbar: false });
                        else if (v === "ny") sett(p.nokkel, { prosjekt_id: null, ny_navn: p.navn || `${p.kunde} (uten prosjekt)` });
                        else sett(p.nokkel, { prosjekt_id: v, ny_navn: null });
                      }}>
                        <option value="intern">Internt (uten prosjekt)</option>
                        <option value="ny">Nytt prosjekt …</option>
                        {prosjekter.map((x) => <option key={x.id} value={x.id}>{x.visma_nr ? `${x.visma_nr} ` : ""}{x.navn}</option>)}
                      </select>
                      {valg(k) === "ny" && <input aria-label={`Navn nytt prosjekt ${p.navn}`} style={{ display: "block", marginTop: 4 }} value={k.ny_navn ?? ""} onChange={(e) => sett(p.nokkel, { ny_navn: e.target.value })} />}
                    </td>
                    <td><input type="checkbox" aria-label={`Fakturerbart ${p.navn}`} disabled={valg(k) === "intern"} checked={valg(k) !== "intern" && k.fakturerbar} onChange={(e) => sett(p.nokkel, { fakturerbar: e.target.checked })} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn primary" disabled={jobber} onClick={importer}>{jobber ? "Importerer …" : `Importer ${t1(totalt)} timer`}</button>
            <button className="btn" onClick={() => setFil(null)}>Avbryt</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Import av bilder og PDF-er fra Svenn (arkiv laget fra prosjektfilene i Svenn) */
function SvennDokumentasjon() {
  const { d, kjor } = useApp();
  const [arkiv, setArkiv] = useState<{ navn: string; filer: SvennFil[]; nye: SvennFil[]; les: (n: string) => Promise<Uint8Array | null> } | null>(null);
  const [valg, setValg] = useState<Record<string, string>>({});
  const [nyNavn, setNyNavn] = useState<Record<string, string>>({});
  const [feil, setFeil] = useState("");
  const [status, setStatus] = useState("");
  const [jobber, setJobber] = useState(false);
  const prosjekter = [...d.prosjekter].sort((a, b) => (b.visma_nr ?? 0) - (a.visma_nr ?? 0) || a.navn.localeCompare(b.navn));
  const grupper = arkiv ? arkivProsjekter(arkiv.nye) : [];

  const velgFil = async (f: File | undefined) => {
    setFeil(""); setStatus(""); setArkiv(null);
    if (!f) return;
    try {
      const { manifest, les } = await lesSvennArkiv(await f.arrayBuffer());
      const ferdig = await api.svennImporterteFiler();
      const nye = manifest.filer.filter((x) => !ferdig.has(Number(x.svenn_id)));
      const lagret = new Map((await api.svennKoblinger()).map((k) => [k.nokkel, k]));
      const v: Record<string, string> = {}, n: Record<string, string> = {};
      for (const p of arkivProsjekter(nye)) {
        const k = foreslaKobling(p, d.prosjekter, lagret, PROFIL.firma);
        v[p.nokkel] = k.prosjekt_id ?? (k.ny_navn != null ? "ny" : "hopp");
        n[p.nokkel] = k.ny_navn ?? p.navn;
      }
      setValg(v); setNyNavn(n);
      setArkiv({ navn: f.name, filer: manifest.filer, nye, les });
    } catch (e) { setFeil(e instanceof Error ? e.message : String(e)); }
  };

  const importer = async () => {
    if (!arkiv) return;
    const med = arkiv.nye.filter((f) => valg[f.nokkel] && valg[f.nokkel] !== "hopp");
    if (!med.length) return;
    if (!window.confirm(`Legge inn ${med.length} filer fra Svenn på prosjektene?`)) return;
    setJobber(true);
    let ok = 0;
    const feilet: string[] = [];
    await kjor(async () => {
      const koblinger = Object.entries(valg).filter(([, v]) => v !== "hopp")
        .map(([nokkel, v]) => ({ nokkel, prosjekt_id: v === "ny" ? null : v, ny_navn: v === "ny" ? (nyNavn[nokkel] || "").trim() || null : null }));
      const pid = await api.svennProsjekter(koblinger);
      for (const f of med) {
        const prosjekt = pid[f.nokkel];
        if (!prosjekt) continue;
        setStatus(`Laster opp ${ok + feilet.length + 1} av ${med.length} …`);
        try {
          const data = await arkiv.les(f.fil);
          if (!data) throw new Error("mangler i arkivet");
          const type = f.fil.endsWith(".pdf") ? "application/pdf" : f.fil.endsWith(".png") ? "image/png" : "image/jpeg";
          const navn = f.type === "dokument" ? f.navn : f.navn.replace(/\.\w+$/, "") + (type === "image/png" ? ".png" : ".jpg");
          const fil = new File([data as BlobPart], navn, { type });
          const opprettet = f.dato ? `${f.dato.replace(" ", "T")}Z` : undefined;
          if (f.type === "bilde") await api.lastOppBilde(fil, { prosjekt_id: prosjekt, tekst: svennBildetekst(f), svenn_id: Number(f.svenn_id), opprettet });
          else await api.lastOppFdv(prosjekt, fil, { svenn_id: Number(f.svenn_id), opprettet: opprettet ?? new Date().toISOString() });
          ok++;
        } catch (e) { feilet.push(`${f.navn}: ${e instanceof Error ? e.message : "feil"}`); }
      }
    }, undefined);
    setJobber(false);
    setStatus(`Ferdig: ${ok} filer lagt inn.${feilet.length ? ` ${feilet.length} feilet: ${feilet.slice(0, 5).join("; ")}${feilet.length > 5 ? " …" : ""}` : ""}`);
    if (ok) setArkiv(null);
  };

  return (
    <div className="oppsett-under">
      <h3>Dokumentasjon fra Svenn</h3>
      <p className="small muted">Bilder og PDF-er fra prosjektene i Svenn. Last opp arkivet <b>svenn-dokumentasjon.zip</b>, sjekk prosjektene, og importer. Bildene havner under Bilder på prosjektet med mappe og dato fra Svenn, PDF-ene under FDV/dokumenter. Filer som allerede er importert hoppes over, så arkivet kan lastes opp på nytt.</p>
      <label className="btn">Velg arkiv fra Svenn (zip)
        <input type="file" accept=".zip,application/zip" hidden onChange={(e) => { velgFil(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {feil && <p className="small" style={{ color: "var(--no, #b42318)" }}>{feil}</p>}
      {status && <p className="small">{status}</p>}
      {arkiv && (
        <>
          <p className="small"><b>{arkiv.navn}</b>: {arkiv.filer.length} filer, {arkiv.nye.length} nye{arkiv.filer.length > arkiv.nye.length ? ` (${arkiv.filer.length - arkiv.nye.length} er importert fra før)` : ""}.</p>
          {grupper.length > 0 && (
            <div className="scroll" style={{ border: 0 }}>
              <table className="tbl">
                <thead><tr><th>Prosjekt i Svenn</th><th>Bilder</th><th>PDF</th><th>Legges på</th></tr></thead>
                <tbody>{grupper.map((p) => (
                  <tr key={p.nokkel}>
                    <td>{p.navn}{p.nr && <span className="muted"> #{p.nr}</span>}</td>
                    <td>{p.bilder}</td><td>{p.dokumenter}</td>
                    <td>
                      <select aria-label={`Prosjekt for ${p.navn}`} value={valg[p.nokkel]} onChange={(e) => setValg((v) => ({ ...v, [p.nokkel]: e.target.value }))}>
                        <option value="hopp">Hopp over</option>
                        <option value="ny">Nytt prosjekt …</option>
                        {prosjekter.map((x) => <option key={x.id} value={x.id}>{x.visma_nr ? `${x.visma_nr} ` : ""}{x.navn}</option>)}
                      </select>
                      {valg[p.nokkel] === "ny" && <input aria-label={`Navn nytt prosjekt ${p.navn}`} style={{ display: "block", marginTop: 4 }} value={nyNavn[p.nokkel] ?? ""} onChange={(e) => setNyNavn((n) => ({ ...n, [p.nokkel]: e.target.value }))} />}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="row">
            <button className="btn primary" disabled={jobber || !arkiv.nye.length} onClick={importer}>{jobber ? "Importerer …" : `Importer ${arkiv.nye.filter((f) => valg[f.nokkel] && valg[f.nokkel] !== "hopp").length} filer`}</button>
            <button className="btn" disabled={jobber} onClick={() => setArkiv(null)}>Avbryt</button>
          </div>
        </>
      )}
    </div>
  );
}
