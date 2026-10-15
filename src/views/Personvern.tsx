import { useState } from "react";
import { PROFIL } from "../lib/profil";

// Personvernerklæring for brukerne av appen (de ansatte), på norsk og polsk.
// Arbeidsgiveren er behandlingsansvarlig. Teksten følger utkastet «ByggLogg – avtalevilkår og personvern (GDPR)».

const FIRMA = PROFIL.id === "austnes"
  ? { navn: "N L Austnes AS", orgnr: "832 507 652", adresse: "Larsnilsvegen 41, 6290 Haramsøy", kontakt: "Ståle Jonassen", epost: "stale.jonassen@austnes.no" }
  : { navn: PROFIL.firma, orgnr: "", adresse: "", kontakt: "daglig leder", epost: "" };

const LEVERANDORER: [string, string, string][] = [
  ["Supabase", "Database, innlogging og lagring av bilder og dokumenter", "Baza danych, logowanie i przechowywanie zdjęć i dokumentów"],
  ["Vercel", "Leverer selve appen til telefonen", "Dostarcza samą aplikację na telefon"],
  ["Resend", "Sender e-post (innloggingskoder og varsler)", "Wysyła e-maile (kody logowania i powiadomienia)"],
  ["Google, Apple, Mozilla, Microsoft", "Leverer push-varsler til telefonen, hvis du slår dem på", "Dostarczają powiadomienia push na telefon, jeśli je włączysz"],
];

function Norsk() {
  return (
    <>
      <h2 style={{ margin: 0 }}>Personvern i ByggLogg</h2>
      <p><b>{FIRMA.navn}</b>{FIRMA.orgnr && ` (org.nr. ${FIRMA.orgnr})`} bruker ByggLogg til timeføring, ferie og fravær, prosjekter og intern kommunikasjon. {FIRMA.navn} er behandlingsansvarlig for opplysningene om deg.</p>
      <h3>Hva vi registrerer</h3>
      <p>Navn, e-post, telefon, ansattnummer, timer og stemplinger, ferie og fravær, kjøring, utstyr og arbeidstøy, kurs og kompetansebevis, og meldinger og bilder du legger inn selv. Ved sykdom registreres bare typen fravær (egenmelding, sykmelding, sykt barn), aldri diagnose.</p>
      <h3>Hvorfor</h3>
      <p>For å beregne lønn og feriepenger, ha oversikt over arbeidstiden slik arbeidsmiljøloven krever, følge opp prosjekter, fakturere kunder og dokumentere arbeidet. Grunnlaget er arbeidsavtalen din og pliktene vi har etter loven (personvernforordningen artikkel 6 nr. 1 b og c, og artikkel 9 nr. 2 b for fravær ved sykdom).</p>
      <h3>Hvem ser hva</h3>
      <p>Du ser dine egne timer, fravær og lønnsgrunnlag. Leder ser alle ansatte. Kolleger ser navnet ditt, felles chat og prosjektchat, og hvem som er på samme prosjekt. Private meldinger mellom to personer kan bare de to lese.</p>
      <h3>Stempling og varsler</h3>
      <p>Stemplingen viser når du starter og slutter. Har du vært stemplet inn lenge, får du et push-varsel som minner deg på å stemple ut. Appen sporer ikke hvor du er. Push-varsler får du bare hvis du slår dem på.</p>
      <h3>Hvor lenge</h3>
      <p>Timer, fravær og lønnsgrunnlag lagres i 5 år etter regnskapsåret (bokføringsloven). Prosjektdokumentasjon og bilder lagres i minst 5 år etter at jobben er overlevert. Chat lagres i 2 år. Når du slutter, stenges tilgangen din.</p>
      <h3>Hvem som behandler opplysningene for oss</h3>
      <p>Opplysningene lagres i EU (Irland). Disse leverandørene hjelper oss med å drive appen, og behandler opplysningene bare på våre vegne:</p>
      <ul>{LEVERANDORER.map(([l, nb]) => <li key={l}><b>{l}</b>: {nb}</li>)}</ul>
      <p>Adresser til prosjekter slås opp hos Kartverket for å vise kart og avstand. Opplysninger om deg selges eller brukes aldri til reklame.</p>
      <h3>Rettighetene dine</h3>
      <p>Du kan be om innsyn i hva som er lagret om deg, få rettet feil, be om sletting der loven tillater det, og få en kopi av opplysningene dine. Kontakt {FIRMA.kontakt}{FIRMA.epost && <> på <a href={`mailto:${FIRMA.epost}`}>{FIRMA.epost}</a></>}. Du kan også klage til <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer">Datatilsynet</a>.</p>
    </>
  );
}

