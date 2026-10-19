import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { api, feiltekst } from "../lib/api";
import { firma } from "../lib/profil";
import { draktVariabler, gyldigFarge, lesLogo, type Drakt } from "../lib/drakt";

interface Utkast { logo: string | null; logoMork: string | null; drakt: Drakt | null; forslag: Drakt | null }

/** Leder laster opp bedriftens logo. Appen lager firmafarger av den; ByggLogg-merket står fortsatt. */
export function DraktOppsett() {
  const { d, meg, kjor } = useApp();
  const fra = (): Utkast => ({ logo: d.logo ?? null, logoMork: d.logoMork ?? null, drakt: d.drakt ?? null, forslag: null });
  const [u, setU] = useState<Utkast>(fra);
  const [forAlle, setForAlle] = useState(false);
  const [leser, setLeser] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const fil = useRef<HTMLInputElement>(null);
  // Ny data fra databasen (f.eks. etter lagring) nullstiller utkastet
  useEffect(() => { setU(fra()); }, [d.logo, d.logoMork, d.drakt?.hoved, d.drakt?.aksent]);

  const endret = u.logo !== (d.logo ?? null) || u.logoMork !== (d.logoMork ?? null) || u.drakt?.hoved !== d.drakt?.hoved || u.drakt?.aksent !== d.drakt?.aksent;
  const fargeOk = !u.drakt || (gyldigFarge(u.drakt.hoved) && gyldigFarge(u.drakt.aksent));

  const velgFil = async (f: File | undefined) => {
    if (!f) return;
    setFeil(null); setLeser(true);
    try {
      const l = await lesLogo(f);
      setU({ logo: l.logo, logoMork: l.logoMork, drakt: l.drakt, forslag: l.drakt });
    } catch (e) { setFeil(feiltekst(e)); }
    finally { setLeser(false); if (fil.current) fil.current.value = ""; }
  };
  const settFarge = (k: keyof Drakt, v: string) => setU((x) => ({ ...x, drakt: { ...(x.drakt ?? { hoved: "#0A1EBE", aksent: "#FFCD00" }), [k]: v.startsWith("#") ? v.toUpperCase() : `#${v.toUpperCase()}` } }));

  const lagre = () => kjor(async () => {
    await api.lagreDrakt(u.logo, u.logoMork, u.drakt, forAlle);
    if (u.drakt && meg.tema !== "egen" && !forAlle) await api.settMittTema("egen");
  }, u.drakt ? "Logo og firmafarger er lagret" : "Logoen er lagret");
  const fjern = () => kjor(() => api.lagreDrakt(null, null, null, false), "Logo og firmafarger er fjernet");

  const vars = u.drakt && fargeOk ? draktVariabler(u.drakt) : null;

  return (
    <section className="panel" id="opp-logo">
      <h2>Logo og farger</h2>
      <p className="small muted">Last opp logoen til {firma(d.bedrift).undertittel}, så vises den øverst i appen ved siden av ByggLogg. Appen finner fargene i logoen og lager firmafarger av dem: hovedfargen på toppfeltet og knappene, aksentfargen der ByggLogg bruker gult. Du kan justere fargene før du lagrer. De ansatte velger «Firmafarger» under fargevalget øverst, eller du setter det på alle.</p>

      <div className="drakt-oppsett">
        <div className="drakt-forhand" style={vars as React.CSSProperties | undefined} aria-label="Slik blir toppen av appen">
          <div className="drakt-topp">
            {u.logo && <img className={u.logoMork ? "firmalogo" : "firmalogo plate"} src={u.logoMork ?? u.logo} alt="" />}
            <div>
              <small>{firma(d.bedrift).undertittel}</small>
              <b>Bygg<span>Logg</span></b>
            </div>
          </div>
          <div className="drakt-prov">
            <span className="drakt-knapp hoved">Lagre</span>
            <span className="drakt-knapp aksent">Stemple inn</span>
          </div>
          {!u.drakt && <p className="small muted" style={{ margin: "6px 0 0" }}>Ingen firmafarger valgt – appen bruker ByggLogg-blå.</p>}
        </div>

        <div className="drakt-valg">
          <label className="btn" style={{ alignSelf: "flex-start" }}>
            {leser ? "Leser logoen …" : u.logo ? "Bytt logo" : "Last opp logo"}
            <input ref={fil} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden disabled={leser}
              onChange={(e) => velgFil(e.target.files?.[0])} />
          </label>
          <span className="small muted">PNG, JPG, WebP eller SVG. Helst logo med gjennomsiktig bakgrunn, eller ensfarget bakgrunn (den fjernes i toppfeltet).</span>
          {feil && <span className="small" style={{ color: "var(--warn)" }}>{feil}</span>}
          {u.logo && (
            <div className="drakt-farger">
              {(["hoved", "aksent"] as const).map((k) => (
                <label key={k} className="field kort"><span className="label">{k === "hoved" ? "Hovedfarge" : "Aksentfarge"}</span>
                  <span className="drakt-farge">
                    <input type="color" value={u.drakt && gyldigFarge(u.drakt[k]) ? u.drakt[k] : "#000000"} onChange={(e) => settFarge(k, e.target.value)} aria-label={`${k === "hoved" ? "Hovedfarge" : "Aksentfarge"}, velg`} />
                    <input type="text" value={u.drakt?.[k] ?? ""} maxLength={7} spellCheck={false} onChange={(e) => settFarge(k, e.target.value.trim())} aria-label={k === "hoved" ? "Hovedfarge" : "Aksentfarge"} />
                  </span>
                </label>
              ))}
              {u.forslag && (u.drakt?.hoved !== u.forslag.hoved || u.drakt?.aksent !== u.forslag.aksent) &&
                <button type="button" className="btn sm" onClick={() => setU((x) => ({ ...x, drakt: x.forslag }))}>Tilbake til fargene fra logoen</button>}
              {u.drakt && <button type="button" className="btn sm" onClick={() => setU((x) => ({ ...x, drakt: null }))}>Bare logo, ByggLogg-blå farger</button>}
              {!u.drakt && <button type="button" className="btn sm" onClick={() => setU((x) => ({ ...x, drakt: x.forslag ?? d.drakt ?? { hoved: "#0A1EBE", aksent: "#FFCD00" } }))}>Bruk firmafarger</button>}
            </div>
          )}
          {!fargeOk && <span className="small" style={{ color: "var(--warn)" }}>Skriv fargene som #RRGGBB, for eksempel #0A1EBE.</span>}
          {u.drakt && (
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", flex: "none" }} checked={forAlle} onChange={(e) => setForAlle(e.target.checked)} /> Sett firmafargene på alle ansatte (de kan bytte selv etterpå)</label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" disabled={!endret && !forAlle || !fargeOk || leser} onClick={lagre}>Lagre</button>
            {endret && <button className="btn" onClick={() => setU(fra())}>Angre</button>}
            {(d.logo || d.drakt) && <button className="btn" onClick={fjern}>Fjern logo og farger</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
