import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api, feiltekst, type BildeMaal } from "../lib/api";
import type { Bilde } from "../lib/hms";

/** Bildegalleri med opplasting rett fra mobilkameraet. */
export function Bilder({ bilder, til, tittel = "Bilder" }: {
  bilder: Bilde[]; til: BildeMaal; tittel?: string;
}) {
  const { d, meg, leder, kjor } = useApp();
  const [urler, setUrler] = useState<Record<string, string>>({});
  const [laster, setLaster] = useState(0);
  const [feil, setFeil] = useState("");
  const [stort, setStort] = useState<Bilde | null>(null);
  const filRef = useRef<HTMLInputElement>(null);
  const nokkel = bilder.map((b) => b.sti).join("|");

  useEffect(() => {
    const mangler = bilder.map((b) => b.sti).filter((s) => !urler[s]);
    if (mangler.length) api.bildeUrler(mangler).then((u) => setUrler((x) => ({ ...x, ...u }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nokkel]);

  const lastOpp = async (filer: FileList | null) => {
    if (!filer?.length) return;
    setFeil("");
    setLaster(filer.length);
    for (const f of Array.from(filer)) {
      try { await api.lastOppBilde(f, til); } catch (e) { setFeil(feiltekst(e)); }
      setLaster((n) => n - 1);
    }
    await kjor(async () => {}, `${filer.length === 1 ? "Bildet er" : `${filer.length} bilder er`} lagret`);
    if (filRef.current) filRef.current.value = "";
  };
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "";

  return (
    <div className="bilder">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="label">{tittel} ({bilder.length})</span>
        {laster ? <span className="small muted">Laster opp … {laster} igjen</span> : (
          <span className="row">
            <label className="btn sm">Ta bilde
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => lastOpp(e.target.files)} />
            </label>
            <label className="btn sm">Fra galleri
              <input ref={filRef} type="file" accept="image/*" multiple hidden onChange={(e) => lastOpp(e.target.files)} />
            </label>
          </span>
        )}
      </div>
      {feil && <p className="small" style={{ color: "var(--warn)" }}>{feil}</p>}
      {bilder.length > 0 && (
        <div className="galleri">
          {bilder.map((b) => (
            <button key={b.id} className="miniatyr" onClick={() => setStort(b)} aria-label={`Vis bilde ${b.tekst || ""}`}>
              {urler[b.sti] ? <img src={urler[b.sti]} alt={b.tekst || "Bilde"} loading="lazy" /> : <span className="muted small">…</span>}
            </button>
          ))}
        </div>
      )}
      {stort && (
        <div className="lysboks" role="dialog" aria-label="Bilde" onClick={() => setStort(null)}>
          <img src={urler[stort.sti]} alt={stort.tekst || "Bilde"} onClick={(e) => e.stopPropagation()} />
          <div className="row small" onClick={(e) => e.stopPropagation()}>
            <span>{navn(stort.ansatt_id)} · {new Date(stort.opprettet).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}</span>
            {(leder || stort.ansatt_id === meg.id) && (
              <button className="btn sm no" onClick={() => { kjor(() => api.slettBilde(stort.id, stort.sti), "Bildet er slettet"); setStort(null); }}>Slett</button>
            )}
            <button className="btn sm" onClick={() => setStort(null)}>Lukk</button>
          </div>
        </div>
      )}
    </div>
  );
}
