import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api, nobbLenke, type FdvDok, type FdvVare } from "../lib/api";
import { langDato } from "../lib/ferie";
import { t2, type Prosjekt } from "../lib/timer";
import { delAdresse, eiendom, erSjekkliste, FAG, filnavn, klarForBoligmappa, lagZip, matrikkelTekst, sokKartverket, type BoligmappaEksport, type Eiendom, type KartverketTreff } from "../lib/boligmappa";

/** Sluttdokumentasjon til kunden: utført arbeid, tilleggsarbeid, bilder. Skrives ut eller lagres som PDF fra nettleseren. */
export function Sluttdok({ p }: { p: Prosjekt }) {
  const { d, idag, leder, kjor } = useApp();
  const [fdv, setFdv] = useState<{ varer: FdvVare[]; dok: FdvDok[] } | null>(null);
  const [medFdv, setMedFdv] = useState(true);
  const [visSkjulte, setVisSkjulte] = useState(false);
  const [laster, setLaster] = useState(false);
  const hentFdv = () => api.fdv(p.id).then(setFdv).catch(() => setFdv({ varer: [], dok: [] }));
  useEffect(() => { hentFdv(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fdvVarer = (fdv?.varer ?? []).filter((v) => !v.skjul);
  const lenke = (v: FdvVare) => v.fdv_url || (v.nobb_nr ? nobbLenke(v.nobb_nr) : "");
  const lastOpp = async (filer: FileList | null) => {
    if (!filer?.length) return;
    setLaster(true);
    await kjor(async () => { for (const f of Array.from(filer)) await api.lastOppFdv(p.id, f); }, filer.length > 1 ? `${filer.length} dokumenter lastet opp` : "Dokument lastet opp");
    setLaster(false); hentFdv();
  };
  const aapne = async (x: FdvDok, lastNed?: boolean) => {
    const vindu = window.open("", "_blank");
    try { const u = await api.dokUrl(x.sti, lastNed ? x.navn : undefined); if (vindu) vindu.location.href = u; else location.href = u; }
    catch { vindu?.close(); }
  };
  const skjul = (v: FdvVare, skjul: boolean) => kjor(() => api.lagreVare(v.varenr, { skjul })).then(hentFdv);
  const rettNobb = (v: FdvVare) => {
    const nr = window.prompt(`NOBB-nummer eller lenke til FDV for ${v.beskrivelse}`, v.fdv_url || v.nobb_nr);
    if (nr == null) return;
    const t = nr.trim();
    const endring = /^https?:\/\//i.test(t) ? { fdv_url: t } : { nobb_nr: t.replace(/\D/g, ""), fdv_url: "" };
    kjor(() => api.lagreVare(v.varenr, endring), "Lagret").then(hentFdv);
  };
  const [urler, setUrler] = useState<Record<string, string>>({});
  const [medTimer, setMedTimer] = useState(true);
  const [medBilder, setMedBilder] = useState(true);
  const [medDagbok, setMedDagbok] = useState(true);
  const [innledning, setInnledning] = useState("");
  const k = d.kunder.find((x) => x.id === p.kunde_id);
  const adr = p.adresse || [k?.adresse, [k?.postnr, k?.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const dagbok = [...d.dagbok.filter((x) => x.prosjekt_id === p.id)].sort((a, b) => a.dato.localeCompare(b.dato));
  const tillegg = d.tillegg.filter((x) => x.prosjekt_id === p.id && (x.status === "signert" || x.status === "fakturert"));
  const bilder = d.bilder.filter((b) => b.prosjekt_id === p.id && !b.avvik_id);
  const timer = d.timer.filter((t) => t.prosjekt_id === p.id && t.fakturerbar !== false);
  const sumT = timer.reduce((n, t) => n + Number(t.timer), 0);
  const datoer = timer.map((t) => t.dato).sort();
  const e = eiendom(p);

  useEffect(() => {
    if (bilder.length) api.bildeUrler(bilder.map((b) => b.sti)).then(setUrler).catch(() => {});
  }, [bilder.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section className="panel ikke-utskrift">
        <h2 style={{ margin: 0 }}>Sluttdokumentasjon</h2>
        <p className="small muted" style={{ margin: 0 }}>Dokumentasjon til kunden når jobben er ferdig. Trykk «Lagre som PDF» og velg «Lagre som PDF» som skriver, eller skriv ut direkte.</p>
        <label className="field"><span className="label">Innledning til kunden (valgfritt)</span>
          <textarea rows={2} value={innledning} onChange={(e) => setInnledning(e.target.value)} placeholder="F.eks. Takk for oppdraget! Her er en oppsummering av arbeidet vi har utført." /></label>
        <div className="row small">
          <label className="row"><input type="checkbox" checked={medDagbok} onChange={(e) => setMedDagbok(e.target.checked)} /> Utført arbeid (dagbok)</label>
          <label className="row"><input type="checkbox" checked={medTimer} onChange={(e) => setMedTimer(e.target.checked)} /> Timer</label>
          <label className="row"><input type="checkbox" checked={medBilder} onChange={(e) => setMedBilder(e.target.checked)} /> Bilder</label>
          <label className="row"><input type="checkbox" checked={medFdv} onChange={(e) => setMedFdv(e.target.checked)} /> FDV-dokumentasjon</label>
        </div>
        <div><button className="btn primary" onClick={() => window.print()}>Lagre som PDF / skriv ut</button></div>
      </section>

      <Boligmappa p={p} adr={adr} kunde={k?.navn ?? ""} fra={datoer[0] ?? null} til={datoer[datoer.length - 1] ?? null}
        dagbok={dagbok.map((x) => `${langDato(x.dato)}: ${x.tekst}`)} bilder={bilder} dok={fdv?.dok ?? []} varer={fdvVarer.map((v) => ({ tittel: v.beskrivelse, lenke: lenke(v) }))} innledning={innledning} />

      <section className="panel ikke-utskrift">
        <h3 style={{ margin: 0 }}>FDV-dokumentasjon</h3>
        <p className="small muted" style={{ margin: 0 }}>Varene hentes fra ordrene på prosjektet i Visma. Hver vare får lenke til NOBB, der FDV, produktdatablad og monteringsanvisning ligger under «Dokumentasjon». Last opp egne FDV-dokumenter (PDF) for det som ikke ligger i NOBB.</p>
        {!fdv ? <p className="small muted">Henter varer …</p> : (
          <>
            {fdv.varer.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ingen varer med NOBB-nummer på ordrene til dette prosjektet ennå.</p>}
            {fdv.varer.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl"><thead><tr><th>Vare</th><th>Antall</th><th>FDV</th>{leder && <th></th>}</tr></thead><tbody>
                  {fdv.varer.filter((v) => visSkjulte || !v.skjul).map((v) => (
                    <tr key={v.varenr} style={v.skjul ? { opacity: 0.5 } : undefined}>
                      <td style={{ whiteSpace: "normal" }}>{v.beskrivelse}<div className="small muted">NOBB {v.nobb_nr || "–"}</div></td>
                      <td>{t2(v.antall)} {v.enhet.toLowerCase()}</td>
                      <td>{lenke(v) ? <a href={lenke(v)} target="_blank" rel="noreferrer">Åpne</a> : <span className="muted">–</span>}</td>
                      {leder && <td className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <button className="btn sm" onClick={() => rettNobb(v)}>Rett</button>
                        <button className="btn sm" onClick={() => skjul(v, !v.skjul)}>{v.skjul ? "Vis" : "Skjul"}</button>
                      </td>}
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
            {fdv.varer.some((v) => v.skjul) && <label className="row small"><input type="checkbox" checked={visSkjulte} onChange={(e) => setVisSkjulte(e.target.checked)} /> Vis skjulte varer ({fdv.varer.filter((v) => v.skjul).length})</label>}
            <h4 style={{ margin: "8px 0 0" }}>Egne FDV-dokumenter</h4>
            {fdv.dok.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ingen lastet opp.</p>}
            {fdv.dok.map((x) => (
              <div key={x.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{x.navn}{x.storrelse ? <span className="small muted"> · {(x.storrelse / 1048576).toFixed(1).replace(".", ",")} MB</span> : null}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn sm" onClick={() => aapne(x)}>Åpne</button>
                  <button className="btn sm" onClick={() => aapne(x, true)}>Last ned</button>
                  <button className="btn sm no" onClick={() => kjor(() => api.slettFdv(x.id, x.sti), "Slettet").then(hentFdv)}>Slett</button>
                </span>
              </div>
            ))}
            <div><label className="btn sm">{laster ? "Laster opp …" : "Last opp FDV (PDF)"}
              <input type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden disabled={laster} onChange={(e) => { lastOpp(e.target.files); e.target.value = ""; }} /></label></div>
            <p className="small muted" style={{ margin: 0 }}>Tips: send kunden PDF-en av sluttdokumentasjonen sammen med de opplastede dokumentene. Lenkene til NOBB i PDF-en er klikkbare.</p>
          </>
        )}
      </section>

      <article className="panel utskrift">
        <header className="utskrift-topp">
          <div><div className="label">N L Austnes AS</div><h1 style={{ margin: "2px 0" }}>Sluttdokumentasjon</h1></div>
          <div className="small" style={{ textAlign: "right" }}>Larsnilsvegen 41, 6290 Haramsøy<br />Org.nr. 832 507 652<br />{langDato(idag)}</div>
        </header>
        <table className="tbl"><tbody>
          <tr><th>Prosjekt</th><td style={{ whiteSpace: "normal" }}>{p.visma_nr ? `${p.visma_nr} · ` : ""}{p.navn}</td></tr>
          {k && <tr><th>Kunde</th><td style={{ whiteSpace: "normal" }}>{k.navn}</td></tr>}
          {adr && <tr><th>Adresse</th><td style={{ whiteSpace: "normal" }}>{adr}{e.bruksenhet ? `, bruksenhet ${e.bruksenhet}` : ""}</td></tr>}
          {matrikkelTekst(e) && <tr><th>Eiendom</th><td style={{ whiteSpace: "normal" }}>{matrikkelTekst(e)}</td></tr>}
          <tr><th>Utførende</th><td style={{ whiteSpace: "normal" }}>N L Austnes AS (org.nr. 832 507 652) · {e.fag}</td></tr>
          {datoer.length > 0 && <tr><th>Utført</th><td>{langDato(datoer[0])} – {langDato(datoer[datoer.length - 1])}</td></tr>}
          {medTimer && sumT > 0 && <tr><th>Timer</th><td>{t2(sumT)}</td></tr>}
        </tbody></table>
        {innledning && <p style={{ whiteSpace: "pre-wrap" }}>{innledning}</p>}

        {medDagbok && dagbok.length > 0 && (
          <>
            <h2>Utført arbeid</h2>
            {dagbok.map((x) => <p key={x.id} style={{ margin: "0 0 6px" }}><b>{langDato(x.dato)}:</b> {x.tekst}</p>)}
          </>
        )}

        {tillegg.length > 0 && (
          <>
            <h2>Godkjent tilleggsarbeid</h2>
            {tillegg.map((x) => (
              <div key={x.id} style={{ marginBottom: 10, breakInside: "avoid" }}>
                <b>{x.tittel}</b>{x.beskrivelse ? ` – ${x.beskrivelse}` : ""}
                <div className="small">{[x.timer != null ? `${t2(x.timer)} t` : "", x.materiell].filter(Boolean).join(" · ")}</div>
                <div className="small">Godkjent av {x.signert_navn}{x.signert_tid ? ` ${new Date(x.signert_tid).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}` : ""}</div>
                {x.signatur && <img src={x.signatur} alt="Signatur" style={{ height: 50 }} />}
              </div>
            ))}
          </>
        )}

        {medBilder && bilder.length > 0 && (
          <>
            <h2>Bilder</h2>
            <div className="utskrift-bilder">
              {bilder.slice().reverse().map((b) => urler[b.sti] ? <figure key={b.id}><img src={urler[b.sti]} alt={b.tekst || "Bilde"} />{b.tekst && <figcaption className="small">{b.tekst}</figcaption>}</figure> : null)}
            </div>
          </>
        )}
        {medFdv && (fdvVarer.length > 0 || (fdv?.dok.length ?? 0) > 0) && (
          <>
            <h2>FDV-dokumentasjon</h2>
            <p className="small" style={{ margin: "0 0 6px" }}>Forvaltning, drift og vedlikehold for produktene som er brukt. Dokumentasjonen for hver vare ligger hos NOBB (fanen «Dokumentasjon» på lenken).</p>
            {fdvVarer.length > 0 && (
              <table className="tbl" style={{ breakInside: "auto" }}><thead><tr><th>Produkt</th><th>NOBB-nr</th><th>Antall</th><th>Dokumentasjon</th></tr></thead><tbody>
                {fdvVarer.map((v) => (
                  <tr key={v.varenr} style={{ breakInside: "avoid" }}>
                    <td style={{ whiteSpace: "normal" }}>{v.beskrivelse}</td>
                    <td>{v.nobb_nr}</td>
                    <td>{t2(v.antall)} {v.enhet.toLowerCase()}</td>
                    <td style={{ whiteSpace: "normal", wordBreak: "break-all" }}>{lenke(v) && <a href={lenke(v)}>{lenke(v).replace(/^https?:\/\/(www\.)?/, "")}</a>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
            {(fdv?.dok.length ?? 0) > 0 && (
              <>
                <h3 style={{ marginBottom: 4 }}>Vedlagte dokumenter</h3>
                <ul style={{ margin: 0 }}>{fdv!.dok.map((x) => <li key={x.id}>{x.navn}</li>)}</ul>
              </>
            )}
          </>
        )}
        <p className="small muted" style={{ marginTop: 16 }}>Spørsmål om arbeidet? Kontakt N L Austnes AS på 70 21 01 09.</p>
      </article>
    </>
  );
}

type BildeRad = { id: string; sti: string; tekst?: string | null; opprettet?: string };

/** Klargjøring for Boligmappa: eiendom (matrikkel), fag, sjekkliste og eksport av alt som skal inn. */
function Boligmappa({ p, adr, kunde, fra, til, dagbok, bilder, dok, varer, innledning }: {
  p: Prosjekt; adr: string; kunde: string; fra: string | null; til: string | null; dagbok: string[];
  bilder: BildeRad[]; dok: FdvDok[]; varer: { tittel: string; lenke: string }[]; innledning: string;
}) {
  const { leder, kjor } = useApp();
  const [e, setE] = useState<Eiendom>(eiendom(p));
  const [adresse, setAdresse] = useState(p.adresse || adr);
  const [treff, setTreff] = useState<KartverketTreff[] | null>(null);
  const [soker, setSoker] = useState(false);
  const [eksporterer, setEksporterer] = useState("");
  const [apen, setApen] = useState(false);
  const [feil, setFeil] = useState("");
  useEffect(() => { setE(eiendom(p)); setAdresse(p.adresse || adr); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const lagret = eiendom(p);
  const endret = JSON.stringify(e) !== JSON.stringify(lagret) || adresse !== (p.adresse || adr);
  const sjekklister = dok.filter((x) => erSjekkliste(x.navn)).length;
  const klar = klarForBoligmappa(lagret, p.adresse || adr, { dagbok: dagbok.length, bilder: bilder.length, fdv: dok.length - sjekklister + varer.length, sjekklister });
  const mangler = klar.filter((x) => x.krav && !x.ok);
  const sett = <K extends keyof Eiendom>(k: K, v: Eiendom[K]) => setE((x) => ({ ...x, [k]: v }));
  const nr = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\D/g, "")) || null);

  const sok = async () => {
    setSoker(true);
    try { setTreff(await sokKartverket(adresse)); } catch { setTreff([]); }
    setSoker(false);
  };
  const velg = (t: KartverketTreff) => {
    setE((x) => ({ ...x, kommunenr: t.kommunenr, kommune: t.kommune.charAt(0) + t.kommune.slice(1).toLowerCase(), gnr: t.gnr, bnr: t.bnr, fnr: t.fnr, snr: t.snr, bruksenhet: t.bruksenheter.length === 1 ? t.bruksenheter[0] : x.bruksenhet }));
    if (t.adresse) setAdresse(`${t.adresse}, ${t.postnr} ${t.poststed.charAt(0) + t.poststed.slice(1).toLowerCase()}`);
    setTreff(t.bruksenheter.length > 1 ? [t] : null);
  };
  const lagre = () => kjor(() => api.lagreEiendom(p.id, { ...e, adresse: adresse.trim() }), "Eiendom lagret");

  const eksporter = async () => {
    setEksporterer("Henter filer …"); setFeil("");
    try {
      const filer: { navn: string; data: Uint8Array }[] = [];
      const hent = async (u: string) => new Uint8Array(await (await fetch(u)).arrayBuffer());
      const dokumenter: BoligmappaEksport["dokumenter"] = [{ tittel: "Sluttdokumentasjon", type: "sluttdokumentasjon", fil: "Sluttdokumentasjon.pdf" }];
      const urler = bilder.length ? await api.bildeUrler(bilder.map((b) => b.sti)) : {};
      let i = 0;
      for (const b of bilder) {
        i++; setEksporterer(`Bilde ${i} av ${bilder.length} …`);
        if (!urler[b.sti]) continue;
        const navn = `bilder/${String(i).padStart(3, "0")}${b.sti.match(/\.\w+$/)?.[0] ?? ".jpg"}`;
        filer.push({ navn, data: await hent(urler[b.sti]) });
        dokumenter.push({ tittel: b.tekst || `Bilde ${i}`, type: "bilde", fil: navn, dato: b.opprettet?.slice(0, 10) });
      }
      i = 0;
      for (const x of dok) {
        i++; setEksporterer(`Dokument ${i} av ${dok.length} …`);
        const type = erSjekkliste(x.navn) ? "sjekkliste" : "fdv";
        const navn = `${type === "sjekkliste" ? "sjekklister" : "fdv"}/${filnavn(x.navn)}`;
        filer.push({ navn, data: await hent(await api.dokUrl(x.sti)) });
        dokumenter.push({ tittel: x.navn.replace(/\.\w+$/, ""), type, fil: navn, dato: x.opprettet?.slice(0, 10) });
      }
      for (const v of varer) if (v.lenke) dokumenter.push({ tittel: v.tittel, type: "produkt", lenke: v.lenke });
      const a = delAdresse(adresse || adr);
      const meta: BoligmappaEksport = {
        format: "bygglogg-boligmappa", versjon: 1, laget: new Date().toISOString(),
        utforende: { navn: "N L Austnes AS", orgnr: "832507652", fag: lagret.fag },
        eiendom: { ...a, kommunenr: lagret.kommunenr, kommune: lagret.kommune, gnr: lagret.gnr, bnr: lagret.bnr, fnr: lagret.fnr, snr: lagret.snr, bruksenhet: lagret.bruksenhet, boligmappe_nr: lagret.boligmappe_nr },
        prosjekt: { navn: p.navn, visma_nr: p.visma_nr, kunde, fra, til, beskrivelse: [innledning, ...dagbok].filter(Boolean).join("\n") },
        dokumenter,
      };
      filer.unshift({ navn: "boligmappa.json", data: new TextEncoder().encode(JSON.stringify(meta, null, 2)) });
      filer.push({ navn: "LES_MEG.txt", data: new TextEncoder().encode(
        `Dokumentasjon til Boligmappa\n\nEiendom: ${a.adresse}, ${a.postnr} ${a.poststed}\nMatrikkel: ${matrikkelTekst(lagret) || "(mangler)"}\nBruksenhet: ${lagret.bruksenhet || "-"}\nFag: ${lagret.fag}\nUtført: ${fra ?? ""} – ${til ?? ""}\n\n` +
        `Legg også ved Sluttdokumentasjon.pdf (lagres fra ByggLogg med «Lagre som PDF»).\nboligmappa.json inneholder alle opplysningene i maskinlesbar form.\n`) });
      const blob = new Blob([lagZip(filer) as BlobPart], { type: "application/zip" });
      const u = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = u; el.download = `Boligmappa_${filnavn(p.navn)}.zip`; el.click();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      setEksporterer("");
    } catch { setEksporterer(""); setFeil("Klarte ikke å hente alle filene. Prøv igjen."); }
  };

  return (
    <section className="panel ikke-utskrift">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Boligmappa</h3>
        <span className={`chip ${mangler.length ? "venter" : "godkjent"}`}>{mangler.length ? `Mangler ${mangler.length}` : "Klar"}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Boligmappa knytter dokumentasjonen til eiendommen (matrikkel og evt. bruksenhet) og merker den med fag. Fyll inn her, så kommer det med i PDF-en og i eksporten.</p>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {klar.map((x) => <li key={x.tekst} style={{ color: x.ok ? "var(--ok, #1a7f37)" : x.krav ? "var(--no, #b42318)" : undefined }}>{x.ok ? "✓" : x.krav ? "✗" : "–"} {x.tekst}{!x.krav && !x.ok ? " (anbefalt)" : ""}</li>)}
      </ul>
      {matrikkelTekst(lagret) && <p className="small" style={{ margin: 0 }}><b>Eiendom:</b> {matrikkelTekst(lagret)}{lagret.bruksenhet ? `, bruksenhet ${lagret.bruksenhet}` : ""} · {lagret.fag}</p>}
      {leder && <div><button className="btn sm" onClick={() => setApen(!apen)}>{apen ? "Skjul eiendom" : "Rediger eiendom"}</button></div>}
      {leder && apen && (
        <>
          <label className="field"><span className="label">Adresse</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input value={adresse} onChange={(x) => setAdresse(x.target.value)} placeholder="Gate 1, 6290 Haramsøy" style={{ flex: 1 }} />
              <button className="btn sm" disabled={soker || !adresse.trim()} onClick={sok}>{soker ? "Søker …" : "Hent fra Kartverket"}</button>
            </div></label>
          {treff && treff.length === 0 && <p className="small muted" style={{ margin: 0 }}>Fant ingen treff hos Kartverket. Fyll inn for hånd, eller prøv adressen uten postnummer.</p>}
          {treff && treff.length > 0 && (
            <div className="small" style={{ display: "grid", gap: 4 }}>
              {treff.length === 1 && treff[0].bruksenheter.length > 1 ? (
                <>
                  <span>Velg bruksenhet (leilighet):</span>
                  <div className="row">{treff[0].bruksenheter.map((b) => <button key={b} className="btn sm" onClick={() => { sett("bruksenhet", b); setTreff(null); }}>{b}</button>)}</div>
                </>
              ) : treff.map((t, n) => (
                <button key={n} className="btn sm" style={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => velg(t)}>
                  {t.adresse}, {t.postnr} {t.poststed} · {t.kommunenr} gnr. {t.gnr ?? "–"} / bnr. {t.bnr ?? "–"}{t.fnr ? ` / fnr. ${t.fnr}` : ""}{t.snr ? ` / snr. ${t.snr}` : ""}{t.bruksenheter.length ? ` · ${t.bruksenheter.length} bruksenhet${t.bruksenheter.length > 1 ? "er" : ""}` : ""}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ width: 90 }}><span className="label">Kommunenr</span><input value={e.kommunenr} inputMode="numeric" onChange={(x) => sett("kommunenr", x.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            <label className="field" style={{ width: 130 }}><span className="label">Kommune</span><input value={e.kommune} onChange={(x) => sett("kommune", x.target.value)} /></label>
            <label className="field" style={{ width: 70 }}><span className="label">Gnr</span><input value={e.gnr ?? ""} inputMode="numeric" onChange={(x) => sett("gnr", nr(x.target.value))} /></label>
            <label className="field" style={{ width: 70 }}><span className="label">Bnr</span><input value={e.bnr ?? ""} inputMode="numeric" onChange={(x) => sett("bnr", nr(x.target.value))} /></label>
            <label className="field" style={{ width: 70 }}><span className="label">Fnr</span><input value={e.fnr ?? ""} inputMode="numeric" onChange={(x) => sett("fnr", nr(x.target.value))} /></label>
            <label className="field" style={{ width: 70 }}><span className="label">Snr</span><input value={e.snr ?? ""} inputMode="numeric" onChange={(x) => sett("snr", nr(x.target.value))} /></label>
          </div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ width: 120 }}><span className="label">Bruksenhet</span><input value={e.bruksenhet} placeholder="H0101" onChange={(x) => sett("bruksenhet", x.target.value.toUpperCase().slice(0, 5))} /></label>
            <label className="field" style={{ width: 170 }}><span className="label">Fag</span>
              <select value={e.fag} onChange={(x) => sett("fag", x.target.value)}>{FAG.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label className="field" style={{ width: 170 }}><span className="label">Boligmappenummer (valgfritt)</span><input value={e.boligmappe_nr} onChange={(x) => sett("boligmappe_nr", x.target.value.trim())} /></label>
          </div>
          <div className="row"><button className="btn primary sm" disabled={!endret} onClick={lagre}>Lagre eiendom</button>
            <a className="small" href="https://seeiendom.kartverket.no/" target="_blank" rel="noreferrer">Sjekk på seeiendom.no</a></div>
        </>
      )}
      <div className="row">
        <button className="btn sm" disabled={!!eksporterer} onClick={eksporter}>{eksporterer || "Last ned pakke for Boligmappa (zip)"}</button>
      </div>
      {feil && <p className="small" style={{ margin: 0, color: "var(--warn)" }}>{feil}</p>}
      <p className="small muted" style={{ margin: 0 }}>Pakken inneholder bilder, FDV, sjekklister og en fil med alle opplysningene Boligmappa trenger. Legg PDF-en av sluttdokumentasjonen ved selv. Direkte sending til Boligmappa krever partneravtale med dem, og pakken er laget slik at det kan kobles på senere.</p>
    </section>
  );
}
