import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { langDato as kortDato, sorterAnsatte } from "../lib/ferie";
import { lesKursbevis } from "../lib/lesbevis";
import { besteBevis, KURS, kursNavn, kStatus, STATUS_TEKST, trengerFornyelse, type Funn, type Kompetanse as K } from "../lib/kompetanse";

const tom = (ansatt_id: string): Partial<K> & { ansatt_id: string; type: string } =>
  ({ ansatt_id, type: "stillas", navn: "", utsteder: "", utstedt: null, gyldig_til: null, merknad: "" });

/** Kurs og kompetansebevis: hver ansatt har sine bevis med kopi, og kan vise dem fram på stedet. Leder ser oversikt og hva som går ut. */
export function Kompetanse() {
  const { d, meg, leder, idag } = useApp();
  const alle = d.kompetanse ?? [];
  const [hvemId, setHvemId] = useState(meg.id);
  const [visning, setVisning] = useState<"person" | "oversikt">("person");
  const hvem = d.ansatte.find((a) => a.id === hvemId) ?? meg;
  const varsel = trengerFornyelse(alle, idag);
  const kanEndre = leder || hvem.id === meg.id;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <label className="label" htmlFor="kurs-for">Viser for</label>
          <select id="kurs-for" value={hvemId} onChange={(e) => { setHvemId(e.target.value); setVisning("person"); }}>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.id === meg.id ? `${a.navn} (meg)` : a.navn}</option>)}
          </select>
        </div>
        <div className="filter">
          <button className="btn sm" aria-pressed={visning === "person"} onClick={() => setVisning("person")}>Bevis</button>
          <button className="btn sm" aria-pressed={visning === "oversikt"} onClick={() => setVisning("oversikt")}>Hvem har hva{leder && varsel.length ? ` (${varsel.length})` : ""}</button>
        </div>
      </div>
      {visning === "person" ? <Person ansattId={hvem.id} navn={hvem.id === meg.id ? "Mine kurs og bevis" : `Kurs og bevis – ${hvem.navn}`} kanEndre={kanEndre} />
        : <Oversikt velg={(id) => { setHvemId(id); setVisning("person"); }} />}
    </>
  );
}

