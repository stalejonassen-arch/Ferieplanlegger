-- Leder kan overstyre lønnsgrunnlaget for en dag (normaltid, overtid 50/100 % og lunsjtrekk), med begrunnelse.
-- Timeføringene står urørt; overstyringen gjelder bare det som går til lønn. Den ansatte ser sine egne overstyringer.
create table if not exists public.timer_overstyring (
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  dato        date not null,
  normal      numeric(5,2) check (normal is null or normal between 0 and 24),
  ot50        numeric(5,2) check (ot50 is null or ot50 between 0 and 24),
  ot100       numeric(5,2) check (ot100 is null or ot100 between 0 and 24),
  lunsjtrekk  numeric(4,2) check (lunsjtrekk is null or lunsjtrekk between 0 and 2),
  grunn       text not null check (length(grunn) between 1 and 300),
  endret_av   uuid references public.ansatte(id) on delete set null,
  endret      timestamptz not null default now(),
  primary key (ansatt_id, dato)
);

create or replace function public.timer_overstyring_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := public.min_bedrift();
  if not exists (select 1 from public.ansatte where id = new.ansatt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent ansatt.' using errcode = 'P0001';
  end if;
  new.endret_av := public.mitt_ansatt_id();
  new.endret := now();
  return new;
end $$;
drop trigger if exists timer_overstyring_vakt on public.timer_overstyring;
create trigger timer_overstyring_vakt before insert or update on public.timer_overstyring
  for each row execute function public.timer_overstyring_vakt();

alter table public.timer_overstyring enable row level security;
drop policy if exists timer_overstyring_les on public.timer_overstyring;
create policy timer_overstyring_les on public.timer_overstyring for select to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()));
drop policy if exists timer_overstyring_skriv on public.timer_overstyring;
create policy timer_overstyring_skriv on public.timer_overstyring for insert to authenticated with check (public.er_leder());
drop policy if exists timer_overstyring_endre on public.timer_overstyring;
create policy timer_overstyring_endre on public.timer_overstyring for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder()) with check (public.er_leder());
drop policy if exists timer_overstyring_slett on public.timer_overstyring;
create policy timer_overstyring_slett on public.timer_overstyring for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.timer_overstyring from anon;
grant select, insert, update, delete on public.timer_overstyring to authenticated;
