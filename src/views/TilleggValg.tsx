import { useApp } from "../App";

/** Tilleggsarbeid på prosjektet som timer kan føres på (avviste vises ikke) */
export function tilleggFor(d: ReturnType<typeof useApp>["d"], prosjektId: string | null | undefined, valgt?: string | null) {
  if (!prosjektId) return [];
  return d.tillegg.filter((t) => t.prosjekt_id === prosjektId && (t.status !== "avvist" || t.id === valgt));
}

/** «Gjelder»: hovedjobben eller et tilleggsarbeid (underprosjekt) på samme prosjekt */
export function TilleggValg({ prosjektId, value, onChange, lys }: { prosjektId: string; value: string; onChange: (id: string) => void; lys?: boolean }) {
  const { d } = useApp();
  const liste = tilleggFor(d, prosjektId, value);
  if (!liste.length) return null;
  const merk = (s: string) => s === "utkast" ? " (ikke signert)" : s === "avvist" ? " (avvist)" : "";
  return (
    <label className={`field${lys ? " lys" : ""}`}><span className="label">Hva gjelder arbeidet?</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Gjelder hovedjobben eller tilleggsarbeid">
        <option value="">Hovedjobben</option>
        {liste.map((t) => <option key={t.id} value={t.id}>{`Tillegg: ${t.tittel}${merk(t.status)}`}</option>)}
      </select></label>
  );
}
