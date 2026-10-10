-- Fastprisjobber faktureres uten produktet «Arbeid», så timene der holdes utenfor sammenligningen
-- av registrerte og fakturerte timer. Leder krysser av på prosjektet.
alter table public.prosjekter add column if not exists fastpris boolean not null default false;
