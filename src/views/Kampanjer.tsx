import { useEffect, useState } from "react";
import { useApp } from "../App";
import { firma } from "../lib/profil";
import { api } from "../lib/api";
import type { Kampanje } from "../lib/ferie";
import { filerTilSider, kampanjePeriode, kampanjeStatus, MAKS_SIDER, synligeKampanjer } from "../lib/kampanje";

/** Henter visningslenker for sidebildene */
function useSideUrler(stier: string[]) {
  const [urler, setUrler] = useState<Record<string, string>>({});
  const nokkel = stier.join("|");
  useEffect(() => {
    const mangler = stier.filter((s) => !urler[s]);
    if (mangler.length) api.bildeUrler(mangler).then((u) => setUrler((x) => ({ ...x, ...u }))).catch(() => {});
  }, [nokkel]); // eslint-disable-line react-hooks/exhaustive-deps
  return urler;
}

/** Bla i sidene i full skjerm */
function SideVisning({ k, urler, start, lukk }: { k: Kampanje; urler: Record<string, string>; start: number; lukk: () => void }) {
  const [i, setI] = useState(start);
  const n = k.sider.length;
  useEffect(() => {
    const tast = (e: KeyboardEvent) => {
      if (e.key === "Escape") lukk();
      if (e.key === "ArrowRight") setI((x) => Math.min(n - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", tast);
    return () => window.removeEventListener("keydown", tast);
  }, [n, lukk]);
  let x0 = 0;
  return (
    <div className="lysboks kampanje-lys" role="dialog" aria-label={k.tittel} onClick={lukk}
      onTouchStart={(e) => { x0 = e.touches[0]!.clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0]!.clientX - x0; if (dx < -50) setI((x) => Math.min(n - 1, x + 1)); if (dx > 50) setI((x) => Math.max(0, x - 1)); }}>
      <img src={urler[k.sider[i]!]} alt={`${k.tittel}, side ${i + 1} av ${n}`} onClick={(e) => e.stopPropagation()} />
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Forrige side">‹</button>
        <span>Side {i + 1} av {n}</span>
        <button className="btn" disabled={i === n - 1} onClick={() => setI(i + 1)} aria-label="Neste side">›</button>
        <button className="btn" onClick={lukk}>Lukk</button>
      </div>
    </div>
  );
}

/** Kampanjen(e) fra Byggfag som gjelder nå, øverst på startsiden. Kan skjules med ett trykk. */
export function KampanjeKort() {
  const { d, meg, idag, kjor } = useApp();
  const liste = synligeKampanjer(d.kampanjer, meg, idag);
  const urler = useSideUrler(liste.flatMap((k) => k.sider));
  const [apen, setApen] = useState<{ k: Kampanje; i: number } | null>(null);
  const [valg, setValg] = useState<string | null>(null);
  if (!liste.length) return null;

  return (
    <>
      {liste.map((k) => (
        <section key={k.id} className="panel kampanje" aria-label={`Kampanje: ${k.tittel}`}>
          <div className="kampanje-topp">
            <div>
              <span className="chip kampanje-chip">{firma(d.bedrift).kampanje}</span>
              <h2>{k.tittel}</h2>
              <div className="small muted">Gjelder {kampanjePeriode(k.fra, k.til)}</div>
            </div>
            <button className="kampanje-lukk" aria-label="Skjul kampanjen" title="Skjul" onClick={() => setValg(valg === k.id ? null : k.id)}>×</button>
          </div>
          {valg === k.id && (
            <div className="kampanje-skjul">
              <button className="btn sm" onClick={() => kjor(() => api.skjulKampanje(k.id), "Kampanjen er skjult")}>Skjul denne kampanjen</button>
              <button className="btn sm" onClick={() => kjor(() => api.settVisKampanjer(false), "Kampanjer vises ikke lenger. Du kan slå dem på igjen nederst på siden.")}>Ikke vis kampanjer</button>
              <button className="btn sm" onClick={() => setValg(null)}>Avbryt</button>
            </div>
          )}
          {k.tekst && <p className="kampanje-tekst">{k.tekst}</p>}
          <div className="kampanje-sider">
            {k.sider.map((s, i) => (
              <button key={s} className="kampanje-side" onClick={() => setApen({ k, i })} aria-label={`Åpne side ${i + 1}`}>
                {urler[s] ? <img src={urler[s]} alt="" loading="lazy" /> : <span className="kampanje-laster" />}
              </button>
            ))}
          </div>
          <div className="row small" style={{ justifyContent: "space-between" }}>
            <span className="muted">{k.sider.length} {k.sider.length === 1 ? "side" : "sider"} · trykk for å bla</span>
            {k.lenke && <a href={k.lenke} target="_blank" rel="noopener noreferrer">Se kampanjen på nett ↗</a>}
          </div>
        </section>
      ))}
      {apen && <SideVisning k={apen.k} urler={urler} start={apen.i} lukk={() => setApen(null)} />}
    </>
  );
}

/** Liten linje nederst når kampanjer er slått av eller noen er skjult, så de kan vises igjen */
export function KampanjerAv() {
  const { d, meg, idag, kjor } = useApp();
  const skjult = new Set(meg.skjulte_kampanjer ?? []);
  const skjulteNa = (d.kampanjer ?? []).filter((k) => k.fra <= idag && k.til >= idag && k.sider.length > 0 && skjult.has(k.id));
  if (meg.vis_kampanjer === false) return (
    <p className="small muted kampanjer-av">
      Kampanjer fra Byggfag er slått av. <button className="lenkeknapp" onClick={() => kjor(() => api.visKampanje(), "Kampanjer vises igjen")}>Slå på</button>
    </p>
  );
  if (!skjulteNa.length) return null;
  return (
    <p className="small muted kampanjer-av">
      {skjulteNa.length === 1 ? `Du har skjult kampanjen «${skjulteNa[0]!.tittel}».` : `Du har skjult ${skjulteNa.length} kampanjer.`}{" "}
      <button className="lenkeknapp" onClick={() => kjor(() => api.visKampanje(), skjulteNa.length === 1 ? "Kampanjen vises igjen" : "Kampanjene vises igjen")}>Vis igjen</button>
    </p>
  );
}

const STATUS = { aktiv: "Vises nå", kommende: "Kommer", utlopt: "Utløpt" };

/** Leder: legg inn DM-kampanjer (PDF eller bilder) med periode */
export function KampanjeOppsett() {
  const { d, idag, kjor } = useApp();
  const [red, setRed] = useState<Kampanje | null>(null);
  const [ny, setNy] = useState(false);
  const liste = [...(d.kampanjer ?? [])].sort((a, b) => b.fra.localeCompare(a.fra));
  const skjultAv = (id: string) => d.ansatte.filter((a) => a.aktiv && (a.vis_kampanjer === false || a.skjulte_kampanjer?.includes(id))).length;
  const aktive = d.ansatte.filter((a) => a.aktiv).length;

  return (
    <section className="panel">
      <h2>Kampanjer fra Byggfag (DM)</h2>
      <p className="small muted">Last opp DM-en som PDF (eller bilder av sidene). Den vises øverst på startsiden for alle ansatte i perioden du velger. Hver ansatt kan skjule kampanjen med ett trykk.</p>
      {liste.length > 0 && (
        <ul className="kampanje-liste">
          {liste.map((k) => {
            const st = kampanjeStatus(k, idag);
            return (
              <li key={k.id}>
                <span><b>{k.tittel}</b><span className="small muted"> · {kampanjePeriode(k.fra, k.til)} · {k.sider.length} sider{st === "aktiv" && skjultAv(k.id) ? ` · skjult av ${skjultAv(k.id)} av ${aktive}` : ""}</span></span>
                <span className="row">
                  <span className={`chip ${st === "aktiv" ? "godkjent" : st === "kommende" ? "venter" : "demo"}`}>{STATUS[st]}</span>
                  <button className="btn sm" onClick={() => { setNy(false); setRed(k); }}>Endre</button>
                  <button className="btn sm" onClick={() => { if (confirm(`Slette «${k.tittel}»?`)) kjor(() => api.slettKampanje(k.id, k.sider), "Kampanjen er slettet"); }}>Slett</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {(ny || red) ? <KampanjeSkjema k={red} ferdig={() => { setNy(false); setRed(null); }} />
        : <div><button className="btn primary" onClick={() => setNy(true)}>Legg inn ny kampanje</button></div>}
    </section>
  );
}

function KampanjeSkjema({ k, ferdig }: { k: Kampanje | null; ferdig: () => void }) {
  const { idag, kjor } = useApp();
  const [tittel, setTittel] = useState(k?.tittel ?? "");
  const [fra, setFra] = useState(k?.fra ?? idag);
  const [til, setTil] = useState(k?.til ?? new Date(Date.parse(idag) + 13 * 864e5).toISOString().slice(0, 10));
  const [tekst, setTekst] = useState(k?.tekst ?? "");
  const [lenke, setLenke] = useState(k?.lenke ?? "");
  const [filer, setFiler] = useState<File[]>([]);
  const [fjern, setFjern] = useState<string[]>([]);
  const [jobber, setJobber] = useState<string | null>(null);
  const urler = useSideUrler(k?.sider ?? []);
  const beholdt = (k?.sider ?? []).filter((s) => !fjern.includes(s));

  const velgFiler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = [...(e.target.files ?? [])];
    setFiler(f);
    if (!tittel && f[0]) setTittel(f[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120));
  };

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!beholdt.length && !filer.length) { alert("Velg DM-en (PDF) eller bilder av sidene."); return; }
    if (til < fra) { alert("Til-dato må være etter fra-dato."); return; }
    setJobber("Gjør klar sidene …");
    try {
      const sider = filer.length ? await filerTilSider(filer, setJobber) : [];
      if (beholdt.length + sider.length > MAKS_SIDER) sider.length = Math.max(0, MAKS_SIDER - beholdt.length);
      setJobber(`Laster opp ${sider.length} sider …`);
      const ok = await kjor(() => api.lagreKampanje({ id: k?.id, tittel: tittel.trim(), tekst: tekst.trim(), fra, til, lenke: lenke.trim() || null, sider: k?.sider ?? [] }, sider, fjern), k ? "Kampanjen er oppdatert" : "Kampanjen er lagt inn");
      if (ok) ferdig();
    } catch (err) {
      alert((err as Error).message || "Kunne ikke lese filen.");
    } finally { setJobber(null); }
  };

  return (
    <form className="kampanje-skjema" onSubmit={lagre}>
      <label className="field"><span className="label">{k ? "Legg til flere sider (PDF eller bilder)" : "DM-en (PDF) eller bilder av sidene"}</span>
        <input type="file" accept="application/pdf,image/*" multiple onChange={velgFiler} /></label>
      {k && beholdt.length > 0 && (
        <div className="kampanje-sider liten">
          {k.sider.map((s, i) => (
            <button type="button" key={s} className={`kampanje-side${fjern.includes(s) ? " fjernet" : ""}`} title={fjern.includes(s) ? "Angre" : "Fjern siden"}
              onClick={() => setFjern((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>
              {urler[s] ? <img src={urler[s]} alt={`Side ${i + 1}`} /> : <span className="kampanje-laster" />}
              <span className="kampanje-fjern">{fjern.includes(s) ? "↺" : "×"}</span>
            </button>
          ))}
        </div>
      )}
      <label className="field"><span className="label">Tittel</span>
        <input required maxLength={120} value={tittel} onChange={(e) => setTittel(e.target.value)} placeholder="F.eks. Kampanje DM 9 – Høstkupp" /></label>
      <div className="row">
        <label className="field"><span className="label">Vises fra</span><input type="date" required value={fra} onChange={(e) => setFra(e.target.value)} /></label>
        <label className="field"><span className="label">Til og med</span><input type="date" required value={til} onChange={(e) => setTil(e.target.value)} /></label>
      </div>
      <label className="field"><span className="label">Kort tekst (valgfritt)</span>
        <input maxLength={300} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="F.eks. Gode priser på HiKOKI og terrassebord – tips kundene!" /></label>
      <label className="field"><span className="label">Lenke (valgfritt)</span>
        <input type="url" value={lenke} onChange={(e) => setLenke(e.target.value)} placeholder="https://byggfag.no/…" /></label>
      {jobber && <p className="small">{jobber}</p>}
      <div className="row">
        <button className="btn primary" disabled={!!jobber}>{k ? "Lagre endringer" : "Legg inn kampanjen"}</button>
        <button type="button" className="btn" onClick={ferdig} disabled={!!jobber}>Avbryt</button>
      </div>
    </form>
  );
}
