-- Hvem som er selger og hvilken snekker som har prosjektet. Settes av leder i appen; Visma-synken rører dem ikke.
alter table public.prosjekter add column if not exists selger_id uuid references public.ansatte(id) on delete set null;
alter table public.prosjekter add column if not exists snekker_id uuid references public.ansatte(id) on delete set null;