function Polsk() {
  return (
    <>
      <h2 style={{ margin: 0 }}>Ochrona danych osobowych w ByggLogg</h2>
      <p><b>{FIRMA.navn}</b>{FIRMA.orgnr && ` (nr org. ${FIRMA.orgnr})`} używa ByggLogg do rejestracji czasu pracy, urlopów i nieobecności, projektów i komunikacji wewnętrznej. {FIRMA.navn} jest administratorem Twoich danych osobowych.</p>
      <h3>Co rejestrujemy</h3>
      <p>Imię i nazwisko, e-mail, telefon, numer pracownika, godziny pracy i odbicia, urlopy i nieobecności, przejazdy, narzędzia i odzież roboczą, kursy i uprawnienia oraz wiadomości i zdjęcia, które sam dodajesz. W przypadku choroby zapisywany jest tylko rodzaj nieobecności (zgłoszenie własne, zwolnienie lekarskie, chore dziecko), nigdy diagnoza.</p>
      <h3>Dlaczego</h3>
      <p>Aby obliczyć wynagrodzenie i dodatek urlopowy, prowadzić ewidencję czasu pracy zgodnie z norweską ustawą o środowisku pracy, prowadzić projekty, wystawiać faktury klientom i dokumentować pracę. Podstawą jest Twoja umowa o pracę i nasze obowiązki prawne (RODO art. 6 ust. 1 lit. b i c oraz art. 9 ust. 2 lit. b w przypadku nieobecności z powodu choroby).</p>
      <h3>Kto widzi co</h3>
      <p>Widzisz swoje godziny, nieobecności i podstawę wynagrodzenia. Kierownik widzi wszystkich pracowników. Współpracownicy widzą Twoje imię, wspólny czat i czat projektu oraz to, kto pracuje przy tym samym projekcie. Prywatne wiadomości między dwiema osobami mogą czytać tylko te dwie osoby.</p>
      <h3>Odbicia i powiadomienia</h3>
      <p>Odbicie pokazuje, kiedy zaczynasz i kończysz pracę. Jeśli jesteś zalogowany długo, dostaniesz powiadomienie push z przypomnieniem o wylogowaniu. Aplikacja nie śledzi, gdzie jesteś. Powiadomienia push otrzymujesz tylko, jeśli je włączysz.</p>
      <h3>Jak długo</h3>
      <p>Godziny, nieobecności i podstawa wynagrodzenia są przechowywane przez 5 lat po zakończeniu roku obrachunkowego (norweska ustawa o księgowości). Dokumentacja projektów i zdjęcia są przechowywane co najmniej 5 lat po przekazaniu pracy. Czat jest przechowywany przez 2 lata. Gdy kończysz pracę, Twój dostęp zostaje zamknięty.</p>
      <h3>Kto przetwarza dane w naszym imieniu</h3>
      <p>Dane są przechowywane w UE (Irlandia). Ci dostawcy pomagają nam prowadzić aplikację i przetwarzają dane wyłącznie w naszym imieniu:</p>
      <ul>{LEVERANDORER.map(([l, , pl]) => <li key={l}><b>{l}</b>: {pl}</li>)}</ul>
      <p>Adresy projektów są sprawdzane w norweskim urzędzie Kartverket, aby pokazać mapę i odległość. Twoje dane nigdy nie są sprzedawane ani wykorzystywane do reklamy.</p>
      <h3>Twoje prawa</h3>
      <p>Możesz poprosić o dostęp do danych o sobie, ich sprostowanie, usunięcie tam, gdzie pozwala na to prawo, oraz o kopię swoich danych. Kontakt: {FIRMA.kontakt}{FIRMA.epost && <>,  <a href={`mailto:${FIRMA.epost}`}>{FIRMA.epost}</a></>}. Możesz też złożyć skargę do norweskiego organu ochrony danych, <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer">Datatilsynet</a>.</p>
    </>
  );
}

/** Personvernerklæringen, med valg mellom norsk og polsk */
export function Personvern({ sprak = "nb", lukk }: { sprak?: "nb" | "pl"; lukk?: () => void }) {
  const [s, setS] = useState<"nb" | "pl">(sprak);
  return (
    <section className="panel personvern" data-ikke-oversett style={{ gap: 6, lineHeight: 1.5 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="row" role="group" aria-label="Språk" style={{ gap: 6 }}>
          <button className={`btn sm${s === "nb" ? " primary" : ""}`} aria-pressed={s === "nb"} onClick={() => setS("nb")}>Norsk</button>
          <button className={`btn sm${s === "pl" ? " primary" : ""}`} aria-pressed={s === "pl"} onClick={() => setS("pl")}>Polski</button>
        </div>
        {lukk && <button className="btn sm" onClick={lukk}>{s === "pl" ? "Zamknij" : "Lukk"}</button>}
      </div>
      {s === "pl" ? <Polsk /> : <Norsk />}
      <p className="small muted" style={{ marginTop: 8 }}>{s === "pl" ? "Ostatnia aktualizacja: 15 października 2026" : "Sist oppdatert 15. oktober 2026"}</p>
    </section>
  );
}
