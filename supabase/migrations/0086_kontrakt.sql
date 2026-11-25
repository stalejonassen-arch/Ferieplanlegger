-- ByggLogg Kontrakt, pilot: kontrakt per prosjekt (NS 8405–8407 og NS 8415–8417), kontraktsfrister,
-- NS-saker (hendelser som kan gi krav) og varsler inn og ut. Tillegg og timer kan knyttes til en sak,
-- så endringsregisteret og regningsarbeidet bygger på det som allerede føres.
-- Appen holder orden på frister og varsler. Den avgjør ingen juridiske spørsmål.

-- ---------------------------------------------------------------------------
-- Kontrakter
-- ---------------------------------------------------------------------------
create table public.kontrakter (
  id                    uuid primary key default gen_random_uuid(),
  bedrift_id            smallint not null default 1 references public.bedrifter(id),
  prosjekt_id           uuid not null unique references public.prosjekter(id) on delete cascade,
  standard              text not null check (standard in ('8405', '8406', '8407', '8415', '8416', '8417')),
  kontraktssum          numeric(14,2),
  dagmulkt_promille     numeric(5,2) check (dagmulkt_promille is null or dagmulkt_promille between 0 and 100),
  sluttfrist            date,
  overtakelse           date,
  sikkerhet             text not null default '',
  bh_navn               text not null default '',   -- byggherrens representant
  bh_epost              text not null default '',
  bh_telefon            text not null default '',
  epost_skriftlig       boolean not null default false,  -- er det avtalt at e-post gjelder som skriftlig?
  bh_skjema             boolean not null default false,  -- krever byggherren egne skjema for varsler?
  varsel_dager          smallint not null default 5 check (varsel_dager between 1 and 30), -- egen frist for «uten ugrunnet opphold»
  notat                 text not null default '',
  opprettet_av          uuid references public.ansatte(id) on delete set null,
  opprettet             timestamptz not null default now(),
  oppdatert             timestamptz not null default now()
);

create table public.kontrakt_frister (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  kontrakt_id  uuid not null references public.kontrakter(id) on delete cascade,
  type         text not null check (type in ('delfrist', 'sluttfrist', 'ettaarsbefaring', 'garanti', 'annet')),
  tittel       text not null check (length(trim(tittel)) > 0),
  dato         date not null,
  dagmulkt     boolean not null default false,
  ferdig       boolean not null default false
);
create index kontrakt_frister_kontrakt on public.kontrakt_frister (kontrakt_id);

-- ---------------------------------------------------------------------------
-- NS-saker: noe har skjedd som kan gi krav på tid eller penger
-- ---------------------------------------------------------------------------
create table public.ns_saker (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  kontrakt_id   uuid not null references public.kontrakter(id) on delete cascade,
  prosjekt_id   uuid not null references public.prosjekter(id) on delete cascade,
  nr            integer not null,
  type          text not null check (type in ('endring', 'irregulaer', 'medvirkning', 'forsering', 'plunder_heft', 'rigg_drift', 'indeks', 'mengde', 'annet')),
  tittel        text not null check (length(trim(tittel)) > 0),
  beskrivelse   text not null default '',
  oppdaget      timestamptz not null default now(),
  meldt_av      uuid references public.ansatte(id) on delete set null,
  ansvarlig_id  uuid references public.ansatte(id) on delete set null,
  avvik_id      uuid references public.avvik(id) on delete set null,
  dagbok_id     uuid references public.dagbok(id) on delete set null,
  status        text not null default 'ny' check (status in ('ny', 'varslet', 'krav', 'avklart', 'avvist', 'bestridt', 'lukket')),
  belop         numeric(14,2),
  dager         integer check (dager is null or dager >= 0),  -- krav om fristforlengelse
  opprettet     timestamptz not null default now(),
  unique (kontrakt_id, nr)
);
create index ns_saker_prosjekt on public.ns_saker (prosjekt_id);

-- ---------------------------------------------------------------------------
-- Varsler: det vi sender og det vi får
-- ---------------------------------------------------------------------------
create table public.ns_varsler (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  sak_id        uuid not null references public.ns_saker(id) on delete cascade,
  retning       text not null check (retning in ('ut', 'inn')),
  type          text not null check (type in ('varsel', 'krav', 'svar', 'innsigelse', 'forbehold')),
  tekst         text not null default '',
  sendt         timestamptz,            -- null = utkast
  sendt_til     text not null default '',
  lest          timestamptz,            -- lesekvittering fra byggherren (steg 2)
  token         uuid not null unique default gen_random_uuid(),  -- lenke til byggherren (steg 2)
  svar          text not null default '',
  svar_tid      timestamptz,
  opprettet_av  uuid references public.ansatte(id) on delete set null,
  opprettet     timestamptz not null default now()
);
create index ns_varsler_sak on public.ns_varsler (sak_id);

