-- Salg per avdeling fra Visma (f.eks. Kjøkken og Interiør): antall salg, omsetning, dekningsbidrag og DG.
-- Ordrene sorteres på avdelingen de er ført på i Business NXT (organisatorisk enhet 1 «Avdeling»).
-- visma-sync henter alle salgsordrer som er ført på en avdeling. Leder ser alle avdelinger, og den som
-- jobber i en avdeling i ByggLogg med samme navn (f.eks. «Kjøkken og Interiør» / «Kjøkken & Interiør»)
-- ser rapporten for sin avdeling.
create table if not exists public.visma_avdelinger (
  bedrift_id  smallint not null references public.bedrifter(id),
  nr          smallint not null,
  navn        text not null,
  primary key (bedrift_id, nr)
);

create table if not exists public.avdeling_salg (
  bedrift_id     smallint not null references public.bedrifter(id),
  visma_ordrenr  integer not null,
  avdeling_nr    smallint not null,
  ordredato      date,
  fakturadato    date,            -- null = ikke fakturert ennå
  kunde          text not null default '',
  selger_nr      integer,
  ordresum       numeric(14,2) not null default 0,   -- netto ordresum (for ordre som ikke er fakturert)
  omsetning      numeric(14,2) not null default 0,   -- fakturert beløp eks. mva
  db             numeric(14,2) not null default 0,   -- dekningsbidrag
  kostnad        numeric(14,2) not null default 0,   -- innkjøpskost på ordren (0 = mangler innkjøpspris)
  oppdatert      timestamptz not null default now(),
  primary key (bedrift_id, visma_ordrenr)
);
create index if not exists avdeling_salg_avd on public.avdeling_salg (bedrift_id, avdeling_nr, fakturadato);

/** Første ord i et avdelingsnavn, uten tegn: «Kjøkken & Interiør» → «kjøkken» */
create or replace function public.avdeling_nokkel(navn text) returns text
language sql immutable as $$
  select split_part(trim(regexp_replace(lower(coalesce(navn, '')), '[^[:alpha:] ]', ' ', 'g')), ' ', 1)
$$;

create or replace function public.kan_se_avdeling(b smallint, nr smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select b = public.min_bedrift() and (public.er_leder() or exists (
    select 1 from public.ansatte a
      join public.avdelinger g on g.id = a.avdeling_id
      join public.visma_avdelinger v on v.bedrift_id = b and v.nr = kan_se_avdeling.nr
     where a.id = public.mitt_ansatt_id()
       and public.avdeling_nokkel(g.navn) <> ''
       and public.avdeling_nokkel(g.navn) = public.avdeling_nokkel(v.navn)))
$$;
revoke all on function public.kan_se_avdeling(smallint, smallint) from public, anon;
grant execute on function public.kan_se_avdeling(smallint, smallint) to authenticated;

alter table public.visma_avdelinger enable row level security;
drop policy if exists visma_avdelinger_les on public.visma_avdelinger;
create policy visma_avdelinger_les on public.visma_avdelinger for select to authenticated
  using (public.kan_se_avdeling(bedrift_id, nr));
alter table public.avdeling_salg enable row level security;
drop policy if exists avdeling_salg_les on public.avdeling_salg;
create policy avdeling_salg_les on public.avdeling_salg for select to authenticated
  using (public.kan_se_avdeling(bedrift_id, avdeling_nr));
revoke all on public.visma_avdelinger, public.avdeling_salg from anon;
grant select on public.visma_avdelinger, public.avdeling_salg to authenticated;
