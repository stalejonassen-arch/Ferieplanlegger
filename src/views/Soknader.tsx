import { useState } from "react";
import { useApp } from "../App";
import { api } from "../lib/api";
import { HOVEDFERIE, regelsjekk, saldo, sorterAnsatte, type Soknad, type Status } from "../lib/ferie";
import { Sjekkliste, SoknadRad } from "./felles";

export function Soknader() {
  const { d, aar, idag, kjor } = useApp();
  const [kommentar, setKommentar] = useState<Record<string, string>>({});
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "Ukjent";
  const avdNavn = (id: string) => {
    const a = d.ansatte.find((x) => x.id === id);
    return d.avdelinger.find((g) => g.id === a?.avdeling_id)?.navn ?? "";
  };
  const iAar = d.soknader.filter((s) => s.fra.startsWith(`${aar}`));
  const venter = iAar.filter((s) => s.status === "venter").sort((a, b) => a.fra.localeCompare(b.fra));
  const behandlet = iAar.filter((s) => s.status !== "venter").sort((a, b) => a.fra.localeCompare(b.fra));

  const behandle = (s: Soknad, status: Status) =>
    kjor(() => api.behandle(s.id, status, (kommentar[s.id] ?? s.kommentar ?? "").trim()),
      status === "godkjent" ? `Godkjent for ${navn(s.ansatt_id)}` : status === "avslatt" ? `Avslått for ${navn(s.ansatt_id)}` : "Satt tilbake til venter");

  return (
    <>
      <section className="panel">
        <h2>Til behandling</h2>
        {venter.length ? (
          <div className="list">
            {venter.map((s) => {
              const a = d.ansatte.find((x) => x.id === s.ansatt_id);
              const varsler = a ? regelsjekk(d, a, s.fra, s.til, idag, { unntaId: s.id, du: false }).filter((x) => x.niva === "advarsel" || x.niva === "feil") : [];
              return (
                <SoknadRad key={s.id} s={s} navn={navn(s.ansatt_id)} undertekst={avdNavn(s.ansatt_id)}
                  handlinger={<>
                    <button className="btn sm ok" onClick={() => behandle(s, "godkjent")}>Godkjenn</button>
                    <button className="btn sm no" onClick={() => behandle(s, "avslatt")}>Avslå</button>
                  </>}>
                  <Sjekkliste liste={varsler} />
                  <input type="text" id={`kommentar-${s.id}`} aria-label="Kommentar til den ansatte" placeholder="Kommentar til den ansatte (valgfritt)"
                    value={kommentar[s.id] ?? ""} onChange={(e) => setKommentar({ ...kommentar, [s.id]: e.target.value })} />
                </SoknadRad>
              );
            })}
          </div>
        ) : <div className="empty">Ingen søknader venter.</div>}
      </section>

      <section className="panel">
        <h2>Behandlet {aar}</h2>
        {behandlet.length ? (
          <div className="list">
            {behandlet.map((s) => (
              <SoknadRad key={s.id} s={s} navn={navn(s.ansatt_id)} undertekst={avdNavn(s.ansatt_id)}
                handlinger={<button className="btn sm" onClick={() => behandle(s, "venter")}>Angre</button>} />
            ))}
          </div>
        ) : <div className="empty">Ingen behandlede søknader for {aar}.</div>}
      </section>

      <section className="panel">
        <h2>Saldo per ansatt {aar}</h2>
        <div className="scroll" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Ansatt</th><th>Rett</th><th>Godkjent</th><th>Venter</th><th>Igjen</th><th>Hovedferie</th></tr></thead>
            <tbody>
              {sorterAnsatte(d).filter((a) => a.aktiv).map((a) => {
                const s = saldo(a, aar, d);
                return (
                  <tr key={a.id}>
                    <td>{a.navn}</td><td className="n">{s.total}</td><td className="n">{s.godkjent}</td><td className="n">{s.venter}</td>
                    <td className="n" style={s.igjen < 0 ? { color: "var(--warn)" } : undefined}>{s.igjen}</td><td className="n">{Math.min(s.hovedferie, HOVEDFERIE)} / {HOVEDFERIE}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">Ferie som ikke er tatt ved årets slutt kan overføres med skriftlig avtale, inntil 2 uker (10 feriedager). Legg det inn under Oppsett for neste år.</p>
      </section>
    </>
  );
}
