-- Kvalitet og HMS på byggeplassen, og bestilling av materiell fra byggeplassen til butikken.
--  * Sjekklister (egenkontroll): fylles ut punkt for punkt på telefonen, med kommentar og bilde, og signeres.
--    Signerte lister er låst (bare leder og prosjektleder kan åpne dem igjen) og følger sluttrapporten.
--  * SJA (sikker jobbanalyse): arbeid, farer og tiltak, verneutstyr og hvem som er med. Hver deltaker
--    kvitterer i appen. Endres innholdet, må alle kvittere på nytt.
--  * HMS-kort på hver ansatt (nummer og utløpsdato). Mannskapslisten lages av timene i appen.
--  * Bestillinger: snekkeren bestiller materiell til prosjektet; butikk/prosjektleder plukker, gjør klar og leverer.

-- ---------------------------------------------------------------------------
-- Sjekklister
-- ---------------------------------------------------------------------------
create table if not exists public.sjekklister (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  prosjekt_id   uuid not null references public.prosjekter(id) on delete cascade,
  navn          text not null check (length(trim(navn)) between 1 and 200),
  mal           text not null default '',
  punkter       jsonb not null default '[]'::jsonb check (jsonb_typeof(punkter) = 'array' and jsonb_array_length(punkter) <= 200),
  status        text not null default 'pagaar' check (status in ('pagaar', 'signert')),
  opprettet_av  uuid references public.ansatte(id) on delete set null,
  opprettet     timestamptz not null default now(),
  endret        timestamptz not null default now(),
  signert_av    uuid references public.ansatte(id) on delete set null,
  signert_tid   timestamptz
);
create index if not exists sjekklister_prosjekt on public.sjekklister (prosjekt_id, opprettet);

create or replace function public.sjekkliste_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare p jsonb;
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.opprettet_av := public.mitt_ansatt_id();
    new.opprettet := now();
    new.status := 'pagaar'; new.signert_av := null; new.signert_tid := null;
  else
    new.bedrift_id := old.bedrift_id; new.opprettet_av := old.opprettet_av; new.opprettet := old.opprettet;
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if old.status = 'signert' and not public.er_planlegger() then
      raise exception 'Sjekklisten er signert. Be leder eller prosjektleder åpne den igjen.' using errcode = 'P0001';
    end if;
    if new.status = 'signert' and old.status <> 'signert' then
      for p in select * from jsonb_array_elements(new.punkter) loop
        if coalesce(p ->> 'svar', '') not in ('ok', 'avvik', 'na') then
          raise exception 'Alle punktene må besvares før sjekklisten kan signeres.' using errcode = 'P0001';
        end if;
      end loop;
      new.signert_av := public.mitt_ansatt_id();
      new.signert_tid := now();
    elsif new.status = 'pagaar' then
      new.signert_av := null; new.signert_tid := null;
    else
      new.signert_av := old.signert_av; new.signert_tid := old.signert_tid;
    end if;
  end if;
  new.endret := now();
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists sjekkliste_vakt on public.sjekklister;
create trigger sjekkliste_vakt before insert or update on public.sjekklister
  for each row execute function public.sjekkliste_vakt();

alter table public.sjekklister enable row level security;
drop policy if exists sjekklister_les on public.sjekklister;
create policy sjekklister_les on public.sjekklister for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists sjekklister_ny on public.sjekklister;
create policy sjekklister_ny on public.sjekklister for insert to authenticated with check (public.er_ansatt());
drop policy if exists sjekklister_endre on public.sjekklister;
create policy sjekklister_endre on public.sjekklister for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists sjekklister_slett on public.sjekklister;
create policy sjekklister_slett on public.sjekklister for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or (opprettet_av = public.mitt_ansatt_id() and status = 'pagaar')));

-- Bilder kan høre til et punkt i en sjekkliste
alter table public.bilder add column if not exists sjekkliste_id uuid references public.sjekklister(id) on delete set null;
alter table public.bilder add column if not exists sjekkliste_punkt smallint;

