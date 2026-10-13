-- Push-varsler på telefon/PC (Web Push), også når appen er lukket:
-- nye meldinger i chat, og nye prosjekter (til alle som har «varsel om nye prosjekter» på).
-- Databasen kaller edge-funksjonen «push» med { type, id }; funksjonen leser selv innholdet og sender.

-- Telefonene/nettleserne som har slått på varsler
create table public.push_abonnement (
  endpoint   text primary key,
  ansatt_id  uuid not null references public.ansatte(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  opprettet  timestamptz not null default now()
);
create index push_abonnement_ansatt on public.push_abonnement (ansatt_id);
alter table public.push_abonnement enable row level security;
revoke all on public.push_abonnement from anon, authenticated;

create or replace function public.lagre_push(endpoint text, p256dh text, auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_ansatt() then raise exception 'Du har ikke tilgang.' using errcode = 'P0001'; end if;
  if lagre_push.endpoint !~ '^https://' or length(lagre_push.endpoint) > 1000 then raise exception 'Ugyldig abonnement.' using errcode = 'P0001'; end if;
  insert into public.push_abonnement (endpoint, ansatt_id, p256dh, auth)
  values (lagre_push.endpoint, public.mitt_ansatt_id(), lagre_push.p256dh, lagre_push.auth)
  on conflict on constraint push_abonnement_pkey do update set ansatt_id = excluded.ansatt_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
create or replace function public.slett_push(endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_abonnement where endpoint = slett_push.endpoint and ansatt_id = public.mitt_ansatt_id();
$$;
revoke all on function public.lagre_push(text, text, text), public.slett_push(text) from public, anon;
grant execute on function public.lagre_push(text, text, text), public.slett_push(text) to authenticated;

-- Hvem som får varsel om nye prosjekter (Kjøkken og Interiør trenger det ikke)
alter table public.ansatte add column if not exists varsel_prosjekt boolean not null default true;
update public.ansatte set varsel_prosjekt = false where navn ilike 'Karianne%';

-- Hvert varsel sendes bare én gang
create table public.push_logg (
  type   text not null,
  id     uuid not null,
  sendt  timestamptz not null default now(),
  primary key (type, id)
);
alter table public.push_logg enable row level security;
revoke all on public.push_logg from anon, authenticated;

-- VAPID-nøklene (bare edge-funksjonen leser dem, med tjenestenøkkelen)
create table public.push_noekler (
  id         smallint primary key default 1 check (id = 1),
  offentlig  text not null,
  privat     text not null
);
alter table public.push_noekler enable row level security;
revoke all on public.push_noekler from anon, authenticated;

-- Utløser: kall edge-funksjonen (bare der pg_net finnes)
create or replace function public.push_varsel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/push',
      body := jsonb_build_object('type', tg_argv[0], 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;

create trigger melding_push after insert on public.meldinger
  for each row execute function public.push_varsel('melding');
create trigger prosjekt_push after insert on public.prosjekter
  for each row execute function public.push_varsel('prosjekt');
