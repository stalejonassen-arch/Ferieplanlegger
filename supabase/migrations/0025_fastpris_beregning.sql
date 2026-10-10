-- Fastpris: arbeidsdelen beregnes som det kunden er fakturert, minus kostprisen på materialene
-- som er satt opp på firmaets egne ordrer (N L med kundeprosjekt, for lagerstyringen). Delt på timeprisen gir det timer.
alter table public.prosjekt_ordre add column if not exists kunde_nr integer;
alter table public.bedrifter add column if not exists eget_kundenr integer;      -- firmaets eget kundenummer i Visma
alter table public.bedrifter add column if not exists timepris numeric(10,2);    -- null = snittprisen på Arbeid i året

update public.bedrifter b set eget_kundenr = (select k.visma_nr from public.kunder k where k.bedrift_id = b.id and k.navn ilike 'N L Austnes%' order by k.visma_nr limit 1)
where b.eget_kundenr is null;
