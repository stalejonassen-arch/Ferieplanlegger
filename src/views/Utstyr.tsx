import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { api, nobbLenke } from "../lib/api";
import { kortDato, langDato, sorterAnsatte } from "../lib/ferie";
import { aarsforbruk, KATEGORI, kr, kvotestatus, nyttMotGammelt, STANDARD_KVOTER, STATUS, verdi, type Utstyr as U, type UtstyrKategori, type UtstyrStatus } from "../lib/utstyr";

type Filter = UtstyrKategori | "alle";

/** Verktøy, arbeidstøy og forbruk hver ansatt har tatt ut. Hentes fra utstyrskontoen i Visma. */
export function Utstyr() {
  const { d, meg, leder, idag, kjor } = useApp();
  const alle = d.utstyr ?? [];
  const g = d.utstyrGrenser ?? { arbeidstoy: null, verktoy: null, sammeMnd: 6 };
  const [hvemId, setHvemId] = useState(meg.id);
  const hvem = d.ansatte.find((a) => a.id === hvemId) ?? meg;
  const aar = Number(idag.slice(0, 4));
  const [filter, setFilter] = useState<Filter>("verktoy");
  const [visLevert, setVisLevert] = useState(false);
  const [aapen, setAapen] = useState<string | null>(null);
  const [ny, setNy] = useState(false);

  const egne = alle.filter((x) => x.ansatt_id === hvem.id);
  const sum = aarsforbruk(alle, hvem.id, aar);
  const kvoter = kvotestatus(alle, hvem.id, g.kvoter ?? STANDARD_KVOTER, idag);
  const bytter = nyttMotGammelt(alle, hvem.id);
  const konto = d.prosjekter.find((p) => p.id === hvem.utstyr_prosjekt_id);
  const antall = (k: UtstyrKategori) => egne.filter((x) => x.kategori === k).length;
  const vist = egne.filter((x) => (filter === "alle" || x.kategori === filter) && (visLevert || filter !== "verktoy" || !["levert", "tapt"].includes(x.status)));

  // Bilder (midlertidige lenker)
  const [urler, setUrler] = useState<Record<string, string>>({});
  const stier = useMemo(() => vist.map((x) => x.bilde_sti).filter((s): s is string => !!s), [vist]);
  useEffect(() => {
    const mangler = stier.filter((s) => !urler[s]);
    if (mangler.length) api.bildeUrler(mangler).then((u) => setUrler((x) => ({ ...x, ...u }))).catch(() => {});
  }, [stier.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {leder && (
        <div className="row">
          <label className="label" htmlFor="utstyr-for">Viser for</label>
          <select id="utstyr-for" value={hvemId} onChange={(e) => { setHvemId(e.target.value); setAapen(null); }}>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => <option key={a.id} value={a.id}>{a.id === meg.id ? `${a.navn} (meg)` : a.navn}</option>)}
          </select>
        </div>
      )}

      <section className="panel">
        <h2 style={{ margin: 0 }}>{hvem.id === meg.id ? "Mitt utstyr" : `Utstyr – ${hvem.navn}`} {aar}</h2>
        <div className="kvoter" aria-label="Kvoter for arbeidstøy og vernesko">
          {kvoter.map((k) => (
            <div key={k.type} className={`kvote${k.over ? " over" : k.fullt ? " full" : ""}`}>
              <span className="label">{k.navn}</span>
              <span className="v">{k.brukt}<small> / {k.maks}</small></span>
              <span className="prikker" aria-hidden="true">{Array.from({ length: Math.max(k.maks, k.brukt) }, (_, i) => <i key={i} className={i < k.brukt ? (i >= k.maks ? "o" : "b") : ""} />)}</span>
              <span className="small muted">{k.aar === 1 ? "siste 12 mnd" : `siste ${k.aar * 12} mnd`}{k.ledigFra ? ` · ny fra ${kortDato(k.ledigFra)}` : ""}</span>
            </div>
          ))}
        </div>
        {bytter.length > 0 && (
          <div className="bytte">
            <b>Nytt mot gammelt</b>
            {bytter.map(([gml, ny]) => (
              <div key={ny.id} className="row" style={{ justifyContent: "space-between" }}>
                <span className="small">Ny <b>{ny.beskrivelse.toLowerCase()}</b> {kortDato(ny.dato)} – har fra før {gml.beskrivelse.toLowerCase()} ({kortDato(gml.dato)}). Er den gamle levert inn?</span>
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn sm primary" onClick={() => kjor(async () => { await api.lagreUtstyr({ id: gml.id, status: "levert" }); await api.lagreUtstyr({ id: ny.id, bytte_avklart: true }); }, "Den gamle er merket levert inn")}>Ja, levert inn</button>
                  <button className="btn sm" onClick={() => kjor(async () => { await api.lagreUtstyr({ id: ny.id, bytte_avklart: true }); }, "Merket: beholder begge")}>Beholder begge</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="legend">
          <Maaler navn={`Arbeidstøy ${aar}`} sum={sum.arbeidstoy.sum} siste={sum.arbeidstoy.siste} uttak={sum.arbeidstoy.uttak} />
          <Maaler navn="Verneutstyr" sum={sum.verneutstyr.sum} siste={sum.verneutstyr.siste} uttak={sum.verneutstyr.uttak} />
          <Maaler navn="Verktøy" sum={sum.verktoy.sum} siste={sum.verktoy.siste} uttak={sum.verktoy.uttak} />
          <Maaler navn="Forbruk" sum={sum.forbruk.sum} siste={sum.forbruk.siste} uttak={sum.forbruk.uttak} />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {konto ? <>Hentes fra utstyrskontoen i Visma: <b>{konto.visma_nr} {konto.navn}</b>. Nye uttak kommer inn innen en time. Beløp er utsalgspris eks. mva.</>
            : <>{hvem.navn.split(" ")[0]} har ingen utstyrskonto i Visma ennå{leder ? " – velg den under Oppsett." : "."}</>}
{" "}Verneutstyr (hansker, briller, hørselvern o.l.) gis etter behov – vernesko har kvote.
        </p>
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="hurtig" role="tablist" aria-label="Kategori">
            {(["verktoy", "arbeidstoy", "verneutstyr", "forbruk"] as UtstyrKategori[]).map((k) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{KATEGORI[k]} ({antall(k)})</button>
            ))}
            <button type="button" aria-pressed={filter === "alle"} onClick={() => setFilter("alle")}>Alle ({egne.length})</button>
          </div>
          <button className="btn sm" onClick={() => setNy((v) => !v)}>{ny ? "Lukk" : "+ Registrer eget verktøy"}</button>
        </div>
        {filter === "verktoy" && egne.some((x) => ["levert", "tapt"].includes(x.status)) && (
          <label className="row small"><input type="checkbox" checked={visLevert} onChange={(e) => setVisLevert(e.target.checked)} /> Vis også levert inn og tapt</label>
        )}
        {ny && <NyttVerktoy ansattId={hvem.id} lukk={() => setNy(false)} />}
        {vist.length === 0 ? <p className="small muted">Ingenting registrert her.</p> : (
          <div className="list">
            {vist.map((x) => (
              <div key={x.id} className={`item${x.kategori === "verktoy" ? " godkjent" : x.kategori === "arbeidstoy" || x.kategori === "verneutstyr" ? " venter" : ""}`}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                  {x.bilde_sti && urler[x.bilde_sti] && <img src={urler[x.bilde_sti]} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, flex: "none" }} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{x.beskrivelse}</div>
                    <div className="s">
                      {langDato(x.dato)}{x.antall !== 1 ? ` · ${x.antall} ${x.enhet.toLowerCase()}` : ""}{x.pris ? ` · ${kr(verdi(x))}` : ""}
                      {x.nobb_nr && <> · <a href={nobbLenke(x.nobb_nr)} target="_blank" rel="noreferrer">NOBB {x.nobb_nr}</a></>}
                      {x.serienr && ` · SN ${x.serienr}`}{x.kilde === "manuell" ? " · registrert i appen" : ""}
                    </div>
                  </div>
                </div>
                <div className="acts">
                  {x.kategori === "verktoy" && x.status !== "i_bruk" && <span className={`chip ${x.status === "tapt" ? "avslatt" : "venter"}`}>{STATUS[x.status]}</span>}
                  {filter === "alle" && <span className="chip demo">{KATEGORI[x.kategori]}</span>}
                  <button className="btn sm" aria-expanded={aapen === x.id} onClick={() => setAapen(aapen === x.id ? null : x.id)}>{aapen === x.id ? "Lukk" : "Detaljer"}</button>
                </div>
                {aapen === x.id && <Detaljer u={x} leder={leder} kjor={kjor} lukk={() => setAapen(null)} url={x.bilde_sti ? urler[x.bilde_sti] : undefined} />}
              </div>
            ))}
          </div>
        )}
      </section>

      {leder && <Oversikt aar={aar} velg={(id) => { setHvemId(id); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </>
  );
}

function Maaler({ navn, sum, siste, uttak }: { navn: string; sum: number; siste: string | null; uttak: number }) {
  return (
    <div>
      <span className="label">{navn}</span>
      <span className="v" style={{ fontSize: 20 }}>{kr(sum)}</span>
      <span className="small muted">{uttak ? `${uttak} uttak · sist ${kortDato(siste!)}` : "Ingen uttak"}</span>
    </div>
  );
}

function Detaljer({ u, leder, kjor, lukk, url }: { u: U; leder: boolean; kjor: ReturnType<typeof useApp>["kjor"]; lukk: () => void; url?: string }) {
  const [serienr, setSerienr] = useState(u.serienr);
  const [status, setStatus] = useState<UtstyrStatus>(u.status);
  const [merknad, setMerknad] = useState(u.merknad);
  const [kategori, setKategori] = useState<UtstyrKategori>(u.kategori);
  const [nobb, setNobb] = useState(u.nobb_nr);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    const endring: Partial<U> & { id: string } = { id: u.id, serienr: serienr.trim(), status, merknad: merknad.trim() };
    if (leder && kategori !== u.kategori) endring.kategori = kategori;
    if (u.kilde === "manuell" || leder) endring.nobb_nr = nobb.replace(/\D/g, "");
    if (await kjor(async () => { await api.lagreUtstyr(endring); }, "Lagret")) lukk();
  };
  return (
    <form className="full" onSubmit={lagre}>
      {url && <img src={url} alt={u.beskrivelse} style={{ maxWidth: 260, maxHeight: 200, objectFit: "contain", borderRadius: 6, border: "1px solid var(--line)" }} />}
      <label className="btn sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
        {u.bilde_sti ? "Bytt bilde" : "Ta bilde"}
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) kjor(() => api.utstyrBilde(u.id, f, u.bilde_sti), "Bildet er lagret"); e.target.value = ""; }} />
      </label>
      <div className="row">
        <label className="field"><span className="label">Serienummer</span>
          <input type="text" value={serienr} onChange={(e) => setSerienr(e.target.value)} placeholder="Står på typeskiltet" /></label>
        {u.kategori === "verktoy" && (
          <label className="field kort"><span className="label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as UtstyrStatus)}>
              {(Object.keys(STATUS) as UtstyrStatus[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select></label>
        )}
        {leder && (
          <label className="field kort"><span className="label">Kategori</span>
            <select value={kategori} onChange={(e) => setKategori(e.target.value as UtstyrKategori)}>
              {(Object.keys(KATEGORI) as UtstyrKategori[]).map((k) => <option key={k} value={k}>{KATEGORI[k]}</option>)}
            </select></label>
        )}
        {(u.kilde === "manuell" || leder) && (
          <label className="field kort"><span className="label">NOBB-nr</span>
            <input type="text" inputMode="numeric" value={nobb} onChange={(e) => setNobb(e.target.value)} /></label>
        )}
      </div>
      <label className="field"><span className="label">Merknad</span>
        <input type="text" value={merknad} onChange={(e) => setMerknad(e.target.value)} placeholder="F.eks. lånt ut til Dawid, sendt på service" /></label>
      <div className="row">
        <button className="btn primary sm">Lagre</button>
        {u.nobb_nr && <a className="btn sm" href={nobbLenke(u.nobb_nr)} target="_blank" rel="noreferrer">Produktinfo og dokumentasjon (NOBB)</a>}
        {u.kilde === "manuell" && <button type="button" className="btn sm no" onClick={() => window.confirm("Slette registreringen?") && kjor(() => api.slettUtstyr(u.id, u.bilde_sti), "Slettet")}>Slett</button>}
      </div>
      {u.kilde === "visma" && <p className="small muted" style={{ margin: 0 }}>Hentet fra Visma, ordre {u.visma_ordrenr}.{u.kategori_manuell ? " Kategorien er rettet av leder." : ""}</p>}
    </form>
  );
}

/** Verktøy som ikke er tatt ut via Visma (eget, eldre eller kjøpt et annet sted) */
function NyttVerktoy({ ansattId, lukk }: { ansattId: string; lukk: () => void }) {
  const { kjor, idag } = useApp();
  const [f, setF] = useState({ beskrivelse: "", nobb: "", serienr: "", kategori: "verktoy" as UtstyrKategori, dato: idag });
  const [bilde, setBilde] = useState<File | null>(null);
  const lagre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.beskrivelse.trim()) return;
    const ok = await kjor(async () => {
      const id = await api.lagreUtstyr({ ansatt_id: ansattId, beskrivelse: f.beskrivelse.trim(), nobb_nr: f.nobb.replace(/\D/g, ""), serienr: f.serienr.trim(), kategori: f.kategori, dato: f.dato });
      if (bilde) await api.utstyrBilde(id, bilde, null);
    }, "Registrert");
    if (ok) lukk();
  };
  return (
    <form className="panel" style={{ background: "var(--sunk)" }} onSubmit={lagre}>
      <div className="row">
        <label className="field"><span className="label">Hva er det</span>
          <input type="text" value={f.beskrivelse} onChange={(e) => setF({ ...f, beskrivelse: e.target.value })} placeholder="F.eks. HiKOKI kombihammer DH36DPA" autoFocus /></label>
        <label className="field kort"><span className="label">NOBB-nr (valgfritt)</span>
          <input type="text" inputMode="numeric" value={f.nobb} onChange={(e) => setF({ ...f, nobb: e.target.value })} /></label>
      </div>
      <div className="row">
        <label className="field"><span className="label">Serienummer</span>
          <input type="text" value={f.serienr} onChange={(e) => setF({ ...f, serienr: e.target.value })} /></label>
        <label className="field kort"><span className="label">Kategori</span>
          <select value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value as UtstyrKategori })}>
            <option value="verktoy">Verktøy</option><option value="arbeidstoy">Arbeidstøy</option><option value="verneutstyr">Verneutstyr</option>
          </select></label>
        <label className="field kort"><span className="label">Fått dato</span>
          <input type="date" value={f.dato} onChange={(e) => setF({ ...f, dato: e.target.value })} /></label>
      </div>
      <label className="btn sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
        {bilde ? `Bilde: ${bilde.name}` : "Ta bilde"}
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setBilde(e.target.files?.[0] ?? null)} />
      </label>
      <div className="row"><button className="btn primary" disabled={!f.beskrivelse.trim()}>Registrer</button><button type="button" className="btn" onClick={lukk}>Avbryt</button></div>
    </form>
  );
}

