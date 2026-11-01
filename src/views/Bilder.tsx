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
  const [aapen, setAapen] = useState<number | null>(null);
  const stort = aapen != null ? bilder[aapen] ?? null : null;
  const lukk = () => setAapen(null);
  const bla = (n: number) => setAapen((i) => (i == null || !bilder.length ? i : (i + n + bilder.length) % bilder.length));
  const sveip = useRef<{ x: number; y: number } | null>(null);

  // Piltaster og Esc mens et bilde er åpent
  useEffect(() => {
    if (aapen == null) return;
    const tast = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") bla(1); else if (e.key === "ArrowLeft") bla(-1); else if (e.key === "Escape") lukk();
    };
    window.addEventListener("keydown", tast);
    return () => window.removeEventListener("keydown", tast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aapen != null, bilder.length]);
  // Et bilde som blir slettet eller forsvinner lukker visningen
  useEffect(() => { if (aapen != null && aapen >= bilder.length) setAapen(bilder.length ? bilder.length - 1 : null); }, [aapen, bilder.length]);
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
          {bilder.map((b, i) => (
            <button key={b.id} className="miniatyr" onClick={() => setAapen(i)} aria-label={`Vis bilde ${b.tekst || ""}`}>
              {urler[b.sti] ? <img src={urler[b.sti]} alt={b.tekst || "Bilde"} loading="lazy" /> : <span className="muted small">…</span>}
            </button>
          ))}
        </div>
      )}
      {stort && (
        <div className="lysboks" role="dialog" aria-label="Bilde" onClick={lukk}
          onTouchStart={(e) => { sveip.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const s = sveip.current; sveip.current = null;
            if (!s) return;
            const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) bla(dx < 0 ? 1 : -1);
            else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) lukk();
          }}>
          <button className="lysboks-lukk" onClick={(e) => { e.stopPropagation(); lukk(); }} aria-label="Lukk">✕</button>
          <div className="lysboks-bilde" onClick={(e) => e.stopPropagation()}>
            {bilder.length > 1 && <button className="lysboks-pil forrige" onClick={() => bla(-1)} aria-label="Forrige bilde">‹</button>}
            {urler[stort.sti] ? <img key={stort.id} src={urler[stort.sti]} alt={stort.tekst || "Bilde"} /> : <span className="muted">…</span>}
            {bilder.length > 1 && <button className="lysboks-pil neste" onClick={() => bla(1)} aria-label="Neste bilde">›</button>}
          </div>
          {stort.tekst && <div className="small lysboks-tekst" onClick={(e) => e.stopPropagation()}>{stort.tekst}</div>}
          <div className="row small" onClick={(e) => e.stopPropagation()}>
            {bilder.length > 1 && <b>{aapen! + 1} / {bilder.length}</b>}
            <span>{navn(stort.ansatt_id)} · {new Date(stort.opprettet).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}</span>
            {(leder || stort.ansatt_id === meg.id) && (
              <button className="btn sm no" onClick={() => kjor(() => api.slettBilde(stort.id, stort.sti), "Bildet er slettet")}>Slett</button>
            )}
            <button className="btn sm" onClick={lukk}>Lukk</button>
          </div>
        </div>
      )}
    </div>
  );
}
