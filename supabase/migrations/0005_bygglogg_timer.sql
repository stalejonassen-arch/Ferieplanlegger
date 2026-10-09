-- ByggLogg del 1: bedrift, kunder, prosjekter og timeføring.
-- Kunder og prosjekter hentes fra Visma Business NXT (funksjonen visma-sync),
-- men leder kan også legge dem inn for hånd.

-- ---------------------------------------------------------------------------
-- Bedrift (klargjort for flere bedrifter senere)
-- ---------------------------------------------------------------------------
create table public.bedrifter (
  id              smallint primary key,
  navn            text not null,
  orgnr           text,
  visma_kunde_nr  integer,   -- Visma-kundenummer
  visma_firma_nr  integer,   -- Visma.net-firma-ID (useCompany i Business NXT-API-et)
  opprettet       timestamptz not null default now()
);
insert into public.bedrifter (id, navn, orgnr, visma_kunde_nr, visma_firma_nr)
values (1, 'N L Austnes AS', '832507652', 1184937, 5415636);

alter table public.avdelinger add column bedrift_id smallint not null default 1 references public.bedrifter(id);
alter table public.ansatte    add column bedrift_id smallint not null default 1 references public.bedrifter(id);

-- Arbeidstid og lunsj per ansatt (brukes i lønnsgrunnlaget)
alter table public.ansatte add column normaltid_uke numeric(4,1) not null default 37.5 check (normaltid_uke between 0 and 60);
alter table public.ansatte add column lunsjtrekk boolean not null default false;
alter table public.ansatte add column lunsj_min smallint not null default 30 check (lunsj_min between 0 and 120);

create or replace function public.min_bedrift() returns smallint
language sql stable security definer set search_path = public as $$
  select bedrift_id from public.ansatte where id = public.mitt_ansatt_id()
$$;

-- ---------------------------------------------------------------------------
-- Kunder og prosjekter
-- ---------------------------------------------------------------------------
create table public.kunder (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  visma_nr    integer,
  navn        text not null check (length(trim(navn)) > 0),
  adresse     text not null default '',
  postnr      text not null default '',
  poststed    text not null default '',
  telefon     text not null default '',
  epost       text not null default '',
  aktiv       boolean not null default true,
  oppdatert   timestamptz not null default now(),
  unique (bedrift_id, visma_nr)
);

create table public.prosjekter (
  id              uuid primary key default gen_random_uuid(),
  bedrift_id      smallint not null default 1 references public.bedrifter(id),
  visma_nr        integer,
  navn            text not null check (length(trim(navn)) > 0),
  kunde_id        uuid references public.kunder(id) on delete set null,
  adresse         text not null default '',
  estimert_timer  numeric(8,2),
  start           date,
  slutt           date,
  aktiv           boolean not null default true,
  oppdatert       timestamptz not null default now(),
  unique (bedrift_id, visma_nr)
);
create index prosjekter_kunde on public.prosjekter (kunde_id);

-- ---------------------------------------------------------------------------
-- Timer
-- ---------------------------------------------------------------------------
create table public.timer (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  ansatt_id    uuid not null references public.ansatte(id) on delete cascade,
  prosjekt_id  uuid references public.prosjekter(id) on delete restrict,  -- null = internt arbeid
  dato         date not null,
  fra          time not null,
  til          time not null,
  lunsj_min    smallint not null default 0 check (lunsj_min between 0 and 120),
  -- arbeidstid i timer, uten lunsj
  timer        numeric(5,2) generated always as (round((extract(epoch from (til - fra)) / 3600.0 - lunsj_min / 60.0)::numeric, 2)) stored,
  lunsj_unntak boolean not null default false,  -- leder har godkjent dagen uten lunsjtrekk
  km           numeric(6,1) not null default 0 check (km >= 0),
  reisetid     numeric(4,2) not null default 0 check (reisetid >= 0 and reisetid <= 24),
  beskrivelse  text not null default '',
  status       text not null default 'levert' check (status in ('levert', 'godkjent')),
  godkjent_av  uuid references public.ansatte(id) on delete set null,
  godkjent_tid timestamptz,
  opprettet    timestamptz not null default now(),
  check (til > fra),
  check (extract(epoch from (til - fra)) / 60 > lunsj_min)
);
create index timer_ansatt_dato on public.timer (ansatt_id, dato);
create index timer_prosjekt on public.timer (prosjekt_id);

