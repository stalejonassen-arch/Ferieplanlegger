-- Når varen sist ble tatt ut på prosjektet (nyeste ordrelinje i Visma), så listen kan vise det siste øverst.
alter table public.prosjekt_vare add column if not exists sist_dato date;