-- ---------------------------------------------------------------------------
-- SJA
-- ---------------------------------------------------------------------------
create table if not exists public.sja (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  prosjekt_id   uuid not null references public.prosjekter(id) on delete cascade,
  dato          date not null default current_date,
  arbeid        text not null check (length(trim(arbeid)) between 1 and 500),
  risikoer      jsonb not null default '[]'::jsonb check (jsonb_typeof(risikoer) = 'array' and jsonb_array_length(risikoer) <= 50),
  verneutstyr   text not null default '' check (length(verneutstyr) <= 1000),
  deltakere     uuid[] not null default '{}',
  kvittert      jsonb not null default '{}'::jsonb,
  opprettet_av  uuid references public.ansatte(id) on delete set null,
  opprettet     timestamptz not null default now()
);
create index if not exists sja_prosjekt on public.sja (prosjekt_id, dato desc);

create or replace function public.sja_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.opprettet_av := public.mitt_ansatt_id();
    new.opprettet := now();
    new.kvittert := '{}'::jsonb;
  else
    new.bedrift_id := old.bedrift_id; new.opprettet_av := old.opprettet_av; new.opprettet := old.opprettet;
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if current_setting('bygglogg.kvitter', true) is distinct from '1' then
      if not (public.er_planlegger() or old.opprettet_av = public.mitt_ansatt_id()) then
        raise exception 'Bare den som laget SJA-en, leder og prosjektleder kan endre den.' using errcode = 'P0001';
      end if;
      -- Nytt innhold: alle må kvittere på nytt
      if (new.arbeid, new.risikoer, new.verneutstyr, new.dato) is distinct from (old.arbeid, old.risikoer, old.verneutstyr, old.dato) then
        new.kvittert := '{}'::jsonb;
      else
        new.kvittert := old.kvittert;
      end if;
    end if;
  end if;
  new.deltakere := coalesce((select array_agg(distinct a.id) from public.ansatte a
                             where a.id = any (new.deltakere) and a.bedrift_id = new.bedrift_id), '{}');
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists sja_vakt on public.sja;
create trigger sja_vakt before insert or update on public.sja
  for each row execute function public.sja_vakt();

-- Deltakeren bekrefter at hen har gått gjennom SJA-en
create or replace function public.kvitter_sja(sja_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare meg uuid := public.mitt_ansatt_id();
begin
  if not exists (select 1 from public.sja where id = sja_id and bedrift_id = public.min_bedrift() and meg = any (deltakere)) then
    raise exception 'Du står ikke som deltaker på denne SJA-en.' using errcode = 'P0001';
  end if;
  perform set_config('bygglogg.kvitter', '1', true);
  update public.sja set kvittert = kvittert || jsonb_build_object(meg::text, now()) where id = sja_id;
  perform set_config('bygglogg.kvitter', '0', true);
end $$;
revoke all on function public.kvitter_sja(uuid) from public, anon;
grant execute on function public.kvitter_sja(uuid) to authenticated;

alter table public.sja enable row level security;
drop policy if exists sja_les on public.sja;
create policy sja_les on public.sja for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists sja_ny on public.sja;
create policy sja_ny on public.sja for insert to authenticated with check (public.er_ansatt());
drop policy if exists sja_endre on public.sja;
create policy sja_endre on public.sja for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists sja_slett on public.sja;
create policy sja_slett on public.sja for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or opprettet_av = public.mitt_ansatt_id()));

-- ---------------------------------------------------------------------------
-- HMS-kort
-- ---------------------------------------------------------------------------
alter table public.ansatte add column if not exists hms_kort_nr text not null default '';
alter table public.ansatte add column if not exists hms_kort_gyldig date;

