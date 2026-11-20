// Befaring rom for rom: mål per rom, dører og vinduer, mengder og en enkel romskisse.
import { useEffect, useState } from "react";
import type { BildeMaal } from "../lib/api";
import {
  lesAapning, lesMaal, mengdeLinjer, nyttRom, romMaalTekst, romMengder, romSkisse, STANDARD_DOR, STANDARD_ROM, STANDARD_VINDU, sumMengder, tall, visMaal,
  type Aapning, type BefaringRom,
} from "../lib/befaringRom";
import type { Bilde } from "../lib/hms";
import { Bilder } from "./Bilder";

/** Tekstfelt for et mål i meter. Godtar «4,2», «420 cm», «420». */
function MaalFelt({ label, verdi, onChange, disabled }: { label: string; verdi?: number | null; onChange: (m: number | null) => void; disabled?: boolean }) {
  const [t, setT] = useState(visMaal(verdi));
  useEffect(() => { if (lesMaal(t) !== (verdi ?? null)) setT(visMaal(verdi)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [verdi]);
  const ugyldig = t.trim() !== "" && lesMaal(t) == null;
  return (
    <label className="field"><span className="label">{label}</span>
      <input inputMode="decimal" value={t} disabled={disabled} placeholder="m" aria-invalid={ugyldig || undefined}
        onChange={(e) => { setT(e.target.value); const m = lesMaal(e.target.value); if (m != null || !e.target.value.trim()) onChange(m); }} />
    </label>
  );
}

/** Dører eller vinduer: antall og størrelse (bredde × høyde) */
function Aapninger({ navn, liste, std, onChange, disabled }: { navn: string; liste: Aapning[]; std: Aapning; onChange: (l: Aapning[]) => void; disabled?: boolean }) {
  const cm = (x: number) => Math.round(x * 100);
  return (
    <div className="rom-aapninger">
      <span className="label">{navn}</span>
      {liste.map((a, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <input type="number" min={1} max={50} value={a.antall} disabled={disabled} aria-label={`Antall ${navn.toLowerCase()}`} style={{ width: 60 }}
            onChange={(e) => onChange(liste.map((x, n) => (n === i ? { ...x, antall: Math.max(1, Math.min(50, Number(e.target.value) || 1)) } : x)))} />
          <span className="small">stk à</span>
          <StorrelseFelt a={a} disabled={disabled} navn={navn} onChange={(s) => onChange(liste.map((x, n) => (n === i ? { ...x, ...s } : x)))} />
          <span className="small muted">cm</span>
          {!disabled && <button type="button" className="linkbtn small" onClick={() => onChange(liste.filter((_, n) => n !== i))}>Fjern</button>}
        </div>
      ))}
      {!disabled && <button type="button" className="btn sm" onClick={() => onChange([...liste, { ...std }])}>+ {navn === "Dører" ? "Dør" : "Vindu"} ({cm(std.b)}×{cm(std.h)})</button>}
    </div>
  );
}

function StorrelseFelt({ a, onChange, disabled, navn }: { a: Aapning; onChange: (s: { b: number; h: number }) => void; disabled?: boolean; navn: string }) {
  const tekst = `${Math.round(a.b * 100)}×${Math.round(a.h * 100)}`;
  const [t, setT] = useState(tekst);
  useEffect(() => { setT(tekst); }, [tekst]);
  return <input value={t} disabled={disabled} aria-label={`Størrelse ${navn.toLowerCase()}, bredde × høyde`} style={{ width: 96 }} placeholder="90×210"
    onChange={(e) => { setT(e.target.value); const s = lesAapning(e.target.value); if (s) onChange(s); }} />;
}

/** Romskisse som SVG */
export function RomSkisse({ r, bredde = 220, hoyde = 150 }: { r: BefaringRom; bredde?: number; hoyde?: number }) {
  const s = romSkisse(r, bredde - 40, hoyde - 36);
  if (!s) return null;
  const x0 = (bredde - s.w) / 2, y0 = 16;
  return (
    <svg className="rom-skisse" width={bredde} height={s.h + 36} viewBox={`0 0 ${bredde} ${s.h + 36}`} role="img" aria-label={`Skisse av ${r.navn}: ${romMaalTekst(r)}`}>
      <rect x={x0} y={y0} width={s.w} height={s.h} fill="var(--sunk)" stroke="currentColor" strokeWidth={2} />
      {s.vinduer.map((v, i) => <line key={`v${i}`} x1={x0 + v.x} x2={x0 + v.x + v.w} y1={y0} y2={y0} stroke="#3a8fd8" strokeWidth={5} />)}
      {s.dorer.map((v, i) => (
        <g key={`d${i}`}>
          <line x1={x0 + v.x} x2={x0 + v.x + v.w} y1={y0 + s.h} y2={y0 + s.h} stroke="var(--surface)" strokeWidth={4} />
          <path d={`M ${x0 + v.x} ${y0 + s.h} A ${v.w} ${v.w} 0 0 1 ${x0 + v.x + v.w} ${y0 + s.h - v.w}`} fill="none" stroke="#b5832a" strokeWidth={1.2} />
          <line x1={x0 + v.x} x2={x0 + v.x + v.w} y1={y0 + s.h} y2={y0 + s.h - v.w} stroke="#b5832a" strokeWidth={1.5} />
        </g>
      ))}
      <text x={x0 + s.w / 2} y={y0 - 4} textAnchor="middle" fontSize={11} fill="currentColor">{visMaal(r.lengde)} m</text>
      <text x={x0 + s.w + 4} y={y0 + s.h / 2} fontSize={11} fill="currentColor">{visMaal(r.bredde)}</text>
      <text x={x0 + s.w / 2} y={y0 + s.h / 2 + 4} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.7}>{tall(romMengder(r).gulv)} m²</text>
    </svg>
  );
}

/** Mengdene som en liten tabell */
export function MengdeTabell({ r, rom }: { r?: BefaringRom; rom?: BefaringRom[] }) {
  const linjer = mengdeLinjer(r ? romMengder(r) : sumMengder(rom ?? []));
  if (!linjer.length) return null;
  return (
    <dl className="mengder">
      {linjer.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** Alle rommene på befaringen */
export function RomListe({ rom, onChange, laast, bilder, til }: {
  rom: BefaringRom[]; onChange: (r: BefaringRom[]) => void; laast: boolean; bilder: Bilde[]; til: BildeMaal;
}) {
  const [aapent, setAapent] = useState<string | null>(null);
  const [nytt, setNytt] = useState("");
  const sett = (id: string, x: Partial<BefaringRom>) => onChange(rom.map((r) => (r.id === id ? { ...r, ...x } : r)));
  const leggTil = (navn: string) => {
    let n = navn.trim(); if (!n) return;
    const like = rom.filter((r) => r.navn.toLowerCase() === n.toLowerCase() || r.navn.toLowerCase().startsWith(`${n.toLowerCase()} `)).length;
    if (like) n = `${n} ${like + 1}`;
    const r = nyttRom(n);
    onChange([...rom, r]); setAapent(r.id); setNytt("");
  };
  const romBilder = (r: BefaringRom) => bilder.filter((b) => (b.tekst ?? "").trim().toLowerCase() === r.navn.trim().toLowerCase());

  return (
    <div className="rom-liste">
      <h3 style={{ margin: "6px 0 0" }}>Rom og mål {rom.length ? <span className="small muted">({rom.length} rom)</span> : null}</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Legg inn rommene med lengde, bredde og takhøyde, og dører og vinduer. Mengdene regnes ut og blir med i tilbudet og rapporten.
        Du kan også bare si det til KI over, f.eks. «Stua er 5,2 ganger 4, takhøyde 2,4, to vinduer 120 ganger 140 og én dør».
        Har du iPhone Pro, kan du skanne rommet med en skanne-app og legge inn et skjermbilde av plantegningen. Da leser KI målene derfra.
      </p>
      {rom.map((r) => {
        const m = romMengder(r);
        const aapen = aapent === r.id;
        const rb = romBilder(r);
        return (
          <div key={r.id} className={`rom-kort${aapen ? " aapen" : ""}`}>
            <button type="button" className="rom-hode" aria-expanded={aapen} onClick={() => setAapent(aapen ? null : r.id)}>
              <b>{r.navn}</b>
              <span className="small muted">{romMaalTekst(r) || "Ingen mål ennå"}{m.gulv ? ` · ${tall(m.gulv)} m²` : ""}{rb.length ? ` · ${rb.length} bilde${rb.length === 1 ? "" : "r"}` : ""}</span>
            </button>
            {aapen && (
              <div className="rom-innhold">
                {!laast && <label className="field"><span className="label">Rom</span><input value={r.navn} maxLength={80} onChange={(e) => sett(r.id, { navn: e.target.value })} /></label>}
                <div className="rom-maal">
                  <MaalFelt label="Lengde (m)" verdi={r.lengde} disabled={laast} onChange={(v) => sett(r.id, { lengde: v })} />
                  <MaalFelt label="Bredde (m)" verdi={r.bredde} disabled={laast} onChange={(v) => sett(r.id, { bredde: v })} />
                  <MaalFelt label="Takhøyde (m)" verdi={r.hoyde} disabled={laast} onChange={(v) => sett(r.id, { hoyde: v })} />
                </div>
                <div className="grid2">
                  <Aapninger navn="Dører" liste={r.dorer ?? []} std={STANDARD_DOR} disabled={laast} onChange={(l) => sett(r.id, { dorer: l })} />
                  <Aapninger navn="Vinduer" liste={r.vinduer ?? []} std={STANDARD_VINDU} disabled={laast} onChange={(l) => sett(r.id, { vinduer: l })} />
                </div>
                <div className="rom-resultat">
                  <RomSkisse r={r} />
                  <MengdeTabell r={r} />
                </div>
                <label className="field"><span className="label">Hva skal gjøres i rommet</span>
                  <textarea rows={2} value={r.notat ?? ""} disabled={laast} maxLength={1000} placeholder="F.eks. nytt gulv og list, male vegger, skifte vindu mot vest"
                    onChange={(e) => sett(r.id, { notat: e.target.value })} /></label>
                <Bilder bilder={rb} til={{ ...til, tekst: r.navn.trim() }} tittel={`Bilder fra ${r.navn}`} />
                {!laast && <button type="button" className="linkbtn small" onClick={() => { if (confirm(`Fjerne rommet «${r.navn}»?`)) onChange(rom.filter((x) => x.id !== r.id)); }}>Fjern rommet</button>}
              </div>
            )}
          </div>
        );
      })}
      {rom.length > 1 && (
        <div className="rom-sum"><b>Totalt for alle rom</b><MengdeTabell rom={rom} /></div>
      )}
      {!laast && (
        <div className="rom-ny">
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {STANDARD_ROM.map((n) => <button key={n} type="button" className="btn sm" onClick={() => leggTil(n)}>+ {n}</button>)}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); leggTil(nytt); }}>
            <input value={nytt} onChange={(e) => setNytt(e.target.value)} placeholder="Annet rom, f.eks. «Soverom 2» eller «Terrasse»" aria-label="Nytt rom" maxLength={80} style={{ flex: 1 }} />
            <button className="btn sm" disabled={!nytt.trim()}>Legg til rom</button>
          </form>
        </div>
      )}
    </div>
  );
}
