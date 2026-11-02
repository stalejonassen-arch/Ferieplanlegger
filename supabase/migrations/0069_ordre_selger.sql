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

-- Oktober 2026: ordrer uten selger. 9734 (Oslo Bygg og Eiendom) er Ståle (2), resten Harald (3).
insert into public.ordre_selger (bedrift_id, visma_ordrenr, selger_nr)
select 1, o, case when o = 9734 then 2 else 3 end
  from unnest(array[8930, 9317, 2517, 8959, 9526, 9711, 9707, 9675, 9734, 9379, 9409, 9702, 9396, 9757, 9714, 9839, 9715, 9420, 9378]) o
 where exists (select 1 from public.bedrifter where id = 1)
on conflict (bedrift_id, visma_ordrenr) do update set selger_nr = excluded.selger_nr;
