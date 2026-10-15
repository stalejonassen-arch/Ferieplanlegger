// Kjøreavstand fra bedriften til mange prosjekter: finner adressene i kartet (4 om gangen) og spør rutetjenesten samlet.
import { useEffect, useState } from "react";
import { finnPunkt, kjoreavstander, type Avstand, type Punkt } from "./kart";

export interface AvstandMal { id: string; adresse: string; kommunenr?: string; gnr?: number | null; bnr?: number | null }

export function useAvstander(fra: Punkt, mal: AvstandMal[]): Map<string, Avstand> {
  const [svar, setSvar] = useState<Map<string, Avstand>>(new Map());
  const nokkel = mal.map((m) => m.id + "=" + m.adresse).join("|");
  useEffect(() => {
    let aktiv = true;
    (async () => {
      const punkter = new Map<string, Punkt>();
      const ko = mal.filter((m) => m.adresse.trim() || m.gnr);
      for (let i = 0; i < ko.length; i += 4) {
        const del = ko.slice(i, i + 4);
        const r = await Promise.all(del.map((m) => finnPunkt(m.adresse, m).catch(() => null)));
        del.forEach((m, n) => { if (r[n]) punkter.set(m.id, r[n]!); });
        if (!aktiv) return;
      }
      const ider = [...punkter.keys()];
      const av = await kjoreavstander(fra, ider.map((id) => punkter.get(id)!));
      if (aktiv) setSvar(new Map(ider.map((id, n) => [id, av[n]!])));
    })().catch(() => {});
    return () => { aktiv = false; };
  }, [nokkel, fra.lat, fra.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  return svar;
}
