// Kjøreavstand fra bedriften til mange prosjekter: finner adressene i kartet (4 om gangen) og spør rutetjenesten samlet.
import { useEffect, useState } from "react";
import { finnPunkt, kjoreavstander, type Avstand, type Punkt } from "./kart";
import type { Bedrift } from "./ferie";
import { PROFIL, firma } from "./profil";

const firmaPunkter = new Map<string, Promise<Punkt | null>>();
/** Hvor bedriften holder til (utgangspunkt for kjøreavstand): adressen i bedriftsprofilen, eller demoens sted */
export function useFirmaPunkt(bedrift?: Bedrift | null): Punkt | null {
  const adresse = bedrift ? firma(bedrift).adresseLinje : "";
  const [punkt, setPunkt] = useState<Punkt | null>(bedrift ? null : PROFIL.base);
  useEffect(() => {
    if (!bedrift) { setPunkt(PROFIL.base); return; }
    if (!adresse.trim()) { setPunkt(null); return; }
    let aktiv = true;
    if (!firmaPunkter.has(adresse)) firmaPunkter.set(adresse, finnPunkt(adresse).catch(() => null));
    firmaPunkter.get(adresse)!.then((x) => { if (aktiv) setPunkt(x); });
    return () => { aktiv = false; };
  }, [adresse, !!bedrift]); // eslint-disable-line react-hooks/exhaustive-deps
  return punkt;
}

export interface AvstandMal { id: string; adresse: string; kommunenr?: string; gnr?: number | null; bnr?: number | null }

export function useAvstander(fra: Punkt | null, mal: AvstandMal[]): Map<string, Avstand> {
  const [svar, setSvar] = useState<Map<string, Avstand>>(new Map());
  const nokkel = mal.map((m) => m.id + "=" + m.adresse).join("|");
  useEffect(() => {
    let aktiv = true;
    if (!fra) { setSvar(new Map()); return; }
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
  }, [nokkel, fra?.lat, fra?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  return svar;
}
