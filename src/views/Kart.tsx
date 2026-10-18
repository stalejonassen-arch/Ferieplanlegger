import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Punkt } from "../lib/kart";

/** Kart med nål på arbeidsstedet. Kartverkets topografiske kart (åpent, ingen nøkkel). Leaflet lastes først når kartet vises. */
export function Kart({ punkt, hoyde, tittel }: { punkt: Punkt; hoyde: number; tittel: string }) {
  const boks = useRef<HTMLDivElement>(null);
  const kart = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let aktiv = true;
    import("leaflet").then((L) => {
      if (!aktiv || !boks.current) return;
      const m = L.map(boks.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([punkt.lat, punkt.lon], 16);
      L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png", {
        maxZoom: 18, attribution: '&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noreferrer">Kartverket</a>',
      }).addTo(m);
      const nal = L.divIcon({
        className: "kart-nal", iconSize: [30, 40], iconAnchor: [15, 39],
        html: '<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true"><path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 39 15 39s14-14 14-24.2C29 7.2 22.7 1 15 1z" fill="#0B1F5C" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#FFCD00"/></svg>',
      });
      L.marker([punkt.lat, punkt.lon], { icon: nal, title: tittel, keyboard: false }).addTo(m);
      kart.current = m;
    });
    return () => { aktiv = false; kart.current?.remove(); kart.current = null; };
  }, [punkt.lat, punkt.lon, tittel]);

  // Ny størrelse: la kartet regne ut utsnittet på nytt og holde nålen i midten
  useEffect(() => { const m = kart.current; if (m) { m.invalidateSize(); m.setView([punkt.lat, punkt.lon]); } }, [hoyde, punkt.lat, punkt.lon]);

  return <div ref={boks} role="img" aria-label={tittel} style={{ width: "100%", height: hoyde, zIndex: 0 }} />;
}
