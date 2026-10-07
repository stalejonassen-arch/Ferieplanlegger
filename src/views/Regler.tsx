const REGLER: [string, string, string][] = [
  ["§ 5", "Hvor mye ferie", "25 virkedager hvert ferieår. Virkedager er alle dager unntatt søndager og helligdager, så en uke ferie er 6 virkedager. Ansatte som fyller 60 år i løpet av ferieåret får 6 virkedager ekstra. Tariffavtaler gir ofte en femte ferieuke, altså 30 virkedager."],
  ["§ 6", "Hvem bestemmer tidspunktet", "Arbeidsgiver fastsetter ferien etter å ha drøftet den med den ansatte eller tillitsvalgt. Den ansatte har rett til å få vite tidspunktet senest 2 måneder før ferien starter, med mindre noe annet er avtalt."],
  ["§ 7", "Hovedferie om sommeren", "Den ansatte kan kreve 18 virkedager sammenhengende ferie i perioden 1. juni til 30. september."],
  ["§ 7", "Restferien", "Restferien kan kreves gitt samlet i løpet av ferieåret."],
  ["§ 7", "Ferie skal tas", "Ferien skal tas i ferieåret, og arbeidsgiver skal sørge for at den blir avviklet."],
  ["§ 7", "Overføring", "Inntil 12 virkedager kan overføres til neste ferieår etter skriftlig avtale. Ferie som ikke er tatt på grunn av sykdom eller foreldrepermisjon kan kreves overført."],
  ["§ 9", "Syk i ferien", "Blir den ansatte helt arbeidsufør i ferien og dokumenterer det med legeerklæring, kan hen kreve tilsvarende antall dager utsatt ferie senere i året."],
  ["§ 10", "Feriepenger", "10,2 % av feriepengegrunnlaget fra året før, eller 12 % med femte ferieuke. Ansatte over 60 år får 2,3 prosentpoeng ekstra."],
];

export function Regler() {
  return (
    <>
      <section className="panel" style={{ gap: 6 }}>
        <h2>Ferieloven i korte trekk</h2>
        <p className="muted">Sammendrag for bruk i appen. Det er selve loven og eventuell tariffavtale som gjelder. Les hele ferieloven på <a href="https://lovdata.no/dokument/NL/lov/1988-04-29-21" target="_blank" rel="noopener">Lovdata</a>.</p>
      </section>
      <div className="rules">
        {REGLER.map(([ref, tittel, tekst]) => (
          <div key={tittel} className="rule"><span className="ref">Ferieloven {ref}</span><h3>{tittel}</h3><p>{tekst}</p></div>
        ))}
      </div>
      <section className="panel" style={{ gap: 6 }}>
        <h3>Dette sjekker appen automatisk</h3>
        <p>Antall virkedager med norske helligdager trukket fra, saldo, 2 måneders varsel, hovedferie i sommerperioden, overlapp med egne søknader og at ikke for mange i samme avdeling er borte samtidig.</p>
      </section>
    </>
  );
}
