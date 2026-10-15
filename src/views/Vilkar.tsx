// Avtalevilkår for ByggLogg (abonnementsvilkår og databehandleravtale), versjon 1.0.
// Teksten følger dokumentet «ByggLogg – avtalevilkår og personvern (GDPR)». Avtalen er mellom Jonassen AS og bedriften,
// så den finnes bare på norsk. Personvernerklæringen for de ansatte (Del 3) ligger i Personvern.tsx, på norsk og polsk.

const LEVERANDOR = "Jonassen AS, org.nr. 919 665 319";
const SUPPORT = "post@bygglogg.app";

const UNDERDATABEHANDLERE: [string, string, string, string][] = [
  ["Supabase Inc.", "Database, innlogging, fillagring, bakgrunnsjobber", "EU (Irland)", "Lagres i EØS. Selskapet er amerikansk: EUs standardavtaler (SCC)"],
  ["Vercel Inc.", "Leverer appen og adressene på bygglogg.app til nettleseren", "Globalt nett, logger IP-adresser", "EU–US Data Privacy Framework / SCC"],
  ["Resend", "Sender e-post (innloggingskoder, varsler, påminnelser)", "USA", "SCC / DPF"],
  ["Google, Apple, Mozilla, Microsoft", "Leverer push-varsler til telefonen", "Varierer", "Varselteksten går gjennom leverandøren av telefonens nettleser"],
];

function Punkt({ nr, tittel, children }: { nr: number; tittel: string; children: React.ReactNode }) {
  return <div><h3 style={{ fontSize: 17, marginTop: 10 }}>{nr}. {tittel}</h3>{children}</div>;
}