-- Tillegg og timer kan høre til en NS-sak
alter table public.tillegg add column if not exists sak_id uuid references public.ns_saker(id) on delete set null;
alter table public.timer   add column if not exists sak_id uuid references public.ns_saker(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Vakter: riktig bedrift, prosjekt og løpenummer settes av databasen
-- ---------------------------------------------------------------------------
create or replace function public.kontrakt_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := (select bedrift_id from public.prosjekter where id = new.prosjekt_id);
  if new.bedrift_id is distinct from public.min_bedrift() then raise exception 'Prosjektet finnes ikke.'; end if;
  if tg_op = 'INSERT' then new.opprettet_av := public.mitt_ansatt_id(); end if;
  new.oppdatert := now();
  return new;
end $$;
create trigger kontrakt_vakt before insert or update on public.kontrakter
  for each row execute function public.kontrakt_vakt();

create or replace function public.kontrakt_frist_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := (select bedrift_id from public.kontrakter where id = new.kontrakt_id);
  if new.bedrift_id is distinct from public.min_bedrift() then raise exception 'Kontrakten finnes ikke.'; end if;
  return new;
end $$;
create trigger kontrakt_frist_vakt before insert or update on public.kontrakt_frister
  for each row execute function public.kontrakt_frist_vakt();

create or replace function public.ns_sak_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  select bedrift_id, prosjekt_id into k from public.kontrakter where id = new.kontrakt_id;
  if k.bedrift_id is distinct from public.min_bedrift() then raise exception 'Kontrakten finnes ikke.'; end if;
  new.bedrift_id := k.bedrift_id;
  new.prosjekt_id := k.prosjekt_id;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.kontrakt_id::text));
    new.nr := coalesce((select max(nr) from public.ns_saker where kontrakt_id = new.kontrakt_id), 0) + 1;
    new.meldt_av := public.mitt_ansatt_id();
  else
    new.nr := old.nr; new.meldt_av := old.meldt_av; new.oppdaget := old.oppdaget;
  end if;
  return new;
end $$;
create trigger ns_sak_vakt before insert or update on public.ns_saker
  for each row execute function public.ns_sak_vakt();

create or replace function public.ns_varsel_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := (select bedrift_id from public.ns_saker where id = new.sak_id);
  if new.bedrift_id is distinct from public.min_bedrift() then raise exception 'Saken finnes ikke.'; end if;
  if tg_op = 'INSERT' then new.opprettet_av := public.mitt_ansatt_id();
  else
    new.token := old.token;
    -- Et sendt varsel kan ikke endres i ettertid (bevis). Bare kvittering og svar kan legges til.
    if old.sendt is not null and (new.tekst is distinct from old.tekst or new.sendt is distinct from old.sendt
       or new.type is distinct from old.type or new.retning is distinct from old.retning or new.sendt_til is distinct from old.sendt_til) then
      raise exception 'Et sendt varsel kan ikke endres.';
    end if;
  end if;
  -- Status på saken følger varslene vi sender
  if new.retning = 'ut' and new.sendt is not null and (tg_op = 'INSERT' or old.sendt is null) then
    update public.ns_saker set status = case
      when new.type = 'krav' and status in ('ny', 'varslet') then 'krav'
      when new.type = 'varsel' and status = 'ny' then 'varslet'
      else status end
    where id = new.sak_id;
  end if;
  return new;
end $$;
create trigger ns_varsel_vakt before insert or update on public.ns_varsler
  for each row execute function public.ns_varsel_vakt();

-- ---------------------------------------------------------------------------
-- Tilgang: alle ansatte ser og kan melde saker; leder og prosjektledere styrer kontrakt og varsler
-- ---------------------------------------------------------------------------
alter table public.kontrakter       enable row level security;
alter table public.kontrakt_frister enable row level security;
alter table public.ns_saker         enable row level security;
alter table public.ns_varsler       enable row level security;

create policy kontrakter_les on public.kontrakter for select to authenticated using (bedrift_id = public.min_bedrift());
create policy kontrakter_ny on public.kontrakter for insert to authenticated with check (public.er_planlegger());
create policy kontrakter_endre on public.kontrakter for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger()) with check (bedrift_id = public.min_bedrift());
create policy kontrakter_slett on public.kontrakter for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());

create policy kontrakt_frister_les on public.kontrakt_frister for select to authenticated using (bedrift_id = public.min_bedrift());
create policy kontrakt_frister_skriv on public.kontrakt_frister for all to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger()) with check (public.er_planlegger());

create policy ns_saker_les on public.ns_saker for select to authenticated using (bedrift_id = public.min_bedrift());
create policy ns_saker_ny on public.ns_saker for insert to authenticated with check (public.er_ansatt());
create policy ns_saker_endre on public.ns_saker for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or (meldt_av = public.mitt_ansatt_id() and status = 'ny')))
  with check (bedrift_id = public.min_bedrift());
create policy ns_saker_slett on public.ns_saker for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());

create policy ns_varsler_les on public.ns_varsler for select to authenticated using (bedrift_id = public.min_bedrift());
create policy ns_varsler_ny on public.ns_varsler for insert to authenticated with check (public.er_planlegger());
create policy ns_varsler_endre on public.ns_varsler for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger()) with check (bedrift_id = public.min_bedrift());
create policy ns_varsler_slett on public.ns_varsler for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger() and sendt is null);

revoke all on public.kontrakter, public.kontrakt_frister, public.ns_saker, public.ns_varsler from anon;
grant select, insert, update, delete on public.kontrakter, public.kontrakt_frister, public.ns_saker, public.ns_varsler to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kontrakter, public.kontrakt_frister, public.ns_saker, public.ns_varsler;
  end if;
end $$;
