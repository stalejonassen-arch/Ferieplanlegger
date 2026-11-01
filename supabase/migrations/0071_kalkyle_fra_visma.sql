-- Kalkulerte timer fra Visma: antall «Arbeid» på prosjektets ordrer, eller på tilbudene når det ikke er ordre ennå.
-- Settes av visma-sync. Brukes når det ikke er lagt inn kalkulerte timer i ByggLogg (estimert_timer går foran).
alter table public.prosjekter add column if not exists visma_kalkyle_timer numeric(8,2);
