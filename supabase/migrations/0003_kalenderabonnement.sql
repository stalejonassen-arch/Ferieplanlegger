-- Kalenderabonnement: hver ansatt får en hemmelig lenke som mobilkalenderen henter ferien fra.
-- Lenkene ligger i egen tabell slik at ansatte ikke kan se hverandres lenker.

create table public.kalender_tokens (
  ansatt_id  uuid primary key references public.ansatte(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  opprettet  timestamptz not null default now()
);

alter table public.kalender_tokens enable row level security;
-- Ingen direkte tilgang fra appen; alt går via funksjonene under.
revoke all on public.kalender_tokens from anon, authenticated;

-- Henter (eller lager) min egen kalenderlenke
create or replace function public.min_kalender_token() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  t uuid;
begin
  if meg is null then raise exception 'Ikke registrert som ansatt.'; end if;
  select token into t from public.kalender_tokens where ansatt_id = meg;
  if t is null then
    insert into public.kalender_tokens (ansatt_id) values (meg) returning token into t;
  end if;
  return t;
end $$;

-- Lager ny lenke (den gamle slutter å virke)
create or replace function public.ny_kalender_token() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  t uuid;
begin
  if meg is null then raise exception 'Ikke registrert som ansatt.'; end if;
  insert into public.kalender_tokens (ansatt_id) values (meg)
    on conflict (ansatt_id) do update set token = gen_random_uuid(), opprettet = now()
    returning token into t;
  return t;
end $$;

revoke execute on function public.min_kalender_token(), public.ny_kalender_token() from anon, public;
grant execute on function public.min_kalender_token(), public.ny_kalender_token() to authenticated;
