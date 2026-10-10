import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { sorterAnsatte, type Ansatt } from "../lib/ferie";
import { PLAGG, STANDARD_KVOTER, type Kvoter } from "../lib/utstyr";
import { foreslaKobling, importRader, lesSvenn, lesXlsx, svennProsjekter, type Kobling, type SvennProsjekt, type SvennRad } from "../lib/svenn";
import type { SvennResultat } from "../lib/api";

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

  return (
    <>
      <section className="panel">
        <h2>Ansatte</h2>
        <p className="small muted">Endringer lagres når du går ut av feltet. E-posten er den ansatte bruker for å logge inn. «Dager» er feriedager per år regnet mandag–fredag: 25 er 5 uker, 21 er lovens minimum. «Overført» er ferie avtalt flyttet fra {aar - 1} til {aar}.</p>
        <div className="staff">
          <div className="staff-row staff-head">
            <span>Navn</span><span>E-post</span><span>Avdeling</span><span>Rolle</span><span>Dager</span><span>Overført {aar}</span><span>Over 60</span><span>Aktiv</span>
          </div>
          {sorterAnsatte(d).map((a) => (
            <div key={`${a.id}-${a.navn}-${a.epost}-${overfort(a)}`} className={`staff-row${a.aktiv ? "" : " inaktiv"}`}>
              <span className="lbl" data-l="Navn">
                <input type="text" id={`navn-${a.id}`} aria-label="Navn" defaultValue={a.navn}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.navn) lagre(a, { navn: v }); }} />
              </span>
              <span className="lbl" data-l="E-post">
                <input type="email" id={`epost-${a.id}`} aria-label="E-post" defaultValue={a.epost ?? ""} placeholder="Mangler – kan ikke logge inn"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.epost ?? "")) lagre(a, { epost: v || null }); }} />
              </span>
              <span className="lbl" data-l="Avdeling">
                <select id={`avd-${a.id}`} aria-label="Avdeling" value={a.avdeling_id} onChange={(e) => lagre(a, { avdeling_id: Number(e.target.value) })}>
                  {d.avdelinger.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
                </select>
              </span>
              <span className="lbl" data-l="Rolle">
                <select id={`rolle-${a.id}`} aria-label="Rolle" value={a.rolle} onChange={(e) => lagre(a, { rolle: e.target.value as Ansatt["rolle"] })}>
                  <option value="ansatt">Ansatt</option><option value="leder">Leder</option>
                </select>
              </span>
              <span className="lbl" data-l="Dager">
                <select id={`dager-${a.id}`} aria-label="Feriedager" value={a.dager} onChange={(e) => lagre(a, { dager: Number(e.target.value) })}>
                  <option value={21}>21</option><option value={25}>25</option>
                </select>
              </span>
              <span className="lbl" data-l={`Overført ${aar}`}>
                <input type="number" id={`overfort-${a.id}`} aria-label={`Overført til ${aar}`} min={0} max={60} defaultValue={overfort(a)}
                  onBlur={(e) => { const v = Math.max(0, Math.min(60, Number(e.target.value) || 0)); if (v !== overfort(a)) kjor(() => api.lagreOverfort(a.id, aar, v), "Lagret"); }} />
              </span>
              <span className="lbl" data-l="Over 60">
                <input type="checkbox" id={`over60-${a.id}`} aria-label="Over 60 år" checked={a.over60} onChange={(e) => lagre(a, { over60: e.target.checked })} />
              </span>
              <span className="lbl" data-l="Aktiv">
                <input type="checkbox" id={`aktiv-${a.id}`} aria-label="Aktiv" checked={a.aktiv} onChange={(e) => lagre(a, { aktiv: e.target.checked })} />
              </span>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={leggTil} style={{ alignItems: "flex-end" }}>
          <label className="field"><span className="label">Ny ansatt</span>
            <input type="text" id="ny-navn" value={nyNavn} onChange={(e) => setNyNavn(e.target.value)} placeholder="Navn" />
          </label>
          <label className="field"><span className="label">E-post</span>
            <input type="email" id="ny-epost" value={nyEpost} onChange={(e) => setNyEpost(e.target.value)} placeholder="navn@austnes.no" />
          </label>
          <label className="field"><span className="label">Avdeling</span>
            <select id="ny-avd" value={nyAvd} onChange={(e) => setNyAvd(Number(e.target.value))}>
              {d.avdelinger.map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
            </select>
          </label>
          <button className="btn" disabled={!nyNavn.trim()}>Legg til</button>
        </form>
        <p className="small muted">Ansatte som slutter, setter du til ikke aktiv. Da forsvinner de fra kalenderen og mister tilgang, men historikken beholdes.</p>
      </section>

      <section className="panel">
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
      <section className="panel">
        <h2>Arbeidstid og lunsj</h2>
        <p className="small muted">Brukes i lønnsgrunnlaget. Overtid regnes når uka går over normaltiden. Ansatte med lunsjtrekk får lunsj trukket på dager over 5,5 timer der lunsj ikke er registrert. Ansattnr er det samme nummeret som i Svenn og følger med i lønnsfilene. «I timerapport» styrer hvem som telles i oversikten over kundetimer og interntid (snekkere og allround).</p>
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Ansatt</th><th>Ansattnr (Svenn)</th><th>Normaltid per uke</th><th>Lunsjtrekk</th><th>Lunsj (min)</th><th>I timerapport</th></tr></thead>
            <tbody>
              {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => (
                <tr key={`${a.id}-${a.normaltid_uke}-${a.lunsjtrekk}-${a.lunsj_min}-${a.i_timerapport}-${a.ansattnr}`}>
                  <td>{a.navn}</td>
                  <td><input type="text" inputMode="numeric" aria-label={`Ansattnr ${a.navn}`} style={{ width: 90 }} defaultValue={a.ansattnr ?? ""}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.ansattnr ?? "")) lagre(a, { ansattnr: v || null }); }} /></td>
                  <td><select aria-label={`Normaltid ${a.navn}`} value={String(a.normaltid_uke ?? 37.5)} onChange={(e) => lagre(a, { normaltid_uke: Number(e.target.value) })}>
                    <option value="37.5">37,5 timer</option><option value="40">40 timer</option></select></td>
                  <td><input type="checkbox" aria-label={`Lunsjtrekk ${a.navn}`} checked={!!a.lunsjtrekk} onChange={(e) => lagre(a, { lunsjtrekk: e.target.checked })} /></td>
                  <td><input type="number" aria-label={`Lunsj minutter ${a.navn}`} min={0} max={120} step={5} style={{ width: 80 }} defaultValue={a.lunsj_min ?? 30}
                    onBlur={(e) => { const v = Math.max(0, Math.min(120, Number(e.target.value) || 0)); if (v !== (a.lunsj_min ?? 30)) lagre(a, { lunsj_min: v }); }} /></td>
                  <td><input type="checkbox" aria-label={`I timerapport ${a.navn}`} checked={a.i_timerapport !== false} onChange={(e) => lagre(a, { i_timerapport: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <UtstyrOppsett lagre={lagre} />
      <SvennImport />
    </>
  );
}

/** Utstyrskonto per ansatt (prosjektet i Visma der verktøy og arbeidstøy føres) og grenser per år */
function UtstyrOppsett({ lagre }: { lagre: (a: Ansatt, e: Partial<Ansatt>) => Promise<boolean> }) {
  const { d, kjor } = useApp();
  const [kv, setKv] = useState<Kvoter>(() => structuredClone(d.utstyrGrenser?.kvoter ?? STANDARD_KVOTER));
  const sett = (type: string, felt: "antall" | "aar", v: number) => setKv((x) => ({ ...x, [type]: { ...(x[type] ?? { antall: 0, aar: 1 }), [felt]: v } }));
  const kontoer = d.prosjekter.filter((p) => /utstyr|verkt|arbeidskl|arbeidst/i.test(p.navn) || d.ansatte.some((a) => a.utstyr_prosjekt_id === p.id));
  return (
    <section className="panel">
      <h2>Utstyr: verktøy og arbeidstøy</h2>
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
      <div className="scroll" style={{ border: 0 }}>
        <table className="tbl">
          <thead><tr><th>Ansatt</th><th>Utstyrskonto i Visma</th></tr></thead>
          <tbody>
            {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => (
              <tr key={`${a.id}-${a.utstyr_prosjekt_id}`}>
                <td>{a.navn}</td>
                <td><select aria-label={`Utstyrskonto ${a.navn}`} value={a.utstyr_prosjekt_id ?? ""} onChange={(e) => lagre(a, { utstyr_prosjekt_id: e.target.value || null })}>
                  <option value="">Ingen</option>
                  {kontoer.map((p) => <option key={p.id} value={p.id} disabled={d.ansatte.some((x) => x.id !== a.id && x.utstyr_prosjekt_id === p.id)}>{p.visma_nr ? `${p.visma_nr} ` : ""}{p.navn}</option>)}
                </select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Mangler en konto i lista? Opprett prosjektet i Visma med «utstyr» eller «arbeidsklær» i navnet, så dukker det opp her innen et kvarter.</p>
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

  const velgFil = async (f: File | undefined) => {
    setFeil(""); setSvar(null); setFil(null);
    if (!f) return;
    try {
      const les = lesSvenn(await lesXlsx(await f.arrayBuffer()));
      if (!les.rader.length) throw new Error("Fant ingen timer i fila.");
      const lagret = new Map((await api.svennKoblinger()).map((k) => [k.nokkel, k]));
      setKob(Object.fromEntries(svennProsjekter(les.rader).map((p) => [p.nokkel, foreslaKobling(p, d.prosjekter, lagret, "N L Austnes AS")])));
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
    <section className="panel">
      <h2>Import fra Svenn</h2>
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
    </section>
  );
}