/** Avtalevilkårene, med lenke videre til personvernerklæringen */
export function Vilkar({ lukk, tilPersonvern, sprak = "nb" }: { lukk?: () => void; tilPersonvern?: () => void; sprak?: "nb" | "pl" }) {
  return (
    <section className="panel personvern" data-ikke-oversett style={{ gap: 6, lineHeight: 1.5 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Avtalevilkår for ByggLogg</h2>
        {lukk && <button className="btn sm" onClick={lukk}>{sprak === "pl" ? "Zamknij" : "Lukk"}</button>}
      </div>
      {sprak === "pl" && <p className="small muted">Umowa jest zawarta między Jonassen AS a pracodawcą i jest dostępna tylko po norwesku. Informacje o Twoich danych znajdziesz w zakładce „Ochrona danych”.</p>}
      <p>Vilkårene gjelder for abonnement på ByggLogg fra {LEVERANDOR}. Avtalen har fire deler: abonnementsvilkårene (Del 1), databehandleravtalen (Del 2), personvernerklæringen bedriften gir sine ansatte (Del 3) og ordrebekreftelsen (Del 4), som signeres av begge parter.</p>
      <p>Bedriften er <b>behandlingsansvarlig</b> for opplysningene om sine ansatte og kunder. Jonassen AS er <b>databehandler</b> og behandler opplysningene bare på bedriftens vegne.</p>
      <p className="small muted">Versjon 1.0, gjeldende fra 15. oktober 2026. Ved motstrid går ordrebekreftelsen foran vilkårene. For personopplysninger går databehandleravtalen foran begge.</p>

      <h2 style={{ marginTop: 14 }}>Del 1 – Abonnementsvilkår</h2>
      <p>Vilkårene gjelder når en bedrift tegner abonnement på ByggLogg. Sammen med ordrebekreftelsen utgjør de hele avtalen.</p>
      <Punkt nr={1} tittel="Parter"><p>Leverandør: {LEVERANDOR} («Leverandøren»). Kunde: bedriften som står i ordrebekreftelsen («Kunden»).</p></Punkt>
      <Punkt nr={2} tittel="Tjenesten"><p>ByggLogg er en nettbasert app for timeføring, stempling, ferie og fravær, prosjekter, dagbok, bilder, avvik, chat, utstyr og kompetansebevis. Tjenesten leveres som den er til enhver tid, og Leverandøren kan forbedre og endre funksjoner. Funksjoner Kunden betaler ekstra for, står i ordrebekreftelsen. Tjenesten leveres på bygglogg.app, og hver kunde får sin egen adresse, for eksempel firmanavn.bygglogg.app. Navnet og logoen ByggLogg og selve programvaren tilhører Leverandøren. Kunden får bruksrett så lenge avtalen løper.</p></Punkt>
      <Punkt nr={3} tittel="Pris og betaling"><ul>
        <li>Pris: 249 kr per aktiv bruker per måned, eks. mva. En bruker er aktiv når vedkommende kan logge inn. Minst 5 brukere per bedrift.</li>
        <li>Faktureres månedlig forskuddsvis, 14 dagers betalingsfrist.</li>
        <li>Prisen kan justeres med 30 dagers varsel, tidligst 12 måneder etter oppstart.</li>
        <li>Tillegg for kobling mot Visma Business NXT: 490 kr per bedrift per måned, og 2 500 kr i oppstart (engangsbeløp).</li>
        <li>Ved forsinket betaling kan tilgangen stenges etter skriftlig varsel og 14 dagers frist. Dataene slettes ikke ved stenging.</li>
      </ul></Punkt>
      <Punkt nr={4} tittel="Varighet og oppsigelse"><ul>
        <li>Avtalen løper til den sies opp. Gjensidig oppsigelsestid: 1 måned regnet fra utgangen av måneden.</li>
        <li>Eventuell prøveperiode og pris i prøveperioden står i ordrebekreftelsen. Etter prøveperioden gjelder ordinær pris, om ikke Kunden sier opp før den er over.</li>
      </ul></Punkt>
      <Punkt nr={5} tittel="Drift, sikkerhetskopi og support"><ul>
        <li>Leverandøren tilstreber at tjenesten er tilgjengelig hele døgnet, men garanterer ikke en bestemt oppetid. Planlagt vedlikehold varsles og legges utenom arbeidstid.</li>
        <li>Databasen sikkerhetskopieres daglig av driftsleverandøren og beholdes i 7 dager.</li>
        <li>Support på e-post {SUPPORT}, hverdager kl. 08–16. Svar innen én arbeidsdag.</li>
      </ul></Punkt>
      <Punkt nr={6} tittel="Kundens ansvar"><ul>
        <li>Kunden bestemmer hvem som får tilgang, og fjerner tilgangen når noen slutter.</li>
        <li>Kunden sørger for at de ansatte er informert om appen og hvilke opplysninger som registreres (se Del 3).</li>
        <li>Kunden er ansvarlig for at innholdet som legges inn, er lovlig, og for at timer og lønnsgrunnlag kontrolleres før utbetaling.</li>
        <li>Tiltak som kan være kontrolltiltak etter arbeidsmiljøloven kapittel 9 (for eksempel stempling og varsel om at noen fortsatt er stemplet inn), skal drøftes med de ansatte før de tas i bruk.</li>
      </ul></Punkt>
      <Punkt nr={7} tittel="Kundens data"><ul>
        <li>Alle data Kunden legger inn, tilhører Kunden. Leverandøren bruker dem bare for å levere tjenesten (se Del 2).</li>
        <li>Kunden kan når som helst få utlevert sine data i vanlige filformater (CSV/Excel og originalfiler for bilder og dokumenter).</li>
        <li>Ved opphør får Kunden 30 dager til å hente ut dataene. Deretter slettes de, også fra sikkerhetskopier innen 30 dager.</li>
      </ul></Punkt>
      <Punkt nr={8} tittel="Ansvarsbegrensning"><ul>
        <li>Leverandøren er ikke ansvarlig for indirekte tap, som tapt fortjeneste eller tap av data som skyldes Kundens egne feil.</li>
        <li>Leverandørens samlede ansvar per kalenderår er begrenset til det Kunden har betalt de siste 12 månedene.</li>
        <li>Begrensningene gjelder ikke ved grov uaktsomhet eller forsett.</li>
      </ul></Punkt>
      <Punkt nr={9} tittel="Endringer i vilkårene"><p>Endringer varsles minst 30 dager før de trer i kraft. Kunden kan si opp med virkning fra endringsdatoen hvis endringen er til ulempe for Kunden.</p></Punkt>
      <Punkt nr={10} tittel="Lovvalg og tvister"><p>Norsk rett gjelder. Partene skal først forsøke å løse uenighet ved forhandling. Verneting er Møre og Romsdal tingrett.</p></Punkt>

      <h2 style={{ marginTop: 14 }}>Del 2 – Databehandleravtale (GDPR artikkel 28)</h2>
      <p>Avtalen er et vedlegg til abonnementsvilkårene og går foran dem når det gjelder personopplysninger.</p>
      <Punkt nr={1} tittel="Roller og formål"><p>Kunden er behandlingsansvarlig. Leverandøren er databehandler og behandler personopplysninger bare for å levere ByggLogg til Kunden: timeføring og lønnsgrunnlag, ferie og fravær, prosjektstyring og dokumentasjon, intern kommunikasjon og varsler.</p></Punkt>
      <Punkt nr={2} tittel="Hvilke opplysninger og om hvem"><ul>
        <li><b>Kundens ansatte:</b> navn, e-post, telefon, ansattnummer, avdeling, rolle, språk, timer og stemplinger, ferie, kjøring, utstyr, kompetansebevis og sertifikater, chatmeldinger, bilder og innlogginger. Fraværstype ved sykdom (egenmelding, sykmelding, sykt barn) er helseopplysninger etter artikkel 9. Diagnose lagres ikke.</li>
        <li><b>Kundens kunder og kontaktpersoner:</b> navn, adresse, telefon, e-post, eiendomsdata (gårds- og bruksnummer), bilder og dokumenter fra jobben. Ingen særlige kategorier.</li>
      </ul></Punkt>
      <Punkt nr={3} tittel="Instrukser"><p>Leverandøren behandler opplysningene bare etter Kundens dokumenterte instrukser. Denne avtalen og bruken av funksjonene i appen er instruksene. Opplysningene brukes ikke til egne formål, reklame eller salg til andre.</p></Punkt>
      <Punkt nr={4} tittel="Taushetsplikt"><p>Alle hos Leverandøren som har tilgang, har taushetsplikt. Leverandøren går bare inn i Kundens data når det trengs for support eller feilretting, og bare etter avtale med Kunden.</p></Punkt>
      <Punkt nr={5} tittel="Sikkerhet (artikkel 32)"><ul>
        <li>Data lagres kryptert og overføres bare kryptert (HTTPS).</li>
        <li>Hver bedrift ser bare sine egne data. Det er håndhevet i databasen med radnivåsikkerhet, ikke bare i appen.</li>
        <li>Innlogging med engangskode på e-post, ingen passord å lekke.</li>
        <li>Ansatte ser bare egne timer, fravær og lønnsgrunnlag. Leder ser hele bedriften.</li>
        <li>Hemmelige nøkler (Visma, e-post, push) ligger bare hos driftsleverandøren, aldri i appen.</li>
        <li>Daglig sikkerhetskopi.</li>
      </ul></Punkt>
      <Punkt nr={6} tittel="Underdatabehandlere"><p>Kunden godkjenner underdatabehandlerne i tabellen. Nye varsles minst 30 dager før bruk, og Kunden kan protestere og si opp.</p>
        <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Leverandør</th><th>Hva den gjør</th><th>Hvor data lagres</th><th>Grunnlag for overføring</th></tr></thead>
          <tbody>{UNDERDATABEHANDLERE.map(([a, b, c, d]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>)}</tbody></table></div>
        <p className="small muted">Oppslag som ikke inneholder personopplysninger om de ansatte, men adresser: Kartverket (adressesøk og kart, Norge) og en rutetjeneste for kjøreavstand. Visma Business NXT er Kundens eget system og Kundens egen databehandler. ByggLogg leser bare derfra.</p>
      </Punkt>
      <Punkt nr={7} tittel="Overføring utenfor EØS"><p>Skjer bare til leverandørene i tabellen og bare med gyldig overføringsgrunnlag (DPF-sertifisering eller EUs standardavtaler).</p></Punkt>
      <Punkt nr={8} tittel="Bistand til Kunden"><p>Leverandøren hjelper Kunden med å svare på krav om innsyn, retting, sletting og dataportabilitet, og med vurderinger av personvernkonsekvenser (DPIA), innen rimelig tid.</p></Punkt>
      <Punkt nr={9} tittel="Avvik"><p>Leverandøren varsler Kunden uten ugrunnet opphold, og senest innen 24 timer etter å ha oppdaget et brudd på personopplysningssikkerheten. Kunden melder selv til Datatilsynet innen 72 timer der det kreves.</p></Punkt>
      <Punkt nr={10} tittel="Revisjon"><p>Kunden kan be om dokumentasjon på at avtalen følges, én gang per år eller etter et avvik.</p></Punkt>
      <Punkt nr={11} tittel="Opphør"><p>Ved opphør får Kunden utlevert alle data og har 30 dager til å hente dem. Deretter sletter Leverandøren dataene, også fra sikkerhetskopier innen 30 dager, og bekrefter slettingen skriftlig.</p></Punkt>

      <h2 style={{ marginTop: 14 }}>Del 3 – Personvernerklæring for de ansatte</h2>
      <p>Personvernerklæringen ligger i appen på norsk og polsk{tilPersonvern ? <>: <button type="button" className="linkbtn" onClick={tilPersonvern}>les personvernerklæringen</button>.</> : "."}</p>

      <h2 style={{ marginTop: 14 }}>Del 4 – Ordrebekreftelse</h2>
      <p>Kunde, antall brukere, eventuell Visma-kobling, prøveperiode, startdato og Kundens adresse i appen står i ordrebekreftelsen, som signeres av begge parter. Spørsmål om avtalen: {SUPPORT}.</p>
    </section>
  );
}
