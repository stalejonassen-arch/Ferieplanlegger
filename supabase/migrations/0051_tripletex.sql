-- Kobling mot Tripletex for bedrifter som bruker Tripletex i stedet for Visma.
-- Kunder, prosjekter og ansatte hentes fra Tripletex. Godkjente timer sendes til Tripletex som timeføringer.
-- Edge-funksjonen tripletex-sync gjør jobben. Den trenger hemmeligheten TRIPLETEX_CONSUMER_TOKEN
-- (ByggLogg sin applikasjonsnøkkel) og eventuelt TRIPLETEX_URL (testmiljø: https://api-test.tripletex.tech/v2).
-- Hver bedrift legger inn sin egen ansattnøkkel fra Tripletex. Den lagres i en tabell som bare serveren kan lese.

-- ---------------------------------------------------------------------------
-- Status per bedrift (synlig for leder) og den hemmelige nøkkelen (bare serveren)
-- ---------------------------------------------------------------------------
alter table public.bedrifter
  add column if not exists tripletex_aktiv        boolean not null default false,
  add column if not exists tripletex_aktivitet_id bigint,
  add column if not exists tripletex_sist         timestamptz,
  add column if not exists tripletex_status       text not null default '',
  add column if not exists tripletex_send_timer   boolean not null default true;

create table if not exists public.tripletex_tilgang (
  bedrift_id    smallint primary key references public.bedrifter(id) on delete cascade,
  ansattnokkel  text not null check (length(trim(ansattnokkel)) >= 10),
  koblet        timestamptz not null default now(),
  koblet_av     uuid references public.ansatte(id) on delete set null
);
alter table public.tripletex_tilgang enable row level security;
revoke all on public.tripletex_tilgang from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tripletex-ID på kunder, prosjekter og ansatte
-- ---------------------------------------------------------------------------
alter table public.kunder     add column if not exists tripletex_id bigint;
alter table public.prosjekter add column if not exists tripletex_id bigint;
alter table public.prosjekter add column if not exists tripletex_nr text not null default '';
alter table public.ansatte    add column if not exists tripletex_id bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kunder_bedrift_tripletex') then
    alter table public.kunder add constraint kunder_bedrift_tripletex unique (bedrift_id, tripletex_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prosjekter_bedrift_tripletex') then
    alter table public.prosjekter add constraint prosjekter_bedrift_tripletex unique (bedrift_id, tripletex_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Timer som er sendt til Tripletex (én rad per ansatt, prosjekt og dag)
-- ---------------------------------------------------------------------------
create table if not exists public.tripletex_timer (
  ansatt_id     uuid not null references public.ansatte(id) on delete cascade,
  prosjekt_id   uuid not null references public.prosjekter(id) on delete cascade,
  dato          date not null,
  bedrift_id    smallint not null references public.bedrifter(id) on delete cascade,
  tripletex_id  bigint not null,
  timer         numeric(6,2) not null,
  sendt         timestamptz not null default now(),
  primary key (ansatt_id, prosjekt_id, dato)
);
alter table public.tripletex_timer enable row level security;
revoke all on public.tripletex_timer from anon;
grant select on public.tripletex_timer to authenticated;
drop policy if exists tripletex_timer_les on public.tripletex_timer;
create policy tripletex_timer_les on public.tripletex_timer for select to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()));

create table if not exists public.tripletex_logg (
  id          bigserial primary key,
  bedrift_id  smallint not null references public.bedrifter(id) on delete cascade,
  tid         timestamptz not null default now(),
  ok          boolean not null,
  melding     text not null default ''
);
create index if not exists tripletex_logg_bedrift on public.tripletex_logg (bedrift_id, id desc);
alter table public.tripletex_logg enable row level security;
revoke all on public.tripletex_logg from anon;
grant select on public.tripletex_logg to authenticated;
drop policy if exists tripletex_logg_les on public.tripletex_logg;
create policy tripletex_logg_les on public.tripletex_logg for select to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift());

