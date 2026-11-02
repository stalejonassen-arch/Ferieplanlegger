-- Selger på ordrer som mangler selger i Visma. Fakturerte ordrer kan ikke endres i Visma,
-- så selgeren settes her i ByggLogg og brukes i salget per selger (visma-sync) når feltet er tomt i Visma.
create table if not exists public.ordre_selger (
  bedrift_id     smallint not null references public.bedrifter(id),
  visma_ordrenr  integer not null,
  selger_nr      integer not null,
  opprettet      timestamptz not null default now(),
  primary key (bedrift_id, visma_ordrenr)
);
alter table public.ordre_selger enable row level security;
drop policy if exists ordre_selger_les on public.ordre_selger;
create policy ordre_selger_les on public.ordre_selger for select to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger());
revoke all on public.ordre_selger from anon;
grant select on public.ordre_selger to authenticated;
