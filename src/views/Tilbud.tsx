// Tilbudsoppfølging: åpne tilbud fra Visma som bør følges opp med en telefon.
// Et tilbud kommer på lista når det har ligget en uke uten kontakt, eller når datoen for neste kontakt er nådd.
// Når kunden takker ja og tilbudet blir ordre i Visma, merkes det «vunnet» av seg selv ved neste synkronisering.
import { useCallback, useEffect, useMemo, useState } from "react";
import { oversett } from "../lib/sprak";
import { useApp } from "../App";
import { api } from "../lib/api";
import { kortDato } from "../lib/ferie";
import { telLenke } from "../lib/kart";
import {
  GAMMELT, MIN_BELOP, aapent, alder, folgOppNaa, oppfolgingsdato, plussDager, sorterTilbud, treff,
  type NyttTilbud, type Tilbud as T, type TilbudHandling,
} from "../lib/tilbud";
import { sorterAnsatte } from "../lib/ferie";
import { usePlanlegger } from "./Plan";

type Filter = "naa" | "aapne" | "avgjort";
const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
const krKort = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} mill. kr` : kr(n));
const HVA: Record<TilbudHandling, string> = { vunnet: "Takket ja", ringt: "Ringt", utsett: "Utsatt", tapt: "Takket nei", ikke_aktuelt: "Ikke aktuelt", gjenapne: "Åpnet igjen", notat: "Notat" };

/** Hentes én gang per økt og deles mellom startsiden og lista */
let buffer: T[] | null = null;
export function useTilbud() {
  const { d } = useApp();
  const [liste, setListe] = useState<T[] | null>(buffer);
  const last = useCallback(() => api.tilbud().then((x) => { buffer = x; setListe(x); }).catch(() => setListe([])), []);
  useEffect(() => { last(); }, [last, d.prosjekter.length]);
  return { liste, last };
}

/** Kort på startsiden: tilbud du skal ringe i dag. Leder uten egne tilbud ser alle. */
export function MineTilbud() {
  const { meg, idag } = useApp();
  const planlegger = usePlanlegger();
  const { liste } = useTilbud();
  const naa = (liste ?? []).filter((t) => folgOppNaa(t, idag) && t.belop >= MIN_BELOP);
  const egne = naa.filter((t) => t.selger_navn.toLowerCase() === meg.navn.toLowerCase());
  const vis = egne.length || !planlegger ? egne : naa;
  if (!vis.length) return null;
  const sum = vis.reduce((s, t) => s + t.belop, 0);
  return (
    <section className="panel" style={{ borderLeft: "4px solid var(--accent)" }}>
      <a className="item" href="#prosjekter" onClick={() => setTimeout(() => document.getElementById("tilbud")?.scrollIntoView({ behavior: "smooth" }), 300)} style={{ textDecoration: "none" }}>
        <div><div className="t">{`📞 ${vis.length} tilbud å følge opp${egne.length ? "" : " (alle selgere)"}`}</div>
          <div className="s" data-ikke-oversett>{krKort(sum)} · {vis.slice(0, 3).map((t) => t.kunde).join(", ")}{vis.length > 3 ? " …" : ""}</div></div>
      </a>
    </section>
  );
}

export function Tilbudsoppfolging() {
  const { meg, idag } = useApp();
  const planlegger = usePlanlegger();
  const { liste, last } = useTilbud();
  const [filter, setFilter] = useState<Filter>("naa");
  const [selger, setSelger] = useState<string>("");
  const [sma, setSma] = useState(false);
  const [apen, setApen] = useState<string | null>(null);
  const [skjema, setSkjema] = useState<T | "ny" | null>(null);

  const selgere = useMemo(() => [...new Set((liste ?? []).map((t) => t.selger_navn).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb")), [liste]);
  // Standard: egne tilbud hvis du selger selv, ellers alle
  useEffect(() => { if (!selger && selgere.some((s) => s.toLowerCase() === meg.navn.toLowerCase())) setSelger(selgere.find((s) => s.toLowerCase() === meg.navn.toLowerCase())!); }, [selgere]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!liste) return null;
  const fraVisma = liste.some((t) => !t.manuell);

  const mine = liste.filter((t) => (!selger || t.selger_navn === selger) && (sma || t.belop >= MIN_BELOP));
  const naa = mine.filter((t) => folgOppNaa(t, idag)).sort(sorterTilbud);
  const aapne = mine.filter(aapent).sort(sorterTilbud);
  const avgjort = mine.filter((t) => !aapent(t)).sort((a, b) => (b.status_dato ?? "").localeCompare(a.status_dato ?? ""));
  const vis = filter === "naa" ? naa : filter === "aapne" ? aapne : avgjort;
  const aar = idag.slice(0, 4);
  const iAar = treff(mine, `${aar}-01-01`, idag);
  const aapenSum = aapne.reduce((s, t) => s + t.belop, 0);

  return (
    <section className="panel tilbud" id="tilbud">
      <div className="cal-head">
        <h2 style={{ margin: 0 }}>Tilbud å følge opp{naa.length ? <span className="chip venter" style={{ marginLeft: 8 }}>{naa.length}</span> : null}</h2>
        {!skjema && <button className="btn sm primary" onClick={() => setSkjema("ny")}>+ Nytt tilbud</button>}
        <div className="filter">
          {([["naa", `Følg opp nå${naa.length ? ` (${naa.length})` : ""}`], ["aapne", `Alle åpne (${aapne.length})`], ["avgjort", "Vunnet og tapt"]] as [Filter, string][]).map(([f, t]) => (
            <button key={f} className="btn sm" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t}</button>
          ))}
        </div>
      </div>
      {skjema && <TilbudSkjema t={skjema === "ny" ? undefined : skjema} lukk={() => setSkjema(null)} etter={last} />}
      <div className="tilbud-kpi small">
        <span><b>{krKort(aapenSum)}</b> i åpne tilbud</span>
        <span><b>{iAar.vunnet}</b> vunnet i år{iAar.vunnetKr ? <> (<b>{krKort(iAar.vunnetKr)}</b>)</> : null}</span>
        <span><b>{iAar.tapt}</b> tapt</span>
        {iAar.treff != null && <span>Treffprosent <b>{iAar.treff} %</b></span>}
      </div>
      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {(planlegger || selgere.length > 1) && (
          <select aria-label="Selger" value={selger} onChange={(e) => setSelger(e.target.value)}>
            <option value="">Alle selgere</option>
            {selgere.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <label className="small row" style={{ gap: 6, alignItems: "center" }}><input type="checkbox" checked={sma} onChange={(e) => setSma(e.target.checked)} /> {`Ta med tilbud under ${kr(MIN_BELOP)}`}</label>
      </div>
      {vis.length ? (
        <div className="list">
          {vis.slice(0, 60).map((t) => <TilbudRad key={t.id} t={t} apen={apen === t.id} veksle={() => setApen(apen === t.id ? null : t.id)} etter={last} endre={() => setSkjema(t)} />)}
          {vis.length > 60 && <p className="small muted">… og {vis.length - 60} til.</p>}
        </div>
      ) : (
        <div className="empty">{filter === "naa" ? "Ingen tilbud å følge opp nå. Bra jobba!" : filter === "aapne" ? "Ingen åpne tilbud." : "Ingen avgjorte tilbud ennå."}</div>
      )}
      <p className="small muted" style={{ margin: 0 }}>{fraVisma
        ? "Tilbud fra Visma (ordretype tilbud) og tilbud registrert her. De kommer på lista etter en uke uten kontakt. Tilbud fra Visma blir merket vunnet av seg selv når de gjøres om til ordre; egne tilbud merker du selv når kunden takker ja."
        : "Registrer tilbudene dere sender, så kommer de på lista etter en uke uten kontakt. Når kunden takker ja, merker du tilbudet vunnet og kan lage prosjektet med ett trykk."}{" "}{`Tilbud eldre enn ${GAMMELT} dager ligger under «Alle åpne».`}</p>
    </section>
  );
}

function TilbudSkjema({ t, lukk, etter }: { t?: T; lukk: () => void; etter: () => void }) {
  const { d, meg, idag, kjor } = useApp();
  const planlegger = usePlanlegger();
  const [f, setF] = useState({ kunde: t?.kunde ?? "", telefon: t?.telefon ?? "", referanse: t?.referanse ?? "", beskrivelse: t?.beskrivelse ?? "",
    belop: t ? String(t.belop) : "", dato: t?.dato ?? idag, selger: t?.selger_navn ?? meg.navn });
  const kunder = useMemo(() => d.kunder.map((k) => k.navn).filter(Boolean), [d.kunder]);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const x: NyttTilbud = { id: t?.id, kunde: f.kunde, telefon: f.telefon, referanse: f.referanse, beskrivelse: f.beskrivelse,
      belop: Number(f.belop.replace(/\s/g, "").replace(",", ".")) || 0, dato: f.dato || null, selger: f.selger };
    if (await kjor(async () => { await api.lagreTilbud(x); etter(); }, t ? "Tilbudet er endret" : "Tilbudet er registrert. Du får beskjed når det er tid for å følge opp.")) lukk();
  };
  // Telefon fra kunderegisteret når kunden finnes der
  const velgKunde = (navn: string) => {
    const k = d.kunder.find((x) => x.navn.toLowerCase() === navn.trim().toLowerCase());
    setF({ ...f, kunde: navn, telefon: f.telefon || k?.telefon || "" });
  };
  return (
    <form className="tilbud-skjema" onSubmit={lagre}>
      <b>{t ? "Endre tilbud" : "Nytt tilbud"}</b>
      <datalist id="tilbud-kunder">{kunder.map((k) => <option key={k} value={k} />)}</datalist>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: "2 1 200px" }}><span className="label">Kunde</span>
          <input list="tilbud-kunder" value={f.kunde} onChange={(e) => velgKunde(e.target.value)} required maxLength={200} autoFocus /></label>
        <label className="field" style={{ flex: "1 1 140px" }}><span className="label">Telefon</span>
          <input type="tel" value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} maxLength={40} /></label>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: "2 1 200px" }}><span className="label">Hva gjelder det?</span>
          <input value={f.referanse} onChange={(e) => setF({ ...f, referanse: e.target.value })} placeholder="F.eks. Nytt tak, 140 m²" maxLength={200} /></label>
        <label className="field" style={{ flex: "1 1 120px" }}><span className="label">Beløp eks. mva</span>
          <input inputMode="decimal" value={f.belop} onChange={(e) => setF({ ...f, belop: e.target.value })} placeholder="0" /></label>
        <label className="field" style={{ flex: "0 1 150px" }}><span className="label">Sendt</span>
          <input type="date" value={f.dato} max={idag} onChange={(e) => setF({ ...f, dato: e.target.value })} /></label>
        {planlegger && (
          <label className="field" style={{ flex: "1 1 150px" }}><span className="label">Selger</span>
            <select value={f.selger} onChange={(e) => setF({ ...f, selger: e.target.value })}>
              {sorterAnsatte(d).filter((a) => a.aktiv || a.navn === f.selger).map((a) => <option key={a.id} value={a.navn}>{a.navn}</option>)}
            </select></label>
        )}
      </div>
      <label className="field"><span className="label">Beskrivelse (valgfritt)</span>
        <textarea rows={2} value={f.beskrivelse} onChange={(e) => setF({ ...f, beskrivelse: e.target.value })} maxLength={2000} /></label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!f.kunde.trim()}>{t ? "Lagre" : "Registrer tilbudet"}</button>
        <button type="button" className="btn" onClick={lukk}>Avbryt</button>
      </div>
    </form>
  );
}

function TilbudRad({ t, apen, veksle, etter, endre }: { t: T; apen: boolean; veksle: () => void; etter: () => void; endre: () => void }) {
  const { d, idag, kjor, meg } = useApp();
  const planlegger = usePlanlegger();
  const [notat, setNotat] = useState("");
  const [neste, setNeste] = useState(plussDager(idag, 7));
  const kunde = t.kunde_nr ? d.kunder.find((k) => k.visma_nr === t.kunde_nr) : undefined;
  const a = alder(t, idag);
  const frist = oppfolgingsdato(t);
  const forsinket = aapent(t) && frist && frist < idag ? Math.round((Date.parse(idag) - Date.parse(frist)) / 864e5) : 0;
  // Vunnet tilbud registrert her: lag prosjektet med kunden (ny kunde hvis den ikke finnes)
  const prosjektNavn = (t.referanse || t.kunde).slice(0, 200);
  const harProsjekt = d.prosjekter.some((p) => p.navn === prosjektNavn && (!p.kunde_id || d.kunder.find((k) => k.id === p.kunde_id)?.navn === t.kunde));
  const lagProsjekt = () => {
    const k = d.kunder.find((x) => x.navn.toLowerCase() === t.kunde.toLowerCase());
    kjor(() => api.lagreProsjekt({ navn: prosjektNavn, kunde_id: k?.id ?? null, kontakt_navn: t.kunde, kontakt_telefon: t.telefon ?? "", notat: t.beskrivelse ?? "" }, k ? undefined : t.kunde),
      `Prosjektet «${prosjektNavn}» er laget`);
  };
  const gjor = (h: TilbudHandling, tekst: string, n: string | null = null) =>
    kjor(() => api.folgOppTilbud(t.id, h, notat, n).then(() => { setNotat(""); etter(); }), tekst);
  const status = t.status === "vunnet" ? <span className="chip godkjent">{t.manuell ? "Vunnet" : "Vunnet – ble ordre"}</span>
    : t.utfall === "tapt" ? <span className="chip avslatt">Takket nei</span>
    : t.utfall === "ikke_aktuelt" ? <span className="chip">Ikke aktuelt</span>
    : t.status === "avsluttet" ? <span className="chip">Avsluttet i Visma</span>
    : t.status === "borte" ? <span className="chip">Slettet i Visma</span>
    : forsinket ? <span className="chip venter">{forsinket === 1 ? "1 dag over" : `${forsinket} dager over`}</span> : null;

  return (
    <div className={`tilbud-rad${apen ? " apen" : ""}`}>
      <button type="button" className="tilbud-topp" onClick={veksle} aria-expanded={apen}>
        <span className="tilbud-kunde" data-ikke-oversett><b>{t.kunde || "–"}</b>{t.referanse ? <span className="muted"> · {t.referanse}</span> : null}</span>
        <span className="tilbud-belop">{kr(t.belop)}</span>
        <span className="small muted tilbud-meta">
          <span>{t.manuell ? "Eget tilbud" : `Tilbud ${t.visma_ordrenr}`}</span> · <span>{a === 0 ? "i dag" : a === 1 ? "1 dag siden" : `${a} dager siden`}</span>
          {t.selger_navn && <> · <span data-ikke-oversett>{t.selger_navn}</span></>}
          {t.sist_kontakt && <> · <span>ringt</span> <span>{kortDato(t.sist_kontakt)}</span></>}
        </span>
        {status}
      </button>
      {t.notat && !apen && <p className="small" style={{ margin: "2px 0 0" }} data-ikke-oversett>📝 {t.notat}</p>}
      {apen && (
        <div className="tilbud-detaljer">
          {t.beskrivelse && <p className="small" style={{ margin: 0 }} data-ikke-oversett>{t.beskrivelse}</p>}
          {t.manuell && t.telefon ? (
            <p style={{ margin: 0 }}><a className="btn sm primary" href={telLenke(t.telefon)}><span>📞 Ring</span> <span data-ikke-oversett>{t.telefon}</span></a></p>
          ) : kunde?.telefon || kunde?.epost ? (
            <p style={{ margin: 0 }}>
              {kunde.telefon && <a className="btn sm primary" href={telLenke(kunde.telefon)}><span>📞 Ring</span> <span data-ikke-oversett>{kunde.telefon}</span></a>}{" "}
              {kunde.epost && <a className="btn sm" href={`mailto:${kunde.epost}?subject=${encodeURIComponent(`Tilbud ${t.tilbudsnr ?? t.visma_ordrenr}`)}`}>✉️ E-post</a>}
            </p>
          ) : <p className="small muted" style={{ margin: 0 }}>{t.manuell ? "Ingen telefon registrert på tilbudet." : "Ingen telefon på kunden i Visma."}</p>}
          {t.logg.length > 0 && (
            <ul className="small tilbud-logg">
              {[...t.logg].reverse().slice(0, 5).map((l, i) => (
                <li key={i}><span>{kortDato(l.dato)}</span> · <span>{HVA[l.hva] ?? l.hva}</span>
                  {l.av && <> <span>av</span> <span data-ikke-oversett>{d.ansatte.find((x) => x.id === l.av)?.navn.split(" ")[0] ?? ""}</span></>}
                  {l.notat && <> – <span data-ikke-oversett>{l.notat}</span></>}</li>
              ))}
            </ul>
          )}
          {aapent(t) ? (
            <>
              <label className="field"><span className="label">Hva sa kunden?</span>
                <textarea rows={2} value={notat} onChange={(e) => setNotat(e.target.value)} maxLength={2000} placeholder="F.eks. «Venter på banken, ring igjen fredag»" /></label>
              <div className="row" style={{ gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                <label className="field" style={{ flex: "0 1 170px" }}><span className="label">Neste kontakt</span>
                  <input type="date" value={neste} min={idag} max={plussDager(idag, 365)} onChange={(e) => setNeste(e.target.value)} /></label>
                <button className="btn sm primary" onClick={() => gjor("ringt", "Lagret – du får beskjed når det er tid igjen", neste)}>✓ Ringt</button>
                <button className="btn sm" onClick={() => gjor("utsett", "Utsatt", neste)}>Utsett</button>
                <button className="btn sm no" onClick={() => { if (confirm(oversett("Merke tilbudet som tapt?"))) gjor("tapt", "Merket som tapt"); }}>Takket nei</button>
                <button className="btn sm" onClick={() => gjor("ikke_aktuelt", "Fjernet fra lista")}>Ikke aktuelt</button>
              </div>
              {t.manuell
                ? <div className="row" style={{ gap: 8 }}><button className="btn sm primary" onClick={() => gjor("vunnet", "Gratulerer! Tilbudet er merket vunnet.")}>🎉 Kunden takket ja</button></div>
                : <p className="small muted" style={{ margin: 0 }}>Takker kunden ja, gjør tilbudet om til ordre i Visma – da blir det merket vunnet her av seg selv.</p>}
            </>
          ) : (t.utfall && t.status === "apen") || (t.manuell && t.status === "vunnet") ? (
            <div className="row" style={{ gap: 8 }}>
              {t.manuell && t.status === "vunnet" && !harProsjekt && <button className="btn sm primary" onClick={lagProsjekt}>Lag prosjekt av tilbudet</button>}
              {t.manuell && t.status === "vunnet" && harProsjekt && <span className="small muted">Prosjektet «{prosjektNavn}» finnes.</span>}
              <button className="btn sm" onClick={() => gjor("gjenapne", "Tilbudet er åpent igjen", plussDager(idag, 1))}>Åpne igjen</button>
            </div>
          ) : null}
          {t.manuell && (planlegger || t.opprettet_av === meg.id) && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={endre}>Endre</button>
              <button className="btn sm" onClick={() => { if (confirm(oversett("Slette tilbudet?"))) kjor(() => api.slettTilbud(t.id).then(etter), "Tilbudet er slettet"); }}>Slett</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
