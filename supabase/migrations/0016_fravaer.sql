-- Sykefravær: egenmelding, sykmelding og sykt barn. Bare den ansatte selv og leder ser registreringene.
-- Ingen diagnose eller årsak lagres – bare type, periode og ev. sykmeldingsgrad.

alter table public.bedrifter add column egenmelding_maks_dager smallint not null default 3;   -- per gang (folketrygdloven § 8-24)
alter table public.bedrifter add column egenmelding_maks_ganger smallint not null default 4;  -- per 12 måneder

create table public.fravaer (
  id             uuid primary key default gen_random_uuid(),
  bedrift_id     smallint not null default 1 references public.bedrifter(id),
  ansatt_id      uuid not null references public.ansatte(id) on delete cascade,
  type           text not null check (type in ('egenmelding', 'sykmelding', 'sykt_barn')),
  fra            date not null,
  til            date not null,
  grad           smallint not null default 100 check (grad between 1 and 100),  -- gradert sykmelding
  merknad        text not null default '',
  registrert_av  uuid references public.ansatte(id) on delete set null,
  opprettet      timestamptz not null default now(),
  check (til >= fra)
);
create index fravaer_ansatt on public.fravaer (ansatt_id, fra);

create or replace function public.fravaer_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare maks smallint;
begin
  if tg_op = 'INSERT' then
    new.registrert_av := public.mitt_ansatt_id();
  else
    new.registrert_av := old.registrert_av;
  end if;
  new.bedrift_id := (select bedrift_id from public.ansatte where id = new.ansatt_id);
  if not public.er_leder() then
    if new.ansatt_id <> public.mitt_ansatt_id() then
      raise exception 'Du kan bare registrere fravær for deg selv.' using errcode = 'P0001';
    end if;
    if new.type <> 'sykmelding' then new.grad := 100; end if;
    select egenmelding_maks_dager into maks from public.bedrifter where id = new.bedrift_id;
    if new.type = 'egenmelding' and (new.til - new.fra + 1) > maks then
      raise exception 'Egenmelding kan gjelde høyst % kalenderdager om gangen. Lengre fravær krever sykmelding fra lege.', maks using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from public.fravaer f where f.ansatt_id = new.ansatt_id and f.id <> new.id and f.fra <= new.til and f.til >= new.fra) then
    raise exception 'Fraværet overlapper med en annen registrering.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger fravaer_vakt before insert or update on public.fravaer
  for each row execute function public.fravaer_vakt();

alter table public.fravaer enable row level security;
create policy fravaer_les on public.fravaer for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()));
create policy fravaer_ny on public.fravaer for insert to authenticated with check (public.er_ansatt());
-- Den ansatte kan rette eller slette egne registreringer de første 14 dagene, leder alltid
create policy fravaer_endre on public.fravaer for update to authenticated
  using ((ansatt_id = public.mitt_ansatt_id() and opprettet > now() - interval '14 days') or (public.er_leder() and bedrift_id = public.min_bedrift()))
  with check (public.er_ansatt());
create policy fravaer_slett on public.fravaer for delete to authenticated
  using ((ansatt_id = public.mitt_ansatt_id() and opprettet > now() - interval '14 days') or (public.er_leder() and bedrift_id = public.min_bedrift()));
revoke all on public.fravaer from anon;
grant select, insert, update, delete on public.fravaer to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.fravaer;
  end if;
end $$;
