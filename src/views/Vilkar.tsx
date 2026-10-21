import { useState } from "react";
import type { Sprak } from "../lib/sprak";
import { Blokker, JuridiskTopp, useJuridisk } from "./Juridisk";

// Avtalevilkår for ByggLogg (abonnementsvilkår og databehandleravtale), versjon 1.0.
// Teksten følger dokumentet «ByggLogg – avtalevilkår og personvern (GDPR)». Avtalen er mellom Jonassen AS og bedriften.
// Den norske teksten gjelder; polsk, engelsk og litauisk er oversettelser (src/lib/juridisk/<språk>.json).

const LEVERANDOR = "Jonassen AS, org.nr. 919 665 319, Lepsøyvegen 210, 6292 Kjerstad";
const SUPPORT = "post@bygglogg.app";

/** Avtalevilkårene, med lenke videre til personvernerklæringen */
export function Vilkar({ lukk, tilPersonvern, sprak = "nb" }: { lukk?: () => void; tilPersonvern?: () => void; sprak?: Sprak }) {
  const [s, setS] = useState<Sprak>(sprak);
  const t = useJuridisk(s);
  const verdier = {
    leverandor: LEVERANDOR,
    support: <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>,
    tilPersonvern: tilPersonvern ? <button type="button" className="linkbtn" onClick={tilPersonvern}>{t.tilPersonvernTekst}</button> : t.tilPersonvernTekst,
  };
  return (
    <section className="panel personvern" data-ikke-oversett lang={s} style={{ gap: 6, lineHeight: 1.5 }}>
      <JuridiskTopp s={s} setS={setS} t={t} lukk={lukk} />
      <Blokker blokker={t.vilkar} verdier={verdier} />
    </section>
  );
}
