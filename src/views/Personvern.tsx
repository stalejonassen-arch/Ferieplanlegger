import { useState } from "react";
import type { Bedrift } from "../lib/ferie";
import { firma } from "../lib/profil";
import type { Sprak } from "../lib/sprak";
import { Blokker, JuridiskTopp, useJuridisk } from "./Juridisk";

// Personvernerklæring for brukerne av appen (de ansatte), på norsk, polsk, engelsk og litauisk.
// Arbeidsgiveren er behandlingsansvarlig. Teksten følger utkastet «ByggLogg – avtalevilkår og personvern (GDPR)».
// Selve teksten ligger i src/lib/juridisk/<språk>.json.

// Når ingen er logget inn, vet vi ikke hvilken bedrift det gjelder
const UKJENT: Record<Sprak, { navn: string; kontakt: string }> = {
  nb: { navn: "Arbeidsgiveren din", kontakt: "arbeidsgiveren din" },
  pl: { navn: "Twój pracodawca", kontakt: "Twój pracodawca" },
  en: { navn: "Your employer", kontakt: "your employer" },
  lt: { navn: "Jūsų darbdavys", kontakt: "savo darbdavį" },
};
const LEDER: Record<Sprak, string> = { nb: "daglig leder", pl: "dyrektor zarządzający", en: "the managing director", lt: "įmonės vadovą" };

type Firma = { navn: string; orgnr: string; kontakt: string; epost: string };
/** Arbeidsgiveren (behandlingsansvarlig): fra bedriftens profil når brukeren er logget inn */
const lagFirma = (b: Bedrift | null | undefined, s: Sprak): Firma => {
  if (!b) return { ...UKJENT[s], orgnr: "", epost: "" };
  const f = firma(b);
  return { navn: f.navn, orgnr: f.orgnr, kontakt: LEDER[s], epost: f.epost };
};

/** Personvernerklæringen, med valg mellom de fire språkene */
export function Personvern({ sprak = "nb", lukk, tilVilkar, bedrift }: { sprak?: Sprak; lukk?: () => void; tilVilkar?: () => void; bedrift?: Bedrift | null }) {
  const [s, setS] = useState<Sprak>(sprak);
  const t = useJuridisk(s);
  const FIRMA = lagFirma(bedrift, s);
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
