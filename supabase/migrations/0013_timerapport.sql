-- Hvem som telles med i oversikten over kundetimer og interntid (snekkere og allround, ikke butikk/kjøkken/leder).
alter table public.ansatte add column i_timerapport boolean not null default true;
update public.ansatte set i_timerapport = false where navn in ('Ståle Jonassen', 'Harald Otterlei', 'Karianne Seth');
