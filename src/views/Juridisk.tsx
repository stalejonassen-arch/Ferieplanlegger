import { useEffect, useState, type ReactNode } from "react";
import nb from "../lib/juridisk/nb.json";
import { SPRAK, SPRAKENE, type Sprak } from "../lib/sprak";

// Felles visning av personvernerklæringen og avtalevilkårene på fire språk.
// Tekstene ligger i src/lib/juridisk/<språk>.json med samme oppbygning. Norsk er lastet med appen,
// de andre hentes først når noen velger dem. Ved motstrid gjelder den norske teksten.

export type Blokk =
  | { h2: string } | { h3: string }
  | { p: string; liten?: boolean }
  | { ul: string[] }
  | { punkt: number; tittel: string; innhold: Blokk[] }
  | { tabell: string[][] };
export type Juridisk = {
  ui: { lukk: string; sistOppdatert: string; tilVilkar: string; orgnr: string; kontaktPaa: string; sprakLabel: string; oversatt: string };
  personvern: Blokk[]; vilkar: Blokk[]; tilPersonvernTekst: string;
};

const LAST: Record<Exclude<Sprak, "nb">, () => Promise<{ default: unknown }>> = {
  pl: () => import("../lib/juridisk/pl.json"),
  en: () => import("../lib/juridisk/en.json"),
  lt: () => import("../lib/juridisk/lt.json"),
};

/** Teksten på valgt språk (norsk mens et annet språk lastes) */
export function useJuridisk(s: Sprak): Juridisk {
  const [t, setT] = useState<Record<string, Juridisk>>({ nb: nb as unknown as Juridisk });
  useEffect(() => {
    if (s === "nb" || t[s]) return;
    let aktiv = true;
    LAST[s]().then((m) => { if (aktiv) setT((x) => ({ ...x, [s]: m.default as Juridisk })); }).catch(() => { /* beholder norsk */ });
    return () => { aktiv = false; };
  }, [s, t]);
  return t[s] ?? t.nb;
}

/** **fet**, [lenke](url) og {plassholdere} */
function Linje({ tekst, verdier }: { tekst: string; verdier: Record<string, ReactNode> }) {
  const deler: ReactNode[] = [];
  const rx = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\{(\w+)\}/g;
  let sist = 0, m: RegExpExecArray | null, n = 0;
  while ((m = rx.exec(tekst))) {
    if (m.index > sist) deler.push(tekst.slice(sist, m.index));
    if (m[1] !== undefined) deler.push(<b key={n++}><Linje tekst={m[1]} verdier={verdier} /></b>);
    else if (m[2] !== undefined) deler.push(<a key={n++} href={m[3]} target="_blank" rel="noreferrer">{m[2]}</a>);
    else deler.push(<span key={n++}>{verdier[m[4]!] ?? m[0]}</span>);
    sist = rx.lastIndex;
  }
  if (sist < tekst.length) deler.push(tekst.slice(sist));
  return <>{deler}</>;
}

export function Blokker({ blokker, verdier }: { blokker: Blokk[]; verdier: Record<string, ReactNode> }) {
  return <>{blokker.map((b, i) => {
    if ("h2" in b) return <h2 key={i} style={{ margin: i === 0 ? 0 : "14px 0 0" }}><Linje tekst={b.h2} verdier={verdier} /></h2>;
    if ("h3" in b) return <h3 key={i}><Linje tekst={b.h3} verdier={verdier} /></h3>;
    if ("p" in b) return <p key={i} className={b.liten ? "small muted" : undefined}><Linje tekst={b.p} verdier={verdier} /></p>;
    if ("ul" in b) return <ul key={i}>{b.ul.map((x, j) => <li key={j}><Linje tekst={x} verdier={verdier} /></li>)}</ul>;
    if ("tabell" in b) return (
      <div key={i} style={{ overflowX: "auto" }}><table className="tbl">
        <thead><tr>{b.tabell[0]!.map((x, j) => <th key={j}>{x}</th>)}</tr></thead>
        <tbody>{b.tabell.slice(1).map((r, j) => <tr key={j}>{r.map((x, k) => <td key={k}>{x}</td>)}</tr>)}</tbody>
      </table></div>
    );
    return <div key={i}><h3 style={{ fontSize: 17, marginTop: 10 }}>{b.punkt}. {b.tittel}</h3><Blokker blokker={b.innhold} verdier={verdier} /></div>;
  })}</>;
}

/** Språkknapper og lukk-knapp øverst, felles for begge tekstene */
export function JuridiskTopp({ s, setS, t, lukk, tittel }: { s: Sprak; setS: (s: Sprak) => void; t: Juridisk; lukk?: () => void; tittel?: ReactNode }) {
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="row" role="group" aria-label={t.ui.sprakLabel} style={{ gap: 6, flexWrap: "wrap" }}>
          {SPRAKENE.map((k) => <button key={k} lang={k} className={`btn sm${s === k ? " primary" : ""}`} aria-pressed={s === k} onClick={() => setS(k)}>{SPRAK[k]}</button>)}
        </div>
        {lukk && <button className="btn sm" onClick={lukk}>{t.ui.lukk}</button>}
      </div>
      {tittel}
      {t.ui.oversatt && <p className="small muted">{t.ui.oversatt}</p>}
    </>
  );
}
