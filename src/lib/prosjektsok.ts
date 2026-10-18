// Søk i prosjekter på prosjektnummer, navn, kunde og adresse.
import type { Kunde, Prosjekt } from "./timer";

const norm = (s: string) => s.toLocaleLowerCase("nb").trim();

export const prosjektTekst = (p: Pick<Prosjekt, "visma_nr" | "navn">) => `${p.visma_nr ? `${p.visma_nr} · ` : ""}${p.navn}`;

/**
 * Prosjektene som passer med søket. Alle ordene i søket må finnes et sted
 * (nummer, navn, kunde eller adresse). Treff på nummer eller i starten av navnet kommer først.
 */
export function sokProsjekter<P extends Prosjekt>(prosjekter: P[], kunder: Pick<Kunde, "id" | "navn">[], sok: string): P[] {
  const ord = norm(sok).split(/\s+/).filter(Boolean);
  if (!ord.length) return prosjekter;
  const kunde = new Map(kunder.map((k) => [k.id, k.navn]));
  const treff: { p: P; poeng: number; i: number }[] = [];
  prosjekter.forEach((p, i) => {
    const nr = p.visma_nr ? String(p.visma_nr) : "";
    const navn = norm(p.navn);
    const alt = `${nr} ${navn} ${norm(kunde.get(p.kunde_id ?? "") ?? "")} ${norm(p.adresse ?? "")}`;
    if (!ord.every((o) => alt.includes(o))) return;
    const forste = ord[0]!;
    const poeng = nr === forste ? 0 : nr.startsWith(forste) ? 1 : navn.startsWith(forste) ? 2 : navn.split(/\s+/).some((w) => w.startsWith(forste)) ? 3 : 4;
    treff.push({ p, poeng, i });
  });
  return treff.sort((a, b) => a.poeng - b.poeng || a.i - b.i).map((x) => x.p);
}
