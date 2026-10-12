import { useApp } from "../App";
import { addDays, periode, sorterAnsatte, vd, virkedager } from "../lib/ferie";
import { FRAVAER_TYPE } from "../lib/fravaer";
import { initialer } from "../lib/chat";

const STATUS = { venter: "Venter", godkjent: "Godkjent", avslatt: "Avslått" };

/** Oversikt øverst i ferie: hvem er borte i dag, kommende ferie og søknader som venter. Bare visning. */
export function FerieOversikt() {
  const { d, meg, leder, idag } = useApp();
  const navn = (id: string) => d.ansatte.find((a) => a.id === id)?.navn ?? "Ukjent";
  const aktive = new Set(sorterAnsatte(d).filter((a) => a.aktiv).map((a) => a.id));
  const om60 = addDays(idag, 60);

  const ferieIdag = d.soknader.filter((s) => s.status === "godkjent" && s.fra <= idag && s.til >= idag && aktive.has(s.ansatt_id));
  const sykIdag = (d.fravaer ?? []).filter((f) => f.fra <= idag && f.til >= idag && aktive.has(f.ansatt_id) && !ferieIdag.some((s) => s.ansatt_id === f.ansatt_id));
  const borte = [
    ...ferieIdag.map((s) => ({ id: s.ansatt_id, type: "ferie" as const, tekst: s.til === idag ? "Ferie, tilbake i morgen" : `Ferie til ${periode(s.til, s.til)}` })),
    ...sykIdag.map((f) => ({ id: f.ansatt_id, type: "fravaer" as const, tekst: FRAVAER_TYPE[f.type] })),
  ];
  const kommende = d.soknader
    .filter((s) => s.status !== "avslatt" && s.fra > idag && s.fra <= om60 && aktive.has(s.ansatt_id))
    .sort((a, b) => a.fra.localeCompare(b.fra));
  const venter = d.soknader.filter((s) => s.status === "venter" && s.til >= idag && (leder || s.ansatt_id === meg.id)).sort((a, b) => a.fra.localeCompare(b.fra));
  const iArbeid = aktive.size - borte.length;

  return (
    <section className="ferie-dash" aria-label="Ferieoversikt">
      <div className="fd-kort fd-idag">
        <div className="fd-topp"><span className="fd-tittel">Borte i dag</span><span className="fd-tall">{borte.length}</span></div>
        <div className="fd-under">{iArbeid} på jobb · {new Date(idag + "T12:00:00").toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })}</div>
        {borte.length ? (
          <ul className="fd-liste">
            {borte.map((b) => (
              <li key={b.id + b.type}>
                <span className={`fd-avatar ${b.type}`} aria-hidden="true">{initialer(navn(b.id))}</span>
                <span className="fd-navn"><b data-ikke-oversett>{navn(b.id)}</b><span>{b.tekst}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="fd-tom">Alle er på jobb i dag.</p>}
      </div>

      <div className="fd-kort">
        <div className="fd-topp"><span className="fd-tittel">Kommende ferie</span><span className="fd-tall">{kommende.length}</span></div>
        <div className="fd-under">Neste 60 dager</div>
        {kommende.length ? (
          <ul className="fd-liste">
            {kommende.slice(0, 6).map((s) => (
              <li key={s.id}>
                <span className={`fd-avatar ${s.status}`} aria-hidden="true">{initialer(navn(s.ansatt_id))}</span>
                <span className="fd-navn"><b data-ikke-oversett>{navn(s.ansatt_id)}</b><span>{periode(s.fra, s.til)} · {vd(virkedager(s.fra, s.til))}</span></span>
                <span className={`chip ${s.status}`}>{STATUS[s.status]}</span>
              </li>
            ))}
            {kommende.length > 6 && <li className="fd-mer">+ {kommende.length - 6} til i kalenderen</li>}
          </ul>
        ) : <p className="fd-tom">Ingen ferie de neste 60 dagene.</p>}
      </div>

      <div className={`fd-kort ${venter.length ? "fd-venter" : ""}`}>
        <div className="fd-topp"><span className="fd-tittel">{leder ? "Venter på godkjenning" : "Dine søknader som venter"}</span><span className="fd-tall">{venter.length}</span></div>
        <div className="fd-under">{venter.length ? (leder ? "Søknader som må behandles" : "Leder har ikke svart ennå") : "Alt er behandlet"}</div>
        {venter.length ? (
          <ul className="fd-liste">
            {venter.slice(0, 4).map((s) => (
              <li key={s.id}>
                <span className="fd-avatar venter" aria-hidden="true">{initialer(navn(s.ansatt_id))}</span>
                <span className="fd-navn"><b data-ikke-oversett>{navn(s.ansatt_id)}</b><span>{periode(s.fra, s.til)} · {vd(virkedager(s.fra, s.til))}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="fd-tom">Ingen søknader venter. 🌿</p>}
        {leder && venter.length > 0 && location.hash !== "#sok" && <a className="btn primary fd-knapp" href="#sok">Behandle søknader</a>}
      </div>
    </section>
  );
}
