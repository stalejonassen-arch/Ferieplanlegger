import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../App";
import { pushStatus, slaaAvPush, slaaPaPush, type PushStatus } from "../lib/push";

function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  useEffect(() => { pushStatus().then(setStatus).catch(() => setStatus("ikke-støttet")); }, []);
  return [status, setStatus] as const;
}

const SKJULT = "varsel-banner-skjult";

/** Stripe på startsiden: be om å slå på varsler (vises til de er på, eller til den er lukket) */
export function VarselBanner() {
  const [status, setStatus] = usePushStatus();
  const [jobber, setJobber] = useState(false);
  const [skjult, setSkjult] = useState(() => { try { return Number(localStorage.getItem(SKJULT) || 0) > Date.now(); } catch { return false; } });
  if (skjult || !status || !["av", "installer-først"].includes(status)) return null;
  const lukk = () => { try { localStorage.setItem(SKJULT, String(Date.now() + 14 * 864e5)); } catch { /* privat modus */ } setSkjult(true); };
  return (
    <div className="varsel-banner" role="region" aria-label="Varsler">
      <span className="varsel-ikon" aria-hidden="true">🔔</span>
      <span className="varsel-tekst">
        <b>Få varsel på telefonen</b>
        <span>{status === "installer-først"
          ? "På iPhone må ByggLogg først lagres som app (Del → «Legg til på Hjem-skjerm»). Åpne appen fra hjemskjermen, så kan du slå på varsler."
          : "Nytt arbeid i planen, meldinger, bestillinger og månedsrapporten din – også når appen er lukket."}</span>
      </span>
      {status === "av" && <button className="btn primary sm" disabled={jobber} onClick={async () => { setJobber(true); try { setStatus(await slaaPaPush()); } catch { setStatus("av"); } finally { setJobber(false); } }}>{jobber ? "Slår på …" : "Slå på varsler"}</button>}
      <button className="varsel-lukk" onClick={lukk} aria-label="Ikke nå">×</button>
    </div>
  );
}

/** Liten bryter (brukes i Chat): viser om varsler er på, og lar deg slå av/på */
export function VarselBryter() {
  const [status, setStatus] = usePushStatus();
  const [jobber, setJobber] = useState(false);
  if (!status || status === "ikke-støttet") return null;
  const bytt = async (paa: boolean) => { setJobber(true); try { setStatus(paa ? await slaaPaPush() : await slaaAvPush()); } catch { /* beholder status */ } finally { setJobber(false); } };
  if (status === "på") return <div className="chat-varsel paa">🔔 Varsler er på på denne enheten · <button className="lenkeknapp" disabled={jobber} onClick={() => bytt(false)}>Slå av</button></div>;
  if (status === "blokkert") return <div className="chat-varsel">🔕 Varsler er blokkert. Slå dem på for ByggLogg i innstillingene på telefonen/nettleseren.</div>;
  if (status === "installer-først") return <div className="chat-varsel">🔔 Lagre ByggLogg som app (Del → «Legg til på Hjem-skjerm») for å få varsler på iPhone.</div>;
  return <button className="chat-varsel" disabled={jobber} onClick={() => bytt(true)}>🔔 Slå på varsel når det kommer nye meldinger og prosjekter</button>;
}

/** Leder: hvem har slått på varsler, og hvem mangler */
export function VarselOversikt() {
  const { d } = useApp();
  const [med, setMed] = useState<Set<string> | null>(null);
  useEffect(() => { api.ansatteMedPush().then((x) => setMed(new Set(x))).catch(() => setMed(null)); }, [d.ansatte.length]);
  if (!med) return null;
  const aktive = d.ansatte.filter((a) => a.aktiv);
  const mangler = aktive.filter((a) => !med.has(a.id)).sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  return (
    <p className="small" style={{ margin: "4px 0 0" }}>
      <b>🔔 Varsler på telefonen: {aktive.length - mangler.length} av {aktive.length}.</b>{" "}
      {mangler.length > 0 && <span className="muted">Mangler: {mangler.map((a) => a.navn.split(" ")[0]).join(", ")}. De slår det på fra startsiden (Timer) – på iPhone må appen først legges til på hjemskjermen.</span>}
    </p>
  );
}
