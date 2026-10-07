# Ferieplanlegger

Ferieapp for N L Austnes AS. Ansatte ser saldoen sin, søker ferie og ser hvem som er borte når. Leder godkjenner, setter opp ansatte og får varsel når for mange i samme avdeling er borte samtidig. Appen sjekker søknader mot ferieloven: virkedager med norske helligdager, saldo, 2 måneders varsel og hovedferie.

Appen er en webapp som kan legges på hjemskjermen på mobilen (PWA). Data og innlogging ligger i Supabase.

## Prøv uten oppsett

```bash
npm install
npm run dev
```

Uten Supabase-nøkler starter appen i demomodus med eksempeldata. Du velger hvem du logger inn som.

## Sette opp for ekte bruk

### 1. Supabase (database og innlogging)

1. Lag en gratis konto på [supabase.com](https://supabase.com) og et nytt prosjekt. Velg region **Stockholm (eu-north-1)**.
2. Gå til **SQL Editor**, lim inn hele `supabase/migrations/0001_init.sql` og trykk **Run**.
3. Åpne `supabase/seed.sql`, sjekk at e-posten til leder stemmer, lim inn og trykk **Run**. Da er avdelingene og de 9 ansatte lagt inn.
4. Gå til **Authentication → Emails → Magic Link** og bytt ut innholdet med:
   ```html
   <h2>Logg inn i Ferieplanlegger</h2>
   <p>Koden din er: <strong>{{ .Token }}</strong></p>
   <p>Eller trykk her: <a href="{{ .ConfirmationURL }}">Logg inn</a></p>
   ```
   Koden er viktig på iPhone, der lenken åpnes i Safari og ikke i appen på hjemskjermen.
5. Supabase sin innebygde e-post sender bare noen få e-poster i timen. Sett opp egen SMTP under **Authentication → Emails → SMTP Settings**, for eksempel med [Resend](https://resend.com) og avsender på austnes.no.
6. Hent nøklene under **Project Settings → API**: *Project URL* og *anon public key*.

### 2. Publisere appen (Vercel)

1. Lag konto på [vercel.com](https://vercel.com) med GitHub-kontoen og velg **Add New → Project → Ferieplanlegger**.
2. Legg inn miljøvariablene `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` med nøklene fra Supabase.
3. Trykk **Deploy**. Du får en adresse som `ferieplanlegger.vercel.app`, og kan senere koble på f.eks. `ferie.austnes.no`.
4. I Supabase, gå til **Authentication → URL Configuration** og sett **Site URL** til adressen fra Vercel.

### 3. Ta i bruk

1. Logg inn som leder og legg inn e-posten til hver ansatt under **Oppsett**. Rett navnene som står som plassholdere.
2. Sett «Dager» til 30 for de som har femte ferieuke, og legg inn overført ferie.
3. Send adressen til de ansatte. På iPhone: åpne i Safari, trykk Del og **Legg til på Hjem-skjerm**. På Android: åpne i Chrome, trykk menyen og **Installer app**.

### 4. E-postvarsler (valgfritt)

Leder får e-post når noen søker, og den ansatte får e-post når søknaden er behandlet.

1. Installer [Supabase CLI](https://supabase.com/docs/guides/cli) og kjør `supabase login` og `supabase link`.
2. Legg inn hemmeligheter:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx VARSEL_FRA="Ferieplanlegger <ferie@austnes.no>" APP_URL=https://ferieplanlegger.vercel.app
   ```
3. Publiser funksjonen: `supabase functions deploy varsle`
4. I Supabase, gå til **Database → Webhooks → Create**, velg tabellen `soknader`, hendelsene **Insert** og **Update**, type **Supabase Edge Functions** og funksjonen `varsle`.

## Tilgang og sikkerhet

- Innlogging skjer med engangskode på e-post. Det finnes ingen passord.
- Bare e-postadresser som er registrert som aktive ansatte, får se noe.
- Alle ansatte ser feriekalenderen. Saldo og overført ferie ser bare den ansatte selv og leder.
- Ansatte kan bare sende, endre og trekke egne søknader som venter. Bare leder kan godkjenne.
- Databasen avviser overlappende søknader for samme person, og det må alltid finnes minst én leder.

Reglene ligger i databasen (Row Level Security) og gjelder uansett hva appen sender.

## For utviklere

| Kommando | Gjør |
| --- | --- |
| `npm run dev` | Starter appen lokalt |
| `npm test` | Tester ferielogikken og databasereglene (kjører Postgres i minnet) |
| `npm run build` | Bygger til `dist/` |

- `src/lib/ferie.ts`: helligdager, virkedager, saldo og regelsjekk
- `src/lib/api.ts`: Supabase-tilkoblingen. `src/lib/demo.ts` er demomodus.
- `src/views/`: skjermbildene
- `supabase/migrations/0001_init.sql`: tabeller og tilgangsregler
