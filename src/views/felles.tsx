import type { Sjekk, Soknad } from "../lib/ferie";
import { periode, vd, virkedager } from "../lib/ferie";

const IKON = { ok: "✓", advarsel: "!", feil: "×", info: "i" };

export function Sjekkliste({ liste }: { liste: Sjekk[] }) {
  if (!liste.length) return null;
  return (
    <ul className="checks">
      {liste.map((s, i) => <li key={i} className={s.niva}><span className="i" aria-hidden="true">{IKON[s.niva]}</span><span>{s.tekst}</span></li>)}
    </ul>
  );
}

const STATUS = { venter: "Venter", godkjent: "Godkjent", avslatt: "Avslått" };

export function SoknadRad({ s, navn, undertekst, handlinger, children }: {
  s: Soknad; navn?: string; undertekst?: string; handlinger?: React.ReactNode; children?: React.ReactNode;
}) {
  const n = virkedager(s.fra, s.til);
  return (
    <div className={`item ${s.status}`}>
      <div style={{ minWidth: 0 }}>
        <div className="t">{navn ? `${navn} · ` : ""}{periode(s.fra, s.til)}</div>
        <div className="s">
          {vd(n)}{undertekst ? ` · ${undertekst}` : ""}{s.merknad ? ` · ${s.merknad}` : ""}
        </div>
        {s.kommentar && <div className="s">Leder: {s.kommentar}</div>}
      </div>
      <div className="acts"><span className={`chip ${s.status}`}>{STATUS[s.status]}</span>{handlinger}</div>
      {children && <div className="full">{children}</div>}
    </div>
  );
}
