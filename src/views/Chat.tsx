import { useEffect, useMemo, useRef, useState } from "react";
import { VarselBryter } from "./Varsler";
import { useApp } from "../App";
import { api, feiltekst } from "../lib/api";
import { FELLES, dmKanal, erDm, initialer, kanalNavn, kanaler, motpart, personFarge, prosjektKanal, tidTekst, type Melding } from "../lib/chat";
import { ProsjektVelger } from "./ProsjektVelger";

/** Hele meldingssiden: kanalliste til venstre, samtale til høyre (på mobil: én om gangen). */
export function Chat() {
  const { d, meg, chat } = useApp();
  const [valgt, setValgt] = useState<string | null>(() => (window.matchMedia("(min-width: 761px)").matches ? FELLES : null));
  const [ny, setNy] = useState(false);
  const rader = useMemo(() => kanaler(chat.meldinger, chat.lest, meg.id), [chat.meldinger, chat.lest, meg.id]);
  const kolleger = d.ansatte.filter((a) => a.aktiv && a.id !== meg.id).sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  const aktive = d.prosjekter.filter((p) => p.aktiv);
  const navn = (k: string) => kanalNavn(k, meg.id, d.ansatte, d.prosjekter);
  const forfatter = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "";
  const aapne = (k: string) => { setValgt(k); setNy(false); };

  return (
    <section className={`chat ${valgt ? "har-valgt" : ""}`}>
      <aside className="chat-liste" aria-label="Samtaler">
        <div className="chat-liste-topp">
          <h2>Meldinger</h2>
          <button className="btn sm primary" onClick={() => setNy(!ny)} aria-expanded={ny}>{ny ? "Lukk" : "+ Ny"}</button>
        </div>
        <VarselBryter />
        {ny && (
          <div className="chat-ny">
            <label className="field"><span className="label">Skriv til en kollega</span>
              <select value="" onChange={(e) => e.target.value && aapne(dmKanal(meg.id, e.target.value))}>
                <option value="">Velg person …</option>
                {kolleger.map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
              </select></label>
            <ProsjektVelger label="Tråd på et prosjekt" value="" onChange={(id) => id && aapne(prosjektKanal(id))} prosjekter={aktive} />
          </div>
        )}
        <ul>
          {rader.map((r) => {
            const dm = erDm(r.kanal), annen = dm ? motpart(r.kanal, meg.id) : null;
            return (
              <li key={r.kanal}>
                <button className={`chat-rad ${valgt === r.kanal ? "valgt" : ""} ${r.uleste ? "ulest" : ""}`} onClick={() => aapne(r.kanal)}>
                  <span className={`avatar ${r.kanal === FELLES ? "felles" : r.kanal.startsWith("p:") ? "prosjekt" : ""}`}
                    style={annen ? { background: personFarge(annen) } : undefined} aria-hidden="true">
                    {r.kanal === FELLES ? "👷" : r.kanal.startsWith("p:") ? "🏠" : initialer(navn(r.kanal))}
                  </span>
                  <span className="chat-rad-tekst">
                    <span className="chat-rad-navn" data-ikke-oversett={r.kanal === FELLES ? undefined : ""}>{navn(r.kanal)}</span>
                    <span className="chat-rad-siste" data-ikke-oversett>
                      {r.siste ? `${r.siste.ansatt_id === meg.id ? "Du" : forfatter(r.siste.ansatt_id).split(" ")[0]}: ${r.siste.tekst || "📷 Bilde"}` : "Ingen meldinger ennå"}
                    </span>
                  </span>
                  <span className="chat-rad-meta">
                    {r.siste && <span className="small muted">{tidTekst(r.siste.opprettet)}</span>}
                    {r.uleste > 0 && <span className="badge">{r.uleste}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {rader.length === 1 && !rader[0]!.siste && <p className="small muted" style={{ padding: "0 14px 14px" }}>Her skriver dere til hverandre i stedet for på Messenger. Start i «Alle i firmaet», eller trykk «+ Ny».</p>}
      </aside>
      {valgt ? (
        <div className="chat-traad-boks">
          <div className="chat-hode">
            <button className="btn sm chat-tilbake" onClick={() => setValgt(null)} aria-label="Tilbake til samtaler">‹</button>
            <div>
              <h3 data-ikke-oversett={valgt === FELLES ? undefined : ""}>{navn(valgt)}</h3>
              <span className="small muted">{valgt === FELLES ? `${d.ansatte.filter((a) => a.aktiv).length} ansatte` : valgt.startsWith("p:") ? "Prosjekttråd – alle i firmaet kan se den" : "Privat – bare dere to"}</span>
            </div>
          </div>
          <Traad kanal={valgt} />
        </div>
      ) : <div className="chat-tom muted">Velg en samtale</div>}
    </section>
  );
}

/** Én samtale med meldinger og skrivefelt. Brukes både på meldingssiden og på prosjektsiden. */
export function Traad({ kanal, hoyde }: { kanal: string; hoyde?: number }) {
  const { d, meg, leder, chat } = useApp();
  const liste = useMemo(() => chat.meldinger.filter((m) => m.kanal === kanal), [chat.meldinger, kanal]);
  const [tekst, setTekst] = useState("");
  const [bilde, setBilde] = useState<File | null>(null);
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [urler, setUrler] = useState<Record<string, string>>({});
  const [stor, setStor] = useState<string | null>(null);
  const [meny, setMeny] = useState<string | null>(null);
  const [retter, setRetter] = useState<Melding | null>(null);
  const bunn = useRef<HTMLDivElement>(null);
  const fil = useRef<HTMLInputElement>(null);
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "Ukjent";

  // Les meldinger når samtalen er åpen
  const sisteId = liste[liste.length - 1]?.id;
  useEffect(() => { if (document.visibilityState === "visible") chat.markerLest(kanal); }, [kanal, sisteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bunn.current?.scrollIntoView({ block: "end" }); }, [kanal, sisteId]);
  useEffect(() => {
    const mangler = liste.map((m) => m.bilde_sti).filter((s): s is string => !!s && !urler[s]);
    if (mangler.length) api.bildeUrler(mangler).then((u) => setUrler((x) => ({ ...x, ...u }))).catch(() => {});
  }, [liste]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (sender || (!tekst.trim() && !bilde)) return;
    setSender(true); setFeil(null);
    try {
      if (retter) await api.rettMelding(retter.id, tekst);
      else await api.sendMelding(kanal, tekst, bilde);
      setTekst(""); setBilde(null); setRetter(null); if (fil.current) fil.current.value = "";
      chat.oppdater();
    } catch (e) { setFeil(feiltekst(e)); } finally { setSender(false); }
  };
  const slett = async (m: Melding) => {
    setMeny(null);
    try { await api.slettMelding(m.id, m.bilde_sti); chat.oppdater(); } catch (e) { setFeil(feiltekst(e)); }
  };

  // Grupper på dag
  let forrigeDag = "", forrigeAv = "";
  return (
    <div className="traad">
      <div className="traad-rull" style={hoyde ? { maxHeight: hoyde } : undefined}>
        {!liste.length && <div className="chat-tom muted">Ingen meldinger ennå. Skriv den første!</div>}
        {liste.map((m, i) => {
          const dag = new Date(m.opprettet).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
          const nyDag = dag !== forrigeDag; forrigeDag = dag;
          const samme = !nyDag && forrigeAv === m.ansatt_id && i > 0 && new Date(m.opprettet).getTime() - new Date(liste[i - 1]!.opprettet).getTime() < 5 * 6e4;
          forrigeAv = m.ansatt_id;
          const min = m.ansatt_id === meg.id;
          const kanSlette = min || (leder && !erDm(kanal));
          return (
            <div key={m.id}>
              {nyDag && <div className="traad-dag"><span>{dag}</span></div>}
              <div className={`boble-rad ${min ? "min" : ""} ${samme ? "samme" : ""}`}>
                {!min && <span className="avatar liten" style={{ background: personFarge(m.ansatt_id), visibility: samme ? "hidden" : undefined }} aria-hidden="true">{initialer(navn(m.ansatt_id))}</span>}
                <div className="boble">
                  {!min && !samme && <div className="boble-navn" data-ikke-oversett>{navn(m.ansatt_id)}</div>}
                  {m.bilde_sti && (urler[m.bilde_sti]
                    ? <button className="boble-bilde" onClick={() => setStor(urler[m.bilde_sti!]!)}><img src={urler[m.bilde_sti]} alt="Bilde i meldingen" loading="lazy" /></button>
                    : <div className="boble-bilde laster">📷</div>)}
                  {m.tekst && <div className="boble-tekst" data-ikke-oversett>{m.tekst}</div>}
                  <div className="boble-tid">{tidTekst(m.opprettet)}{m.endret ? " · endret" : ""}
                    {kanSlette && <button className="boble-meny" aria-label="Valg for meldingen" onClick={() => setMeny(meny === m.id ? null : m.id)}>⋯</button>}
                  </div>
                  {meny === m.id && (
                    <div className="boble-valg">
                      {min && m.tekst && <button className="btn sm" onClick={() => { setRetter(m); setTekst(m.tekst); setMeny(null); }}>Rett</button>}
                      <button className="btn sm no" onClick={() => slett(m)}>Slett</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bunn} />
      </div>
      {feil && <p className="small" style={{ color: "var(--warn)", padding: "0 12px" }}>{feil}</p>}
      {(bilde || retter) && (
        <div className="skriv-info small">
          {retter ? <>Retter melding</> : <>📷 {bilde!.name}</>}
          <button className="linkbtn" onClick={() => { setBilde(null); setRetter(null); setTekst(retter ? "" : tekst); if (fil.current) fil.current.value = ""; }}>Avbryt</button>
        </div>
      )}
      <form className="skriv" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input ref={fil} type="file" accept="image/*" hidden onChange={(e) => setBilde(e.target.files?.[0] ?? null)} />
        {!retter && <button type="button" className="skriv-knapp" aria-label="Legg ved bilde" onClick={() => fil.current?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </button>}
        <textarea rows={1} value={tekst} placeholder="Skriv en melding …" aria-label="Melding"
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(); } }} />
        <button className="skriv-send" disabled={sender || (!tekst.trim() && !bilde)} aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z" /></svg>
        </button>
      </form>
      {stor && <div className="lysboks" onClick={() => setStor(null)} role="dialog" aria-label="Bilde"><img src={stor} alt="Bilde i full størrelse" /></div>}
    </div>
  );
}
