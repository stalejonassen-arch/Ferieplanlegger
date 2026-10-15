-- Lønnsgrunnlag rett til lønnssystemet.
-- Hver bedrift velger lønnssystem og hvilke lønnsarter timene skal føres på:
--   excel       – regneark som i dag
--   visma_lonn  – importfil for «Import variable lønnsdata» i Visma Lønn (Business NXT har ikke lønn selv)
--   tripletex   – lønnsarter sendes til timelisten i Tripletex (timesheet/salaryTypeSpecification),
--                 og hentes inn når lønnen kjøres i Tripletex
-- Lønnsartene er bedriftens egne nummer (for eksempel «1020» eller «2010»), lagret per type:
--   normal, ot50, ot100, km, reisetid (timer/km) og ferie, egenmelding, sykmelding, syktBarn (dager).

alter table public.bedrifter
  add column if not exists lonn_system text not null default 'excel',
  add column if not exists lonnsarter  jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bedrifter_lonn_system') then
    alter table public.bedrifter add constraint bedrifter_lonn_system check (lonn_system in ('excel', 'visma_lonn', 'tripletex'));
  end if;
end $$;

create or replace function public.lonn_oppsett() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.er_leder() then null else (
    select jsonb_build_object('system', b.lonn_system, 'arter', b.lonnsarter)
    from public.bedrifter b where b.id = public.min_bedrift()) end
$$;
revoke all on function public.lonn_oppsett() from public, anon;
grant execute on function public.lonn_oppsett() to authenticated;

create or replace function public.lagre_lonn_oppsett(system text, arter jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text; v jsonb;
  rent jsonb := '{}'::jsonb;
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre lønnsoppsettet.' using errcode = 'P0001'; end if;
  if system not in ('excel', 'visma_lonn', 'tripletex') then raise exception 'Ukjent lønnssystem.' using errcode = 'P0001'; end if;
  for k, v in select * from jsonb_each(coalesce(arter, '{}'::jsonb)) loop
    if k not in ('normal', 'ot50', 'ot100', 'km', 'reisetid', 'ferie', 'egenmelding', 'sykmelding', 'syktBarn') then continue; end if;
    if jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '' then continue; end if;
    if length(btrim(v #>> '{}')) > 20 then raise exception 'Lønnsartnummeret er for langt.' using errcode = 'P0001'; end if;
    rent := rent || jsonb_build_object(k, btrim(v #>> '{}'));
  end loop;
  update public.bedrifter set lonn_system = system, lonnsarter = rent where id = public.min_bedrift();
end $$;
revoke all on function public.lagre_lonn_oppsett(text, jsonb) from public, anon;
grant execute on function public.lagre_lonn_oppsett(text, jsonb) to authenticated;

-- Lønnslinjer som er sendt til Tripletex (én per ansatt, måned og lønnsart), så en ny sending
-- oppdaterer eller fjerner linjene i stedet for å legge dem inn to ganger.
create table if not exists public.tripletex_lonn (
  ansatt_id     uuid not null references public.ansatte(id) on delete cascade,
  mnd           text not null check (mnd ~ '^\d{4}-\d{2}$'),
  art           text not null,
  bedrift_id    smallint not null references public.bedrifter(id) on delete cascade,
  tripletex_id  bigint not null,
  antall        numeric(8,2) not null,
  sendt         timestamptz not null default now(),
  primary key (ansatt_id, mnd, art)
);
alter table public.tripletex_lonn enable row level security;
revoke all on public.tripletex_lonn from anon;
grant select on public.tripletex_lonn to authenticated;
drop policy if exists tripletex_lonn_les on public.tripletex_lonn;
create policy tripletex_lonn_les on public.tripletex_lonn for select to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift());
