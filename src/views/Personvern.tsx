import { useState } from "react";
import { PROFIL } from "../lib/profil";
import type { Sprak } from "../lib/sprak";
import { Blokker, JuridiskTopp, useJuridisk } from "./Juridisk";

// Personvernerklæring for brukerne av appen (de ansatte), på norsk, polsk, engelsk og litauisk.
// Arbeidsgiveren er behandlingsansvarlig. Teksten følger utkastet «ByggLogg – avtalevilkår og personvern (GDPR)».
// Selve teksten ligger i src/lib/juridisk/<språk>.json.

const FIRMA = PROFIL.id === "austnes"
  ? { navn: "N L Austnes AS", orgnr: "832 507 652", adresse: "Larsnilsvegen 41, 6290 Haramsøy", kontakt: "Ståle Jonassen", epost: "stale.jonassen@austnes.no" }
  : { navn: PROFIL.firma, orgnr: "", adresse: "", kontakt: "daglig leder", epost: "" };

/** Personvernerklæringen, med valg mellom de fire språkene */
export function Personvern({ sprak = "nb", lukk, tilVilkar }: { sprak?: Sprak; lukk?: () => void; tilVilkar?: () => void }) {
  const [s, setS] = useState<Sprak>(sprak);
  const t = useJuridisk(s);
  const verdier = {
    firma: FIRMA.navn,
    orgnr: FIRMA.orgnr ? ` (${t.ui.orgnr} ${FIRMA.orgnr})` : "",
    kontakt: FIRMA.kontakt,
    epost: FIRMA.epost ? <> {t.ui.kontaktPaa} <a href={`mailto:${FIRMA.epost}`}>{FIRMA.epost}</a></> : "",
  };
  return (
    <section className="panel personvern" data-ikke-oversett lang={s} style={{ gap: 6, lineHeight: 1.5 }}>
      <JuridiskTopp s={s} setS={setS} t={t} lukk={lukk} />
      <Blokker blokker={t.personvern} verdier={verdier} />
      {tilVilkar && <p className="small"><button type="button" className="linkbtn" onClick={tilVilkar}>{t.ui.tilVilkar}</button></p>}
      <p className="small muted" style={{ marginTop: 8 }}>{t.ui.sistOppdatert}</p>
    </section>
  );
}
