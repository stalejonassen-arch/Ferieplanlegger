import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api, type DokKategori, type FdvDok } from "../lib/api";
import { kortDato, langDato } from "../lib/ferie";
import { t2, type Prosjekt } from "../lib/timer";

// ------------------------------------------------------------ Dokumenter

export const DOK_KATEGORI: Record<DokKategori, string> = {
  fdv: "FDV og produktdokumentasjon", sjekkliste: "Sjekklister og egenkontroll", tegning: "Tegninger og beskrivelser",
  kontrakt: "Tilbud og kontrakt", annet: "Annet",
};
const TIL_KUNDEN: DokKategori[] = ["fdv", "sjekkliste", "tegning"];
const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : "");

/** Alle filer på prosjektet, sortert i kategorier. FDV, sjekklister og tegninger følger sluttdokumentasjonen til kunden. */
export function Dokumenter({ p, onEndret }: { p: Prosjekt; onEndret?: (antall: number) => void }) {
  const { leder, meg, kjor } = useApp();
  const [dok, setDok] = useState<FdvDok[] | null>(null);
  const [kategori, setKategori] = useState<DokKategori>("fdv");
  const [laster, setLaster] = useState(0);
  const hent = () => api.fdv(p.id).then((x) => { setDok(x.dok); onEndret?.(x.dok.length); }).catch(() => setDok([]));
  useEffect(() => { hent(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastOpp = async (filer: FileList | null) => {
    if (!filer?.length) return;
    const liste = Array.from(filer);
    setLaster(liste.length);
    await kjor(async () => {
      for (const f of liste) { await api.lastOppFdv(p.id, f, undefined, kategori); setLaster((n) => n - 1); }
    }, liste.length > 1 ? `${liste.length} dokumenter lastet opp` : "Dokumentet er lastet opp");
    setLaster(0); hent();
  };
  const aapne = async (x: FdvDok, lastNed?: boolean) => {
    const vindu = window.open("", "_blank");
    try { const u = await api.dokUrl(x.sti, lastNed ? x.navn : undefined); if (vindu) vindu.location.href = u; else location.href = u; }
    catch { vindu?.close(); }
  };
  const flytt = (x: FdvDok, k: DokKategori) => kjor(() => api.settDokKategori(x.id, k), "Flyttet").then(hent);
  const slett = (x: FdvDok) => kjor(() => api.slettFdv(x.id, x.sti), "Slettet").then(hent);

  const grupper = (Object.keys(DOK_KATEGORI) as DokKategori[]).map((k) => [k, (dok ?? []).filter((x) => (x.kategori ?? "fdv") === k)] as const);

  return (
    <>
      <section className="panel">
        <h2>Dokumenter</h2>
        <p className="small muted">Last opp PDF, bilder, Word eller Excel. FDV, sjekklister og tegninger kommer med i sluttdokumentasjonen til kunden. Tilbud, kontrakt og annet blir værende internt.</p>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 220px" }}><span className="label">Hva slags dokument</span>
            <select value={kategori} onChange={(e) => setKategori(e.target.value as DokKategori)}>
              {(Object.keys(DOK_KATEGORI) as DokKategori[]).map((k) => <option key={k} value={k}>{DOK_KATEGORI[k]}</option>)}
            </select></label>
          <label className="btn primary" style={{ flex: "none" }}>{laster ? `Laster opp … ${laster} igjen` : "Last opp filer"}
            <input type="file" multiple hidden disabled={!!laster}
              accept="application/pdf,image/jpeg,image/png,.doc,.docx,.xls,.xlsx"
              onChange={(e) => { lastOpp(e.target.files); e.target.value = ""; }} /></label>
        </div>
      </section>

      {!dok ? <div className="empty">Henter dokumenter …</div> : dok.length === 0 ? (
        <div className="empty">Ingen dokumenter på prosjektet ennå. Velg type og trykk «Last opp filer».</div>
      ) : grupper.filter(([, liste]) => liste.length > 0).map(([k, liste]) => (
        <section key={k} className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>{DOK_KATEGORI[k]} <span className="small muted">({liste.length})</span></h3>
            <span className="small muted">{TIL_KUNDEN.includes(k) ? "Følger sluttdokumentasjonen" : "Kun internt"}</span>
          </div>
          <div className="list">
            {liste.map((x) => {
              const kanEndre = leder || x.ansatt_id === meg?.id;
              return (
                <div key={x.id} className="item dok">
                  <div style={{ minWidth: 0 }}>
                    <div className="t" style={{ overflowWrap: "anywhere" }}>{x.navn}</div>
                    <div className="s">{[kortDato(x.opprettet.slice(0, 10)), mb(x.storrelse)].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="acts">
                    <button className="btn sm" onClick={() => aapne(x)}>Åpne</button>
                    <button className="btn sm" onClick={() => aapne(x, true)}>Last ned</button>
                    {kanEndre && (
                      <select className="sm" aria-label="Flytt til kategori" value={x.kategori ?? "fdv"} onChange={(e) => flytt(x, e.target.value as DokKategori)}>
                        {(Object.keys(DOK_KATEGORI) as DokKategori[]).map((kk) => <option key={kk} value={kk}>{DOK_KATEGORI[kk]}</option>)}
                      </select>
                    )}
                    {kanEndre && <button className="btn sm no" onClick={() => slett(x)}>Slett</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

// ------------------------------------------------------------ Statistikk

const isoUke = (dato: string) => {
  const d = new Date(dato + "T00:00:00Z");
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag + 3);
  const forste = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const uke = 1 + Math.round(((d.getTime() - forste.getTime()) / 86400000 - 3 + ((forste.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-${String(uke).padStart(2, "0")}`;
};
const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

/** Nøkkeltall for prosjektet: timer per person og over tid, aktivitet og fremdrift mot kalkyle. */
export function Statistikk({ p }: { p: Prosjekt }) {
  const { d, leder } = useApp();
  const timer = d.timer.filter((t) => t.prosjekt_id === p.id);
  if (!timer.length) return <section className="panel"><h2>Statistikk</h2><p className="muted">Ingen timer på prosjektet ennå.</p></section>;

  const sum = timer.reduce((n, t) => n + Number(t.timer), 0);
  const fakt = timer.filter((t) => t.fakturerbar !== false).reduce((n, t) => n + Number(t.timer), 0);
  const dager = new Set(timer.map((t) => t.dato));
  const datoer = [...dager].sort();
  const personer = new Map<string, number>();
  for (const t of timer) personer.set(t.ansatt_id, (personer.get(t.ansatt_id) ?? 0) + Number(t.timer));
  const perPerson = [...personer].sort((a, b) => b[1] - a[1]);
  const maksPerson = perPerson[0]?.[1] ?? 1;
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "Ukjent";

  // Over tid: per uke hvis prosjektet varer under et halvt år, ellers per måned
  const spennDager = (new Date(datoer[datoer.length - 1]).getTime() - new Date(datoer[0]).getTime()) / 86400000;
  const perUke = spennDager <= 182;
  const nokkel = (dato: string) => (perUke ? isoUke(dato) : dato.slice(0, 7));
  const tid = new Map<string, number>();
  if (perUke) {
    for (let x = new Date(datoer[0] + "T00:00:00Z"); x <= new Date(datoer[datoer.length - 1] + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 7)) tid.set(isoUke(x.toISOString().slice(0, 10)), 0);
    tid.set(isoUke(datoer[datoer.length - 1]), tid.get(isoUke(datoer[datoer.length - 1])) ?? 0);
  } else {
    for (let x = new Date(datoer[0].slice(0, 7) + "-01T00:00:00Z"); x <= new Date(datoer[datoer.length - 1] + "T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1)) tid.set(x.toISOString().slice(0, 7), 0);
  }
  for (const t of timer) tid.set(nokkel(t.dato), (tid.get(nokkel(t.dato)) ?? 0) + Number(t.timer));
  const perioder = [...tid].sort((a, b) => a[0].localeCompare(b[0]));
  const maksPeriode = Math.max(1, ...perioder.map(([, n]) => n));
  const etikett = (k: string) => (perUke ? `u${Number(k.slice(5))}` : `${MND[Number(k.slice(5, 7)) - 1]}${k.slice(2, 4) !== datoer[0].slice(2, 4) ? " " + k.slice(2, 4) : ""}`);

  const est = p.estimert_timer ? Number(p.estimert_timer) : null;
  const tillegg = d.tillegg.filter((t) => t.prosjekt_id === p.id && (t.status === "signert" || t.status === "fakturert"));
  const tilleggT = tillegg.reduce((n, t) => n + (t.timer ?? 0), 0);
  const ramme = est != null ? est + tilleggT : null;
  const avvik = d.avvik.filter((x) => x.prosjekt_id === p.id);
  const fakturert = leder ? (d.fakturerteTimer ?? []).filter((f) => f.prosjekt_id === p.id) : [];
  const faktSum = fakturert.reduce((n, f) => n + Number(f.fakturert), 0);
  const aapent = fakturert.reduce((n, f) => n + Number(f.ikke_fakturert), 0);

  return (
    <>
      <section className="panel">
        <h2>Statistikk</h2>
        <p className="small muted">{langDato(datoer[0])} – {langDato(datoer[datoer.length - 1])} · {dager.size} arbeidsdager</p>
        <div className="legend">
          <div><span className="label">Timer totalt</span><span className="v">{t2(sum)}</span></div>
          <div><span className="label">Fakturerbart</span><span className="v">{t2(fakt)}</span></div>
          <div><span className="label">Ikke fakturerbart</span><span className="v">{t2(sum - fakt)}</span></div>
          <div><span className="label">Snitt per dag</span><span className="v">{t2(sum / dager.size)}</span></div>
          <div><span className="label">Personer</span><span className="v">{personer.size}</span></div>
          {ramme != null && <div><span className="label">Av kalkyle</span><span className="v" style={sum > ramme ? { color: "var(--warn)" } : undefined}>{Math.round((sum / ramme) * 100)} %</span></div>}
          {leder && fakturert.length > 0 && <div><span className="label">Fakturert i Visma</span><span className="v">{t2(faktSum)}</span></div>}
          {leder && aapent > 0 && <div><span className="label">På åpne ordrer</span><span className="v">{t2(aapent)}</span></div>}
        </div>
      </section>

      <section className="panel">
        <h3>Timer {perUke ? "per uke" : "per måned"}</h3>
        <div className="stolper" style={{ gridTemplateColumns: `repeat(${perioder.length}, minmax(14px, 1fr))` }}>
          {perioder.map(([k, n]) => (
            <div key={k} className="stolpe" title={`${etikett(k)}: ${t2(n)} t`}>
              <span className="n">{n ? t2(n) : ""}</span>
              <i style={{ height: `${(n / maksPeriode) * 100}%` }} />
              <span className="e">{etikett(k)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Timer per person</h3>
        <div className="hbar">
          {perPerson.map(([id, n]) => (
            <div key={id} className="hbar-rad">
              <span className="navn">{navn(id)}</span>
              <span className="spor"><i style={{ width: `${(n / maksPerson) * 100}%` }} /></span>
              <span className="tall">{t2(n)} t</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Aktivitet</h3>
        <div className="legend">
          <div><span className="label">Dagbok</span><span className="v">{d.dagbok.filter((x) => x.prosjekt_id === p.id).length}</span></div>
          <div><span className="label">Bilder</span><span className="v">{d.bilder.filter((x) => x.prosjekt_id === p.id).length}</span></div>
          <div><span className="label">Avvik åpne / lukket</span><span className="v">{avvik.filter((x) => x.status !== "lukket").length} / {avvik.filter((x) => x.status === "lukket").length}</span></div>
          <div><span className="label">Godkjente tillegg</span><span className="v">{tillegg.length}{tilleggT ? <small className="muted"> · {t2(tilleggT)} t</small> : null}</span></div>
        </div>
      </section>
    </>
  );
}