function Person({ ansattId, navn, kanEndre }: { ansattId: string; navn: string; kanEndre: boolean }) {
  const { d, idag, kjor } = useApp();
  const liste = (d.kompetanse ?? []).filter((k) => k.ansatt_id === ansattId)
    .sort((a, b) => kursNavn(a.type).localeCompare(kursNavn(b.type), "nb") || (b.gyldig_til ?? "9").localeCompare(a.gyldig_til ?? "9"));
  const [skjema, setSkjema] = useState<(Partial<K> & { ansatt_id: string; type: string }) | null>(null);
  const [fil, setFil] = useState<File | null>(null);
  const [lagrer, setLagrer] = useState(false);
  const [urler, setUrler] = useState<Record<string, string>>({});
  const [stort, setStort] = useState<K | null>(null);
  const [leser, setLeser] = useState<number | null>(null);
  const [funn, setFunn] = useState<Funn | null>(null);

  /** Leser beviset og fyller inn feltene som er tomme */
  const velgFil = async (f: File | null, start?: Partial<K> & { ansatt_id: string; type: string }) => {
    setFil(f); setFunn(null);
    if (!f) return;
    const utgangspunkt = start ?? skjema ?? tom(ansattId);
    if (start) setSkjema(start);
    setLeser(0);
    try {
      const r = await lesKursbevis(f, (p) => setLeser(p));
      setFunn(r);
      setSkjema((s0) => {
        const s1 = s0 ?? utgangspunkt;
        const nyType = !s1.id && r.type && (s1.type === "stillas" || s1.type === "annet") ? r.type : s1.type;
        return { ...s1, type: nyType, navn: s1.navn || r.navn || "", utsteder: s1.utsteder || r.utsteder || "",
          utstedt: s1.utstedt || r.utstedt || null, gyldig_til: s1.gyldig_til || r.gyldig_til || null };
      });
    } catch { setFunn({}); }
    setLeser(null);
  };
  const bilder = liste.filter((k) => k.sti && !k.sti.endsWith(".pdf"));
  useEffect(() => {
    for (const k of bilder) if (k.sti && !urler[k.sti]) api.dokUrl(k.sti).then((u) => setUrler((x) => ({ ...x, [k.sti!]: u }))).catch(() => {});
  }, [bilder.map((k) => k.sti).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSkjema(null); setFil(null); setFunn(null); }, [ansattId]);

  const aapne = async (k: K) => {
    if (!k.sti) return;
    if (!k.sti.endsWith(".pdf") && urler[k.sti]) { setStort(k); return; }
    const vindu = window.open("", "_blank");
    try { const u = await api.dokUrl(k.sti); if (vindu) vindu.location.href = u; else location.href = u; } catch { vindu?.close(); }
  };
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skjema) return;
    setLagrer(true);
    const ok = await kjor(() => api.lagreKompetanse({ ...skjema, navn: (skjema.navn ?? "").trim(), utsteder: (skjema.utsteder ?? "").trim() }, fil), skjema.id ? "Beviset er oppdatert" : "Beviset er lagret");
    setLagrer(false);
    if (ok) { setSkjema(null); setFil(null); setFunn(null); }
  };
  const slett = (k: K) => kjor(() => api.slettKompetanse(k.id, k.sti), "Beviset er slettet");
  const hint = KURS.find((x) => x.id === skjema?.type)?.hint;

  return (
    <>
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{navn}</h2>
          {kanEndre && !skjema && (
            <div className="row">
              <label className="btn primary">Ta bilde av nytt bevis
                <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; velgFil(f, { ...tom(ansattId), type: "annet" }); }} /></label>
              <button className="btn" onClick={() => setSkjema(tom(ansattId))}>Fyll inn selv</button>
            </div>
          )}
        </div>
        <p className="small muted">Ta bilde av kursbeviset eller last opp PDF. Appen leser beviset og fyller inn kurs og datoer, så sjekker du og lagrer. Da har du alt på telefonen når noen spør på byggeplassen, og du får beskjed før et bevis går ut.</p>

        {skjema && (
          <form className="panel" style={{ background: "var(--sunk)", boxShadow: "none" }} onSubmit={lagre}>
            <div className="row">
              <label className="field"><span className="label">Kurs eller bevis</span>
                <select value={skjema.type} onChange={(e) => setSkjema({ ...skjema, type: e.target.value })}>
                  {KURS.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
                </select></label>
              <label className="field"><span className="label">Detaljer {hint ? <span className="muted">({hint})</span> : null}</span>
                <input type="text" value={skjema.navn ?? ""} onChange={(e) => setSkjema({ ...skjema, navn: e.target.value })} placeholder="F.eks. stillas over 5 m" /></label>
            </div>
            <div className="row">
              <label className="field"><span className="label">Kursholder / utsteder</span>
                <input type="text" value={skjema.utsteder ?? ""} onChange={(e) => setSkjema({ ...skjema, utsteder: e.target.value })} placeholder="F.eks. AKA, Fagopplæring" /></label>
              <label className="field kort"><span className="label">Tatt</span>
                <input type="date" value={skjema.utstedt ?? ""} onChange={(e) => setSkjema({ ...skjema, utstedt: e.target.value || null })} /></label>
              <label className="field kort"><span className="label">Gyldig til (tomt = ingen utløp)</span>
                <input type="date" value={skjema.gyldig_til ?? ""} onChange={(e) => setSkjema({ ...skjema, gyldig_til: e.target.value || null })} /></label>
            </div>
            <div className="row">
              <label className="btn">{fil ? `Valgt: ${fil.name}` : skjema.sti ? "Bytt kopi av beviset" : "Ta bilde av beviset"}
                <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; velgFil(f); }} /></label>
              {fil && leser == null && <button type="button" className="linkbtn small" onClick={() => { setFil(null); setFunn(null); }}>Fjern</button>}
            </div>
            {leser != null && <p className="small" role="status">Leser beviset … {Math.round(leser * 100)} %</p>}
            {funn && leser == null && (
              <div className={`lest ${funn.gyldig_til || funn.ingenUtlop ? "ok" : "usikker"}`} role="status">
                {funn.gyldig_til ? <>Fant utløpsdato <b>{kortDato(funn.gyldig_til)}</b>{funn.bevis ? <> fra «{funn.bevis}»</> : null}. Sjekk at den stemmer.</>
                  : funn.ingenUtlop ? <>Fant ingen utløpsdato på beviset. Står det ingen, gjelder det uten utløp – sjekk selv.</>
                  : <>Klarte ikke å lese utløpsdatoen sikkert. Fyll inn fra beviset.</>}
                {!funn.type && !funn.utstedt && !funn.gyldig_til ? " Bildet var vanskelig å lese – prøv et skarpere bilde med godt lys, eller fyll inn selv." : ""}
              </div>
            )}
            <div className="row">
              <button className="btn primary" disabled={lagrer || leser != null}>{lagrer ? "Lagrer …" : "Lagre bevis"}</button>
              <button type="button" className="btn" onClick={() => { setSkjema(null); setFil(null); setFunn(null); }}>Avbryt</button>
            </div>
          </form>
        )}

        {liste.length === 0 && !skjema && <div className="empty">Ingen kurs eller bevis lagt inn ennå.{kanEndre ? " Trykk «Legg til bevis»." : ""}</div>}
        <div className="bevisliste">
          {liste.map((k) => {
            const st = kStatus(k, idag);
            return (
              <div key={k.id} className={`bevis ${st}`}>
                <button className="bevis-bilde" onClick={() => aapne(k)} disabled={!k.sti} aria-label={`Vis beviset ${kursNavn(k.type)}`}>
                  {k.sti && urler[k.sti] ? <img src={urler[k.sti]} alt="" /> : <span className="small muted">{k.sti ? (k.sti.endsWith(".pdf") ? "PDF" : "…") : "Ingen kopi"}</span>}
                </button>
                <div className="bevis-tekst">
                  <div className="t">{k.type === "annet" && k.navn ? k.navn : kursNavn(k.type)}</div>
                  {k.navn && k.type !== "annet" && <div className="small">{k.navn}</div>}
                  <div className="small muted">{[k.utsteder, k.utstedt ? `tatt ${kortDato(k.utstedt)}` : ""].filter(Boolean).join(" · ")}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <span className={`chip ${st === "gyldig" ? "godkjent" : st === "snart" ? "venter" : "avslatt"}`}>{STATUS_TEKST[st]}</span>
                    <span className="small">{k.gyldig_til ? `til ${kortDato(k.gyldig_til)}` : "uten utløp"}</span>
                  </div>
                  {k.sti && liste.some((x) => x.id !== k.id && x.sti === k.sti) && (
                    <div className="small muted" style={{ marginTop: 4 }}>Felles bevis med {liste.filter((x) => x.id !== k.id && x.sti === k.sti).map((x) => (x.type === "annet" && x.navn ? x.navn : x.navn || kursNavn(x.type)).split(" ")[0]).join(", ")}</div>
                  )}
                </div>
                {kanEndre && (
                  <div className="acts">
                    <button className="btn sm" onClick={() => { setSkjema({ ...k }); setFil(null); }}>Endre</button>
                    <button className="btn sm no" onClick={() => slett(k)}>Slett</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {stort && stort.sti && (
        <div className="lysboks" role="dialog" aria-label={kursNavn(stort.type)} onClick={() => setStort(null)}>
          <img src={urler[stort.sti]} alt={kursNavn(stort.type)} />
          <div className="small">{kursNavn(stort.type)}{stort.gyldig_til ? ` · gyldig til ${kortDato(stort.gyldig_til)}` : ""}</div>
          <button className="btn" onClick={() => setStort(null)}>Lukk</button>
        </div>
      )}
    </>
  );
}

/** Hvem har hvilke kurs, og hva må fornyes */
function Oversikt({ velg }: { velg: (ansattId: string) => void }) {
  const { d, idag, leder } = useApp();
  const alle = d.kompetanse ?? [];
  const beste = besteBevis(alle);
  const ansatte = sorterAnsatte(d).filter((a) => a.aktiv);
  const typer = KURS.filter((k) => alle.some((x) => x.type === k.id));
  const varsel = trengerFornyelse(alle, idag);
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "";

  return (
    <>
      {varsel.length > 0 && (
        <section className="panel">
          <h2>Må fornyes</h2>
          <div className="list">
            {varsel.map((k) => (
              <div key={k.id} className={`item ${kStatus(k, idag) === "utlopt" ? "avslatt" : "venter"}`}>
                <div><div className="t">{navn(k.ansatt_id)} – {kursNavn(k.type)}</div>
                  <div className="s">{kStatus(k, idag) === "utlopt" ? "Utløpt" : "Går ut"} {kortDato(k.gyldig_til!)}{k.navn ? ` · ${k.navn}` : ""}</div></div>
                <div className="acts"><button className="btn sm" onClick={() => velg(k.ansatt_id)}>Vis</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <h2>Hvem har hva</h2>
        {typer.length === 0 ? <div className="empty">Ingen bevis lagt inn ennå.{leder ? " Velg en ansatt og legg inn kursene deres, eller be dem gjøre det selv." : ""}</div> : (
          <div className="scroll">
            <table className="tbl kursmatrise">
              <thead><tr><th>Ansatt</th>{typer.map((t) => <th key={t.id} title={t.navn}>{t.navn.split(" / ")[0]}</th>)}</tr></thead>
              <tbody>
                {ansatte.map((a) => (
                  <tr key={a.id}>
                    <td><button className="linkbtn" onClick={() => velg(a.id)}>{a.navn}</button></td>
                    {typer.map((t) => {
                      const k = beste.get(`${a.id}|${t.id}`);
                      const st = k ? kStatus(k, idag) : null;
                      return <td key={t.id} className={`k-${st ?? "mangler"}`} title={k ? `${STATUS_TEKST[st!]}${k.gyldig_til ? ` – til ${kortDato(k.gyldig_til)}` : ""}` : "Mangler"}>
                        {k ? (k.gyldig_til ? kortDato(k.gyldig_til) : "✓") : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="cal-legend"><span><i className="dot bg-approved" />Gyldig</span><span><i className="dot" style={{ background: "var(--pending)" }} />Går ut innen 60 dager</span><span><i className="dot bg-warn" />Utløpt</span></div>
      </section>
    </>
  );
}