-- Ansatte kan ikke godkjenne egne timer, og godkjente timer er låst for dem
create or replace function public.timer_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := (select bedrift_id from public.ansatte where id = new.ansatt_id);
  if not public.er_leder() then
    if tg_op = 'UPDATE' and old.status = 'godkjent' then
      raise exception 'Timene er godkjent og kan bare endres av leder.' using errcode = 'P0001';
    end if;
    new.status := 'levert';
    new.lunsj_unntak := case when tg_op = 'UPDATE' then old.lunsj_unntak else false end;
  end if;
  if exists (
    select 1 from public.timer t
    where t.ansatt_id = new.ansatt_id and t.dato = new.dato and t.id <> new.id
      and t.fra < new.til and t.til > new.fra
  ) then
    raise exception 'Tiden overlapper med en annen registrering samme dag.' using errcode = 'P0001';
  end if;
  if new.status = 'godkjent' and (tg_op = 'INSERT' or old.status is distinct from 'godkjent') then
    new.godkjent_av := public.mitt_ansatt_id();
    new.godkjent_tid := now();
  elsif new.status <> 'godkjent' then
    new.godkjent_av := null;
    new.godkjent_tid := null;
  end if;
  return new;
end $$;
create trigger timer_vakt before insert or update on public.timer
  for each row execute function public.timer_vakt();

-- ---------------------------------------------------------------------------
-- Tilgang
-- ---------------------------------------------------------------------------
alter table public.bedrifter  enable row level security;
alter table public.kunder     enable row level security;
alter table public.prosjekter enable row level security;
alter table public.timer      enable row level security;

create policy bedrifter_les on public.bedrifter for select to authenticated using (id = public.min_bedrift());

create policy kunder_les   on public.kunder for select to authenticated using (bedrift_id = public.min_bedrift());
create policy kunder_leder on public.kunder for all to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift())
  with check (public.er_leder() and bedrift_id = public.min_bedrift());

create policy prosjekter_les   on public.prosjekter for select to authenticated using (bedrift_id = public.min_bedrift());
create policy prosjekter_leder on public.prosjekter for all to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift())
  with check (public.er_leder() and bedrift_id = public.min_bedrift());

-- Timer: egne timer, eller leder ser hele bedriften
create policy timer_les on public.timer for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()));
create policy timer_ny on public.timer for insert to authenticated
  with check (ansatt_id = public.mitt_ansatt_id()
    or (public.er_leder() and (select bedrift_id from public.ansatte where id = ansatt_id) = public.min_bedrift()));
create policy timer_endre on public.timer for update to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()))
  with check (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()));
create policy timer_slett on public.timer for delete to authenticated
  using ((ansatt_id = public.mitt_ansatt_id() and status = 'levert') or (public.er_leder() and bedrift_id = public.min_bedrift()));

revoke all on public.bedrifter, public.kunder, public.prosjekter, public.timer from anon;
grant select on public.bedrifter to authenticated;
grant select, insert, update, delete on public.kunder, public.prosjekter, public.timer to authenticated;
revoke execute on function public.min_bedrift() from anon, public;
grant execute on function public.min_bedrift() to authenticated;

-- Normaltid og lunsjtrekk for N L Austnes AS
update public.ansatte set normaltid_uke = 40
  where navn ilike any (array['Dawid%', 'Stanislaw%', 'Mieczyslaw%']);
update public.ansatte set lunsjtrekk = true
  where navn ilike any (array['Karianne%', 'Svein Erik%', 'Jim%', 'Stanislaw%', 'Mieczyslaw%', 'Dawid%']);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.timer, public.prosjekter, public.kunder;
  end if;
end $$;

-- Logg over henting fra Visma (leder kan se siste status)
create table public.visma_sync_logg (
  id     bigint generated always as identity primary key,
  tid    timestamptz not null default now(),
  ok     boolean not null,
  melding text not null default ''
);
alter table public.visma_sync_logg enable row level security;
create policy visma_sync_les on public.visma_sync_logg for select to authenticated using (public.er_leder());
revoke all on public.visma_sync_logg from anon;
grant select on public.visma_sync_logg to authenticated;
