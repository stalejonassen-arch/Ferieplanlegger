-- Varer lagt inn for hånd på et prosjekt (f.eks. til FDV/Boligmappa når materialet ikke ligger på en Visma-ordre).
-- Visma-synken lar disse stå.
alter table public.prosjekt_vare add column if not exists manuell boolean not null default false;
