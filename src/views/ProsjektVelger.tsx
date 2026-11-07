// Velg prosjekt med søk: skriv nummer, navn, kunde eller adresse.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useApp } from "../App";
import { prosjektTekst, sokProsjekter } from "../lib/prosjektsok";
import type { Prosjekt } from "../lib/timer";
import { favoritter, Stjerne } from "./Favoritt";

export function ProsjektVelger({ value, onChange, prosjekter, tom, forslag, deaktivert, id, label = "Prosjekt", placeholder = "Velg prosjekt …", required }: {
  value: string; onChange: (id: string) => void; prosjekter: Prosjekt[];
  /** Valget uten prosjekt, f.eks. «Internt arbeid». Utelates når et prosjekt må velges. */
  tom?: string;
  /** Prosjekter som vises øverst før man har skrevet noe (f.eks. de siste brukte) */
  forslag?: { tittel: string; ider: string[] };
  deaktivert?: (p: Prosjekt) => boolean;
  id?: string; label?: string; placeholder?: string; required?: boolean;
}) {
  const { d, meg } = useApp();
  const fav = favoritter(d, meg.id).filter((id) => prosjekter.some((p) => p.id === id));
  const [aapen, setAapen] = useState(false);
  const [sok, setSok] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const rot = useRef<HTMLDivElement>(null);
  const sokRef = useRef<HTMLInputElement>(null);
  const listeId = useId();
  const valgt = d.prosjekter.find((p) => p.id === value);
  const kunde = (p: Prosjekt) => d.kunder.find((k) => k.id === p.kunde_id)?.navn ?? "";

  type Rad = { id: string; tekst: string; under?: string; gruppe?: string; av?: boolean };
  const rader = useMemo<Rad[]>(() => {
    const r = (p: Prosjekt, gruppe?: string): Rad => ({ id: p.id, tekst: prosjektTekst(p) + (p.aktiv ? "" : " (avsluttet)"), under: [kunde(p), p.adresse].filter(Boolean).join(" · "), gruppe, av: deaktivert?.(p) });
    const ut: Rad[] = [];
    if (tom !== undefined && !sok.trim()) ut.push({ id: "", tekst: tom });
    if (!sok.trim() && (forslag?.ider.length || fav.length)) {
      const finn = (ider: string[]) => ider.map((x) => prosjekter.find((p) => p.id === x)).filter((p): p is Prosjekt => !!p);
      finn(fav).forEach((p, i) => ut.push(r(p, i === 0 ? "Mine prosjekter" : undefined)));
      const sist = (forslag?.ider ?? []).filter((x) => !fav.includes(x));
      finn(sist).forEach((p, i) => ut.push(r(p, i === 0 ? forslag!.tittel : undefined)));
      const brukt = new Set([...fav, ...sist]);
      prosjekter.filter((p) => !brukt.has(p.id)).forEach((p, i) => ut.push(r(p, i === 0 ? "Alle" : undefined)));
      return ut;
    }
    return [...ut, ...sokProsjekter(prosjekter, d.kunder, sok).map((p) => r(p))];
  }, [sok, prosjekter, d.kunder, tom, forslag, fav.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aapen) return;
    sokRef.current?.focus();
    const ute = (e: PointerEvent) => { if (!rot.current?.contains(e.target as Node)) setAapen(false); };
    document.addEventListener("pointerdown", ute);
    return () => document.removeEventListener("pointerdown", ute);
  }, [aapen]);
  useEffect(() => { setAktiv(0); }, [sok]);
  useEffect(() => {
    rot.current?.querySelector(`[data-nr="${aktiv}"]`)?.scrollIntoView({ block: "nearest" });
  }, [aktiv]);

  const velg = (r: Rad) => { if (r.av) return; onChange(r.id); setAapen(false); setSok(""); };
  const tast = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAktiv((a) => Math.min(rader.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAktiv((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (rader[aktiv]) velg(rader[aktiv]!); }
    else if (e.key === "Escape") { e.preventDefault(); setAapen(false); }
  };
  const visning = valgt ? prosjektTekst(valgt) : value === "" && tom !== undefined ? tom : "";

  return (
    <div className="field pvelger" ref={rot}>
      <span className="label">{label}</span>
      <button type="button" id={id} className={`pvelger-knapp${visning ? "" : " tom"}`} aria-haspopup="listbox" aria-expanded={aapen}
        onClick={() => setAapen(!aapen)}>
        <span>{visning || placeholder}</span>
        {valgt && kunde(valgt) && <span className="pvelger-kunde">{kunde(valgt)}</span>}
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" className="pvelger-krav" value={value} onChange={() => {}} required />}
      {aapen && (
        <div className="pvelger-panel">
          <input ref={sokRef} type="search" value={sok} onChange={(e) => setSok(e.target.value)} onKeyDown={tast}
            placeholder="Søk nummer, navn, kunde, adresse" aria-label="Søk etter prosjekt" aria-controls={listeId} autoComplete="off" />
          <ul id={listeId} role="listbox" className="pvelger-liste">
            {rader.map((r, i) => (
              <li key={r.id || "tom"} className="pvelger-rad-wrap">
                {r.gruppe && <div className="pvelger-gruppe">{r.gruppe}</div>}
                <div role="option" data-nr={i} aria-selected={r.id === value} aria-disabled={r.av || undefined}
                  className={`pvelger-rad${i === aktiv ? " aktiv" : ""}${r.id === value ? " valgt" : ""}${r.av ? " av" : ""}`}
                  onPointerMove={() => setAktiv(i)} onClick={() => velg(r)}>
                  <span>{r.tekst}</span>
                  {r.under && <span className="pvelger-under">{r.under}</span>}
                  {r.id && <Stjerne prosjektId={r.id} />}
                </div>
              </li>
            ))}
            {!rader.length && <li className="pvelger-ingen">Ingen prosjekter passer med «{sok}»</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
