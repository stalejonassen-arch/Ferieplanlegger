// Ukesjekk for leder: det som trenger deg før helgen, samlet på ett sted.
// Åpen fredag og mandag, ellers sammenfoldet. Fredag kl. 13 kommer også et push-varsel med det viktigste.
import { useApp } from "../App";
import { helligdag } from "../lib/ferie";
import { ukenr } from "../lib/timer";
import { ukesjekk } from "../lib/ukesjekk";
import { useTilbud } from "./Tilbud";

export function Ukesjekk() {
  const { d, idag } = useApp();
  const { liste } = useTilbud();
  const punkter = ukesjekk(d, idag, liste ?? [], helligdag);
  const avvik = punkter.filter((p) => !p.ok);
  const dag = new Date(`${idag}T12:00:00Z`).getUTCDay();
  return (
    <details className="panel ukesjekk" open={dag === 5 || dag === 1 || undefined}>
      <summary>
        <b>{`Ukesjekk · uke ${ukenr(idag)}`}</b>{" "}
        {avvik.length ? <span className="chip venter">{avvik.length === 1 ? "1 ting trenger deg" : `${avvik.length} ting trenger deg`}</span> : <span className="chip godkjent">Alt i rute</span>}
      </summary>
      <ul className="ukesjekk-liste">
        {punkter.map((p) => (
          <li key={p.id} className={p.ok ? "ok" : "ikke"}>
            <span aria-hidden="true">{p.ok ? "✓" : "!"}</span>
            <a href={p.lenke}><span>{p.tittel}</span>{p.detalj && <span className="small muted ukesjekk-detalj" data-ikke-oversett={p.id === "mangler" || p.id === "avvik" || p.id === "reklamasjon" ? "" : undefined}>{p.detalj}</span>}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}
