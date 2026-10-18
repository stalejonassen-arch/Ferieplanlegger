-- Kontaktperson og telefon på prosjektet (den som er på stedet, ikke nødvendigvis kunden i Visma).
-- Visma-synken rører ikke disse feltene.
alter table public.prosjekter add column if not exists kontakt_navn text not null default '';
alter table public.prosjekter add column if not exists kontakt_telefon text not null default '';
