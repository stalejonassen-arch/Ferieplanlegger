// Favorittprosjekter: stjerne for å merke et prosjekt som «mitt», og hjelpere for lister og hurtigvalg.
import { useApp } from "../App";
import { api } from "../lib/api";
import type { Data } from "../lib/ferie";

/** Mine (eller en annens) stjernemerkede prosjekter som fortsatt er aktive, i den rekkefølgen de ble merket */
export function favoritter(d: Data, ansattId: string): string[] {
  const a = d.ansatte.find((x) => x.id === ansattId);
  return (a?.favoritter ?? []).filter((id) => d.prosjekter.some((p) => p.id === id && p.aktiv));
}

/** Hurtigvalg: favorittene først, så de sist brukte (uten dobbelt), maks 8 */
export function hurtigvalg(fav: string[], siste: string[]): string[] {
  return [...fav, ...siste.filter((x) => !fav.includes(x))].slice(0, 8);
}

export function Stjerne({ prosjektId, navn }: { prosjektId: string; navn?: string }) {
  const { d, meg, kjor } = useApp();
  const pa = (d.ansatte.find((a) => a.id === meg.id)?.favoritter ?? []).includes(prosjektId);
  return (
    <button type="button" className={`stjerne${pa ? " pa" : ""}`} aria-pressed={pa}
      aria-label={pa ? `Fjern ${navn ?? "prosjektet"} fra mine prosjekter` : `Legg ${navn ?? "prosjektet"} til mine prosjekter`}
      title={pa ? "Fjern fra mine prosjekter" : "Legg til i mine prosjekter"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); kjor(() => api.settFavoritt(prosjektId, !pa)); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
    </button>
  );
}
