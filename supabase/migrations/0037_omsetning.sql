-- Omsetning per måned fra Visma (hovedbok, kontoklasse 3), hentes av visma-sync. Bare leder ser tallene.
create table public.omsetning_mnd (
  bedrift_id smallint not null references public.bedrifter(id),
  aar        smallint not null,
  mnd        smallint not null check (mnd between 1 and 12),
  belop      numeric(14,0) not null default 0,
  oppdatert  timestamptz not null default now(),
  primary key (bedrift_id, aar, mnd)
);
alter table public.omsetning_mnd enable row level security;
create policy omsetning_les on public.omsetning_mnd for select to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.omsetning_mnd from anon;
grant select on public.omsetning_mnd to authenticated;

-- Omsetningsmål for året (kr), satt av leder
alter table public.bedrifter add column if not exists maal_omsetning_aar numeric(14,0);
create or replace function public.sett_omsetningsmaal(belop numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre målet.' using errcode = 'P0001'; end if;
  if belop is not null and (belop <= 0 or belop > 10000000000) then raise exception 'Målet må være et positivt beløp.' using errcode = 'P0001'; end if;
  update public.bedrifter set maal_omsetning_aar = belop where id = public.min_bedrift();
end $$;
revoke all on function public.sett_omsetningsmaal(numeric) from public, anon;
grant execute on function public.sett_omsetningsmaal(numeric) to authenticated;
