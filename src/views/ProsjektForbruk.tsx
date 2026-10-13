import { useApp } from "../App";
import { t2, timeStatus } from "../lib/timer";

/** Kompakt: planlagte timer på prosjektet mot det som er ført så langt (alle ansatte). Oppdateres når timer registreres. */
export function ProsjektForbruk({ prosjektId, lys }: { prosjektId: string; lys?: boolean }) {
  const { d } = useApp();
  const p = d.prosjekter.find((x) => x.id === prosjektId);
  if (!p) return null;
  const brukt = d.timer.filter((t) => t.prosjekt_id === p.id).reduce((n, t) => n + Number(t.timer), 0);
  const est = p.estimert_timer ? Number(p.estimert_timer) : null;
  const tillegg = d.tillegg.filter((t) => t.prosjekt_id === p.id && (t.status === "signert" || t.status === "fakturert")).reduce((n, t) => n + (t.timer ?? 0), 0);
  const ramme = est != null ? est + tillegg : null;
  const s = timeStatus(brukt, ramme);
  return (
    <div className={`forbruk ${s.status}${lys ? " lys" : ""}`} aria-label="Timer på prosjektet">
      <div className="forbruk-rad">
        <span><b>{t2(brukt)}</b>{ramme ? <> av <b>{t2(ramme)}</b> planlagte timer</> : " timer ført så langt"}</span>
        <span className="forbruk-tekst">{ramme ? s.tekst : "Ingen plan lagt inn"}</span>
      </div>
      {ramme ? <div className="tbar"><i style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} /></div> : null}
    </div>
  );
}
