-- «Ferdig fakturert»: leder bekrefter at prosjektet er fakturert, og alle fakturerbare timer teller som fakturert
-- (full pott), uansett om fakturaen hadde «Arbeid»-linjer eller ikke.
alter table public.prosjekter add column if not exists fakturert_full boolean not null default false;