-- ---------------------------------------------------------------------------
-- Leder kobler til og fra (nøkkelen kan legges inn, men aldri leses tilbake)
-- ---------------------------------------------------------------------------
create or replace function public.koble_tripletex(nokkel text) returns void
language plpgsql security definer set search_path = public as $$
declare b smallint := public.min_bedrift();
begin
  if not public.er_leder() then raise exception 'Bare leder kan koble til Tripletex.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(nokkel, ''))) < 10 then raise exception 'Lim inn hele ansattnøkkelen fra Tripletex.' using errcode = 'P0001'; end if;
  insert into public.tripletex_tilgang (bedrift_id, ansattnokkel, koblet, koblet_av)
  values (b, trim(nokkel), now(), public.mitt_ansatt_id())
  on conflict (bedrift_id) do update set ansattnokkel = excluded.ansattnokkel, koblet = now(), koblet_av = excluded.koblet_av;
  update public.bedrifter set tripletex_aktiv = true, tripletex_status = 'Koblet til. Første henting starter om litt.' where id = b;
end $$;
revoke all on function public.koble_tripletex(text) from public, anon;
grant execute on function public.koble_tripletex(text) to authenticated;

create or replace function public.koble_fra_tripletex() returns void
language plpgsql security definer set search_path = public as $$
declare b smallint := public.min_bedrift();
begin
  if not public.er_leder() then raise exception 'Bare leder kan koble fra Tripletex.' using errcode = 'P0001'; end if;
  delete from public.tripletex_tilgang where bedrift_id = b;
  update public.bedrifter set tripletex_aktiv = false, tripletex_status = 'Koblet fra.' where id = b;
end $$;
revoke all on function public.koble_fra_tripletex() from public, anon;
grant execute on function public.koble_fra_tripletex() to authenticated;

create or replace function public.tripletex_innstillinger(send_timer boolean, aktivitet_id bigint default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre Tripletex-oppsettet.' using errcode = 'P0001'; end if;
  update public.bedrifter set tripletex_send_timer = coalesce(send_timer, tripletex_send_timer), tripletex_aktivitet_id = aktivitet_id
  where id = public.min_bedrift();
end $$;
revoke all on function public.tripletex_innstillinger(boolean, bigint) from public, anon;
grant execute on function public.tripletex_innstillinger(boolean, bigint) to authenticated;

-- Status for lederen: koblet til, sist hentet, siste melding (aldri nøkkelen)
create or replace function public.tripletex_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.er_leder() then null else (
    select jsonb_build_object(
      'aktiv', b.tripletex_aktiv, 'sist', b.tripletex_sist, 'status', b.tripletex_status,
      'send_timer', b.tripletex_send_timer, 'aktivitet_id', b.tripletex_aktivitet_id,
      'har_nokkel', exists (select 1 from public.tripletex_tilgang t where t.bedrift_id = b.id),
      'sendt_timer', (select count(*) from public.tripletex_timer x where x.bedrift_id = b.id))
    from public.bedrifter b where b.id = public.min_bedrift()) end
$$;
revoke all on function public.tripletex_status() from public, anon;
grant execute on function public.tripletex_status() to authenticated;

-- Prosjekter og kunder fra Tripletex skal bare endres av synken (adresse og kontakt kan fortsatt rettes i appen)
create or replace function public.tripletex_lest() returns trigger
language plpgsql as $$
begin
  if current_user <> 'service_role' and old.tripletex_id is not null then
    new.tripletex_id := old.tripletex_id;
    if tg_table_name = 'prosjekter' then new.tripletex_nr := old.tripletex_nr; end if;
  end if;
  return new;
end $$;
drop trigger if exists prosjekter_tripletex_lest on public.prosjekter;
create trigger prosjekter_tripletex_lest before update on public.prosjekter for each row execute function public.tripletex_lest();
drop trigger if exists kunder_tripletex_lest on public.kunder;
create trigger kunder_tripletex_lest before update on public.kunder for each row execute function public.tripletex_lest();

-- ---------------------------------------------------------------------------
-- Henting hvert kvarter, kl. 06–22 norsk tid. Adressen til funksjonen settes per Supabase-prosjekt:
--   alter database postgres set bygglogg.functions_url = 'https://<prosjekt>.supabase.co/functions/v1';
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('tripletex-sync', '*/15 4-20 * * *', $c$
      select net.http_post(
        url := current_setting('bygglogg.functions_url') || '/tripletex-sync',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 120000)
      where coalesce(current_setting('bygglogg.functions_url', true), '') <> ''
        and exists (select 1 from public.tripletex_tilgang)
    $c$);
  end if;
end $$;
