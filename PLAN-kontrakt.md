# ByggLogg Kontrakt – plan for piloten

Mål: en NS-kontraktsmodul i ByggLogg som holder orden på frister, varsler og endringer, klar til test på ett prosjekt hos Strand Fasade.
Appen avgjør ingen juridiske spørsmål. Teksten i NS-standardene gjengis ikke, bare punktnumre.

## Regler for hver kjøring

- Jobb bare på grenen `kontrakt-pilot`. Aldri flett inn i `main`, aldri deploy.
- Ingen migreringer mot den ekte Supabase-databasen, ingen e-post eller push til ekte mottakere.
- Før hver commit: `npx tsc -b` og `npx vitest run` skal være grønne (unntatt den kjente `svenn.test.ts`-feilen som mangler testfil).
- Ta ett steg (eller en naturlig del av et steg) per kjøring. Kryss av, og skriv kort i loggen nederst.
- Følg stilen i appen: norsk bokmål i kode og tekster, samme mønster som `tillegg`, `avvik` og `befaring`, og legg nye tekster inn i `en.ts`, `pl.ts` og `lt.ts`.
- Trengs et valg som er Ståles (utseende, ordlyd mot byggherren, regler, avsenderadresse), skriv spørsmålet under «Spørsmål til Ståle» og hopp til et annet steg.

## Steg

- [x] 1. Database: `0086_kontrakt.sql` (kontrakter, kontraktsfrister, NS-saker, varsler, kobling fra tillegg og timer) med tilgangstester.
- [x] 2. Regler og fristmotor: `src/lib/ns.ts` med tester (`test/ns.test.ts`).
- [x] 3. API og demo: typer og kall i `src/lib/api.ts`, og et demoprosjekt med NS 8405-kontrakt, saker og varsler i `src/lib/demo.ts`.
- [ ] 4. Modul «Kontrakt» i `moduler.ts`, av som standard (slås på per bedrift under Oppsett).
- [ ] 5. Kontrakt-fanen på prosjektet (PC): kontraktskort (registrer og rediger), fristliste fra fristmotoren, liste over saker.
- [ ] 6. «Meld hendelse» på mobil: fra prosjektet, og som knapp fra avvik og dagbok. Type, kort tekst, bilde. Tre trykk.
- [ ] 7. Sak og varsel: sakside med historikk, varselutkast fylt ut fra saken (med punkthenvisning), PDF, «marker som sendt». Selve e-postsendingen venter på Ståle.
- [ ] 8. Endringsregister: tillegg koblet til sak, med NS-status og sum. På NS-prosjekter godkjennes endringsordren av byggherrens representant, ikke kunden på skjermen.
- [ ] 9. Fristvarsler: fristmotoren inn i `supabase/functions/paaminnelse` (push til prosjektleder, purring til daglig leder når fristen er passert). Skrives og testes, ikke deployes.
- [ ] 10. Fristoversikt for daglig leder på tvers av prosjekter.
- [ ] 11. Gjennomgang i demo-modus, skjermbilder fra mobil og PC, og en oppsummering til Ståle med det som må godkjennes før drift.

## Spørsmål til Ståle

(ingen ennå)

## Logg

- 2026-11-25: Steg 1 og 2 ferdig. Migrering 0086 og fristmotor med tester. Regeltabellen bruker bare punktnumre som er kontrollert mot CMS Kluge; resten står tomt til advokat har sett over.
- 2026-11-25: Steg 3 ferdig. Typer i `ns.ts`, kall i `api.ts` (egen realtime-kanal, tomme lister hvis tabellene mangler), demoprosjekt «Ny fasade og balkonger, Blomstergata 3» med NS 8405-kontrakt, tre saker, varsler og EO-tillegg. Demoen følger samme regler som databasen; tester i `test/kontrakt.test.ts`.
