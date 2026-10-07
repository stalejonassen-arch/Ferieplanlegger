-- Ferieplanlegger – database for N L Austnes AS
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.
--
-- Innlogging skjer med e-postlenke. En innlogget bruker får bare tilgang hvis
-- e-postadressen finnes i tabellen «ansatte». Leder styrer alt oppsett.

-- ---------------------------------------------------------------------------
-- Tabeller
-- ---------------------------------------------------------------------------

create table public.avdelinger (
  id          bigint generated always as identity primary key,
  navn        text not null unique,
  maks_borte  smallint not null default 1 check (maks_borte between 0 and 50),
  rekkefolge  smallint not null default 0
);

create table public.ansatte (
  id           uuid primary key default gen_random_uuid(),
  navn         text not null check (length(trim(navn)) > 0),
  epost        text,
  avdeling_id  bigint not null references public.avdelinger(id) on delete restrict,
  rolle        text not null default 'ansatt' check (rolle in ('ansatt', 'leder')),
  dager        smallint not null default 25 check (dager in (25, 30)),  -- virkedager per år
  over60       boolean not null default false,                         -- + 6 virkedager
  aktiv        boolean not null default true,
  rekkefolge   smallint not null default 0,
  opprettet    timestamptz not null default now()
);
create unique index ansatte_epost_unik on public.ansatte (lower(epost)) where epost is not null;

-- Overført ferie fra året før (ferieloven § 7 nr. 3), per ansatt og år
create table public.ferieaar (
  ansatt_id  uuid not null references public.ansatte(id) on delete cascade,
  aar        smallint not null check (aar between 2000 and 2100),
  overfort   smallint not null default 0 check (overfort between 0 and 60),
  primary key (ansatt_id, aar)
);

create table public.soknader (
  id             uuid primary key default gen_random_uuid(),
  ansatt_id      uuid not null references public.ansatte(id) on delete cascade,
  fra            date not null,
  til            date not null,
  merknad        text not null default '',
  status         text not null default 'venter' check (status in ('venter', 'godkjent', 'avslatt')),
  kommentar      text not null default '',   -- leders kommentar
  behandlet_av   uuid references public.ansatte(id) on delete set null,
  behandlet_tid  timestamptz,
  opprettet      timestamptz not null default now(),
  check (til >= fra),
  check (extract(year from fra) = extract(year from til))
);
create index soknader_periode on public.soknader (fra, til);
create index soknader_ansatt on public.soknader (ansatt_id);

-- ---------------------------------------------------------------------------
-- Hjelpefunksjoner for tilgang (security definer så de kan lese ansatte
-- uten å gå i ring gjennom tilgangsreglene)
-- ---------------------------------------------------------------------------

create or replace function public.mitt_ansatt_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.ansatte
  where aktiv and epost is not null
    and lower(epost) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.er_ansatt() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mitt_ansatt_id() is not null
$$;

create or replace function public.er_leder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ansatte
    where aktiv and rolle = 'leder' and epost is not null
      and lower(epost) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

-- ---------------------------------------------------------------------------
-- Regler som databasen håndhever uansett hva appen sender
-- ---------------------------------------------------------------------------

create or replace function public.soknad_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then
    -- Ansatte kan bare sende og endre egne søknader som venter
    if tg_op = 'UPDATE' then
      new.kommentar := old.kommentar;
    else
      new.kommentar := '';
    end if;
    new.status := 'venter';
    new.behandlet_av := null;
    new.behandlet_tid := null;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'venter' then
      new.behandlet_av := null;
      new.behandlet_tid := null;
    else
      new.behandlet_av := public.mitt_ansatt_id();
      new.behandlet_tid := now();
    end if;
  end if;

  if new.status <> 'avslatt' and exists (
    select 1 from public.soknader s
    where s.ansatt_id = new.ansatt_id
      and s.id <> new.id
      and s.status <> 'avslatt'
      and s.fra <= new.til and s.til >= new.fra
  ) then
    raise exception 'Perioden overlapper med en annen søknad for samme ansatt.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger soknad_vakt
  before insert or update on public.soknader
  for each row execute function public.soknad_vakt();

-- Det må alltid finnes minst én aktiv leder med e-post
create or replace function public.leder_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.ansatte
    where aktiv and rolle = 'leder' and epost is not null
  ) then
    raise exception 'Det må være minst én aktiv leder med e-post.'
      using errcode = 'P0001';
  end if;
  return null;
end $$;

create constraint trigger leder_vakt
  after update or delete on public.ansatte
  deferrable initially deferred
  for each row execute function public.leder_vakt();

-- ---------------------------------------------------------------------------
-- Tilgangsregler (Row Level Security)
-- ---------------------------------------------------------------------------

alter table public.avdelinger enable row level security;
alter table public.ansatte    enable row level security;
alter table public.ferieaar   enable row level security;
alter table public.soknader   enable row level security;

-- Avdelinger og ansatte: alle ansatte leser, bare leder endrer
create policy avdelinger_les   on public.avdelinger for select to authenticated using (public.er_ansatt());
create policy avdelinger_leder on public.avdelinger for all    to authenticated using (public.er_leder()) with check (public.er_leder());

create policy ansatte_les   on public.ansatte for select to authenticated using (public.er_ansatt());
create policy ansatte_leder on public.ansatte for all    to authenticated using (public.er_leder()) with check (public.er_leder());

-- Overført ferie: egen rad, eller leder ser alle
create policy ferieaar_les   on public.ferieaar for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or public.er_leder());
create policy ferieaar_leder on public.ferieaar for all to authenticated
  using (public.er_leder()) with check (public.er_leder());

-- Søknader: alle ansatte ser kalenderen; egne søknader kan sendes, endres og
-- trekkes mens de venter; leder kan alt
create policy soknader_les on public.soknader for select to authenticated
  using (public.er_ansatt());
create policy soknader_ny on public.soknader for insert to authenticated
  with check (public.er_leder() or ansatt_id = public.mitt_ansatt_id());
create policy soknader_endre on public.soknader for update to authenticated
  using (public.er_leder() or (ansatt_id = public.mitt_ansatt_id() and status = 'venter'))
  with check (public.er_leder() or ansatt_id = public.mitt_ansatt_id());
create policy soknader_slett on public.soknader for delete to authenticated
  using (public.er_leder() or (ansatt_id = public.mitt_ansatt_id() and status = 'venter'));

-- Ikke-innloggede får ingenting
revoke all on public.avdelinger, public.ansatte, public.ferieaar, public.soknader from anon;
grant select, insert, update, delete on public.avdelinger, public.ansatte, public.ferieaar, public.soknader to authenticated;
revoke execute on function public.mitt_ansatt_id(), public.er_ansatt(), public.er_leder() from anon, public;
grant execute on function public.mitt_ansatt_id(), public.er_ansatt(), public.er_leder() to authenticated;

-- Sanntid: kalenderen oppdateres når noen søker eller leder godkjenner
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.soknader, public.ansatte, public.ferieaar, public.avdelinger;
  end if;
end $$;
