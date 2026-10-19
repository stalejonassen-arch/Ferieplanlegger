// «Kom i gang» for leder i en ny bedrift: regnskapet kobles, ansatte hentes fra regnskapet og inviteres,
// og leder ser hva som gjenstår. Mest mulig skjer av seg selv; leder trykker bare der det trengs et valg.
import { useEffect, useState } from "react";
import { useApp } from "../App";
import { api, type AnsattForslag, type TripletexStatus, type VismaStatus } from "../lib/api";

const hopp = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function KomIGang() {
  const { d, kjor } = useApp();
  const [visma, setVisma] = useState<VismaStatus | null>(null);
  const [tx, setTx] = useState<TripletexStatus | null>(null);
  const [forslag, setForslag] = useState<AnsattForslag[]>([]);
  const [valgt, setValgt] = useState<Set<string>>(new Set());
  const [inn, setInn] = useState<{ ansatt_id: string; invitert: string | null; innlogget: string | null }[]>([]);
  const [push, setPush] = useState<number | null>(null);
  const [apen, setApen] = useState<boolean | null>(null);
  const [jobber, setJobber] = useState(false);

  const last = async () => {
    const [v, t, f, i, p] = await Promise.all([api.vismaKobling(), api.tripletexStatus().catch(() => null), api.ansattForslag(), api.ansatteInnlogging(), api.ansatteMedPush()]);
    setVisma(v); setTx(t); setForslag(f); setInn(i); setPush(p.length);
    setValgt(new Set(f.map((x) => `${x.kilde}:${x.ekstern_id}`)));
  };
  useEffect(() => { last().catch(() => {}); }, [d.ansatte.length]);
  // Mens Visma søkes etter: se etter svar hvert 5. sekund i to minutter
  const [venter, setVenter] = useState(0);
  useEffect(() => {
    if (!venter) return;
    const t = setTimeout(() => { last().catch(() => {}); setVenter((n) => (n > 24 ? 0 : n + 1)); }, 5000);
    return () => clearTimeout(t);
  }, [venter]);
  useEffect(() => { if (venter && visma?.koblet && visma.kunder > 0) setVenter(0); }, [visma, venter]);

  if (!visma) return null;
  const aktive = d.ansatte.filter((a) => a.aktiv);
  const medEpost = aktive.filter((a) => a.epost);
  const innlogget = new Set(inn.filter((x) => x.innlogget).map((x) => x.ansatt_id));
  const mangler = medEpost.filter((a) => !innlogget.has(a.id));
  const regnskapOk = visma.koblet || !!(tx?.aktiv && tx.har_nokkel);
  const steg = [
    { ok: regnskapOk, tekst: "Regnskap koblet" },
    { ok: forslag.length === 0 && aktive.length > 1, tekst: "Ansatte lagt inn" },
    { ok: medEpost.length > 0 && mangler.length === 0, tekst: "Alle har logget inn" },
    { ok: !!d.logo, tekst: "Logo og farger" },
    { ok: push !== null && push >= Math.ceil(aktive.length / 2), tekst: "Varsler på telefonene" },
  ];
  const ferdig = steg.filter((s) => s.ok).length;
  const vis = apen ?? ferdig < steg.length;

  const sjekkVisma = async () => { if (await kjor(() => api.kobleVisma(), "Ser etter firmaet i Visma …")) { setVenter(1); last(); } };
  const leggTil = async (inviter: boolean) => {
    setJobber(true);
    let n = 0;
    for (const kilde of ["visma", "tripletex"] as const) {
      const ider = forslag.filter((f) => f.kilde === kilde && valgt.has(`${kilde}:${f.ekstern_id}`)).map((f) => f.ekstern_id);
      if (ider.length) await kjor(async () => { n += await api.leggTilForslag(kilde, ider, inviter); });
    }
    if (n) await kjor(async () => {}, `${n} ${n === 1 ? "ansatt" : "ansatte"} lagt til${inviter ? ". Invitasjon sendt til de med e-post" : ""}`);
    setJobber(false); last();
  };
  const inviterAlle = async () => {
    setJobber(true);
    let n = 0;
    await kjor(async () => { n = await api.inviterAlleSomMangler(); });
    await kjor(async () => {}, n ? `Invitasjon sendt til ${n}` : "Alle har fått invitasjon siste døgn");
    setJobber(false); last();
  };

  return (
    <section className="panel kom-i-gang" id="kom-i-gang">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Kom i gang</h2>
        <button type="button" className="linkbtn small" onClick={() => setApen(!vis)}>
          {ferdig === steg.length ? "Alt er satt opp ✓" : `${ferdig} av ${steg.length} ferdig`} {vis ? "▴" : "▾"}
        </button>
      </div>
      {vis && (
        <>
          <ol className="kig-steg">
            {steg.map((s) => <li key={s.tekst} className={s.ok ? "ok" : ""}><span aria-hidden="true">{s.ok ? "✓" : "○"}</span> {s.tekst}</li>)}
          </ol>

          <h3>1. Regnskap</h3>
          {visma.koblet ? (
            <p className="small">✓ Koblet til <b>{visma.firma || "Visma Business NXT"}</b>. {visma.status}</p>
          ) : tx?.aktiv && tx.har_nokkel ? (
            <p className="small">✓ Koblet til <b>Tripletex</b>. {tx.status}</p>
          ) : (
            <div className="kig-valg">
              <div>
                <b>Visma Business NXT</b>
                <ol className="small">
                  <li>Be den som er administrator i Visma om å godkjenne integrasjonen <b>«ByggLogg»</b> for firmaet (lesetilgang). Visma-partneren deres kan hjelpe med dette.</li>
                  <li>Trykk «Sjekk nå». ByggLogg finner firmaet ut fra org.nr. {visma.orgnr ? <b>{visma.orgnr}</b> : <><b>(mangler –</b> <button type="button" className="linkbtn" onClick={() => hopp("bedriftsprofil")}>legg det inn i bedriftsprofilen</button><b>)</b></>} og henter kunder, prosjekter og ansatte.</li>
                </ol>
                <p className="small muted">Glemmer dere å trykke, kobles det av seg selv innen et kvarter etter godkjenningen.</p>
                {visma.status && <p className="small">{visma.status}</p>}
                <button type="button" className="btn primary sm" disabled={!visma.orgnr || venter > 0} onClick={sjekkVisma}>{venter ? "Ser etter firmaet …" : "Sjekk nå"}</button>
              </div>
              <div>
                <b>Tripletex</b>
                <p className="small">Lag en ansattnøkkel i Tripletex og lim den inn under «Tripletex» lenger ned. Henting starter med en gang.</p>
                <button type="button" className="btn sm" onClick={() => hopp("tripletex")}>Gå til Tripletex</button>
              </div>
            </div>
          )}

          <h3>2. Ansatte</h3>
          {forslag.length > 0 ? (
            <>
              <p className="small">Disse finnes i {forslag[0]!.kilde === "visma" ? "Visma" : "Tripletex"}, men ikke i ByggLogg. Ta bort haken på dem som ikke skal bruke appen.</p>
              <ul className="kig-forslag">
                {forslag.map((f) => {
                  const k = `${f.kilde}:${f.ekstern_id}`;
                  return (
                    <li key={k}>
                      <label className="hake"><input type="checkbox" checked={valgt.has(k)} onChange={(e) => { const n = new Set(valgt); if (e.target.checked) n.add(k); else n.delete(k); setValgt(n); }} />
                        <span>{f.navn}<span className="small muted">{f.epost ? ` · ${f.epost}` : " · mangler e-post"}</span></span></label>
                      <button type="button" className="linkbtn small" onClick={() => kjor(() => api.avvisForslag(f.kilde, f.ekstern_id)).then(last)}>Fjern</button>
                    </li>
                  );
                })}
              </ul>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn primary sm" disabled={jobber || !valgt.size} onClick={() => leggTil(true)}>Legg til valgte og send invitasjon</button>
                <button type="button" className="btn sm" disabled={jobber || !valgt.size} onClick={() => leggTil(false)}>Bare legg til</button>
              </div>
            </>
          ) : (
            <p className="small">{aktive.length} ansatte i ByggLogg. {regnskapOk ? "Alle fra regnskapet er med." : "Når regnskapet er koblet, foreslås ansatte derfra her."} <button type="button" className="linkbtn" onClick={() => hopp("opp-ansatte")}>Legg til eller rett ansatte</button></p>
          )}

          <h3>3. Innlogging</h3>
          <p className="small">{medEpost.length - mangler.length} av {medEpost.length} med e-post har logget inn.
            {aktive.length > medEpost.length && ` ${aktive.length - medEpost.length} mangler e-post.`}
            {mangler.length > 0 && <> Mangler: {mangler.map((a) => a.navn.split(" ")[0]).join(", ")}.</>}</p>
          {mangler.length > 0 && <button type="button" className="btn sm" disabled={jobber} onClick={inviterAlle}>✉️ Send invitasjon til de {mangler.length} som mangler</button>}

          <h3>4. Logo og farger</h3>
          <p className="small">{d.logo ? "✓ Logoen er lagt inn." : "Last opp logoen, så hentes firmafargene fra den."} <button type="button" className="linkbtn" onClick={() => hopp("opp-logo")}>{d.logo ? "Endre" : "Last opp logo"}</button></p>

          <h3>5. Varsler</h3>
          <p className="small">{push ?? 0} av {aktive.length} har slått på varsler på telefonen. Invitasjonen forklarer hvordan, både for iPhone og Android.</p>
        </>
      )}
    </section>
  );
}