create or replace function public.lagre_mitt_hms_kort(nr text, gyldig date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(nr, ''))) > 40 then raise exception 'HMS-kortnummeret er for langt.' using errcode = 'P0001'; end if;
  update public.ansatte set hms_kort_nr = trim(coalesce(nr, '')), hms_kort_gyldig = gyldig where id = public.mitt_ansatt_id();
end $$;
revoke all on function public.lagre_mitt_hms_kort(text, date) from public, anon;
grant execute on function public.lagre_mitt_hms_kort(text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Bestillinger fra byggeplassen
-- ---------------------------------------------------------------------------
create table if not exists public.bestillinger (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  prosjekt_id   uuid not null references public.prosjekter(id) on delete cascade,
  bestilt_av    uuid references public.ansatte(id) on delete set null,
  onsket_dato   date,
  merknad       text not null default '' check (length(merknad) <= 2000),
  linjer        jsonb not null default '[]'::jsonb check (jsonb_typeof(linjer) = 'array' and jsonb_array_length(linjer) between 1 and 200),
  status        text not null default 'ny' check (status in ('ny', 'plukkes', 'klar', 'levert', 'avvist')),
  svar          text not null default '' check (length(svar) <= 1000),
  behandlet_av  uuid references public.ansatte(id) on delete set null,
  leveranse_id  uuid references public.leveranser(id) on delete set null,
  opprettet     timestamptz not null default now(),
  endret        timestamptz not null default now()
);
create index if not exists bestillinger_status on public.bestillinger (bedrift_id, status, opprettet);
create index if not exists bestillinger_prosjekt on public.bestillinger (prosjekt_id);

create or replace function public.bestilling_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.bestilt_av := public.mitt_ansatt_id();
    new.opprettet := now();
    new.status := 'ny'; new.svar := ''; new.behandlet_av := null; new.leveranse_id := null;
  else
    new.bedrift_id := old.bedrift_id; new.bestilt_av := old.bestilt_av; new.opprettet := old.opprettet;
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if public.er_planlegger() then
      if new.status is distinct from old.status then new.behandlet_av := public.mitt_ansatt_id(); else new.behandlet_av := old.behandlet_av; end if;
    else
      -- Den som bestilte kan rette bestillingen så lenge den ikke er tatt i mot
      if old.bestilt_av is distinct from public.mitt_ansatt_id() or old.status <> 'ny' then
        raise exception 'Bestillingen er tatt i mot av butikken og kan ikke endres. Send en ny bestilling eller ring.' using errcode = 'P0001';
      end if;
      new.status := old.status; new.svar := old.svar; new.behandlet_av := old.behandlet_av; new.leveranse_id := old.leveranse_id;
    end if;
  end if;
  new.endret := now();
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists bestilling_vakt on public.bestillinger;
create trigger bestilling_vakt before insert or update on public.bestillinger
  for each row execute function public.bestilling_vakt();

alter table public.bestillinger enable row level security;
drop policy if exists bestillinger_les on public.bestillinger;
create policy bestillinger_les on public.bestillinger for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists bestillinger_ny on public.bestillinger;
create policy bestillinger_ny on public.bestillinger for insert to authenticated with check (public.er_ansatt());
drop policy if exists bestillinger_endre on public.bestillinger;
create policy bestillinger_endre on public.bestillinger for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists bestillinger_slett on public.bestillinger;
create policy bestillinger_slett on public.bestillinger for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or (bestilt_av = public.mitt_ansatt_id() and status = 'ny')));

-- Push: ny bestilling til butikk/prosjektleder, og «klar» eller «levert» tilbake til den som bestilte
drop trigger if exists bestilling_push on public.bestillinger;
create trigger bestilling_push after insert or update of status on public.bestillinger
  for each row execute function public.push_varsel('bestilling');

revoke all on public.sjekklister, public.sja, public.bestillinger from anon;
grant select, insert, update, delete on public.sjekklister, public.sja, public.bestillinger to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sjekklister, public.sja, public.bestillinger;
  end if;
end $$;