/** Leder: alle ansatte – forbruk i år, kvoter som er brukt opp og verktøybytter som ikke er avklart */
function Oversikt({ aar, velg }: { aar: number; velg: (id: string) => void }) {
  const { d, idag } = useApp();
  const alle = d.utstyr ?? [];
  const kv = d.utstyrGrenser?.kvoter ?? STANDARD_KVOTER;
  return (
    <section className="panel">
      <h2 style={{ margin: 0 }}>Alle ansatte {aar}</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl"><thead><tr><th>Ansatt</th><th>Arbeidstøy</th><th>Verneutstyr</th><th>Verktøy</th><th>Forbruk</th><th>Kvote brukt opp</th><th>Bytte ikke avklart</th></tr></thead><tbody>
          {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => {
            const s = aarsforbruk(alle, a.id, aar);
            const fulle = kvotestatus(alle, a.id, kv, idag).filter((k) => k.fullt);
            const bytter = nyttMotGammelt(alle, a.id).length;
            return (
              <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => velg(a.id)}>
                <td><button className="btn sm" style={{ border: 0, background: "none", padding: 0, textDecoration: "underline" }}>{a.navn}</button>{!a.utstyr_prosjekt_id && <span className="small muted"> · ingen konto</span>}</td>
                <td>{s.arbeidstoy.sum ? kr(s.arbeidstoy.sum) : ""}</td>
                <td>{s.verneutstyr.sum ? kr(s.verneutstyr.sum) : ""}</td>
                <td>{s.verktoy.sum ? kr(s.verktoy.sum) : ""}</td>
                <td>{s.forbruk.sum ? kr(s.forbruk.sum) : ""}</td>
                <td>{fulle.map((k) => <span key={k.type} style={k.over ? { color: "var(--warn)", fontWeight: 600 } : undefined}>{k.navn.toLowerCase()} {k.brukt}/{k.maks}{" "}</span>)}</td>
                <td>{bytter || ""}</td>
              </tr>
            );
          })}
        </tbody></table>
      </div>
    </section>
  );
}
