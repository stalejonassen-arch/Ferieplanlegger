-- Reklamasjon: kunden melder feil eller mangel på en ferdig jobb.
-- Reklamasjonen registreres på originaljobben. Timene for å utbedre den føres på bedriftens faste
-- reklamasjonsprosjekt (internt prosjekt i Visma), merket med hvilken reklamasjon de gjelder, og er aldri fakturerbare.

alter table public.bedrifter
  add column if not exists reklamasjon_prosjekt_id uuid references public.prosjekter(id) on delete set null;

create table if not exists public.reklamasjoner (
  id               uuid primary key default gen_random_uuid(),
  bedrift_id       smallint not null default 1 references public.bedrifter(id),
  prosjekt_id      uuid not null references public.prosjekter(id) on delete cascade,  -- originaljobben
  meldt_av         uuid references public.ansatte(id) on delete set null,             -- hvem i firmaet som registrerte den
  meldt_dato       date not null default current_date,                                 -- når kunden meldte fra
  kontakt          text not null default '' check (length(kontakt) <= 300),            -- hvem som meldte, og hvordan
  tittel           text not null check (length(trim(tittel)) between 1 and 200),
  beskrivelse      text not null default '' check (length(beskrivelse) <= 5000),
  status           text not null default 'ny' check (status in ('ny', 'godkjent', 'avvist', 'utbedret')),
  vurdering        text not null default '' check (length(vurdering) <= 5000),         -- svar til kunden / begrunnelse
  ansvarlig_id     uuid references public.ansatte(id) on delete set null,
  frist            date,
  materiell_kost   numeric(12, 2) check (materiell_kost is null or materiell_kost >= 0),
  behandlet_av     uuid references public.ansatte(id) on delete set null,
  utbedret_av      uuid references public.ansatte(id) on delete set null,
  utbedret_tid     timestamptz,
  signert_navn     text not null default '' check (length(signert_navn) <= 200),
  signatur         text not null default '' check (length(signatur) <= 400000),
  signert_tid      timestamptz,
  opprettet        timestamptz not null default now(),
  endret           timestamptz not null default now()
);
create index if not exists reklamasjoner_prosjekt on public.reklamasjoner (prosjekt_id);
create index if not exists reklamasjoner_status on public.reklamasjoner (bedrift_id, status);

-- Alle ansatte kan registrere. Den som registrerte kan rette teksten mens den er ny.
-- Leder og prosjektleder vurderer (godkjent/avvist), gir ansvar og frist. Den ansvarlige kan melde den utbedret.
create or replace function public.reklamasjon_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  planlegger boolean := public.er_planlegger();
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.meldt_av := meg;
    if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
      raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
    end if;
    if not planlegger then
      new.status := 'ny'; new.vurdering := ''; new.ansvarlig_id := null; new.frist := null; new.materiell_kost := null;
    end if;
    new.signert_navn := ''; new.signatur := ''; new.signert_tid := null;
  else
    new.bedrift_id := old.bedrift_id;
    new.meldt_av := old.meldt_av;
    new.opprettet := old.opprettet;
    if new.prosjekt_id is distinct from old.prosjekt_id and current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' and not planlegger then
      new.prosjekt_id := old.prosjekt_id;
    end if;
    if not planlegger then
      if meg is not distinct from old.ansvarlig_id then
        -- Ansvarlig: kan melde utbedret og få kunden til å kvittere, men ikke endre vurderingen
        if new.status not in (old.status, 'utbedret') or old.status = 'avvist' then new.status := old.status; end if;
        new.vurdering := old.vurdering; new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist; new.materiell_kost := old.materiell_kost;
        new.tittel := old.tittel; new.beskrivelse := old.beskrivelse; new.kontakt := old.kontakt; new.meldt_dato := old.meldt_dato;
      elsif meg is not distinct from old.meldt_av and old.status = 'ny' then
        -- Den som registrerte: kan rette teksten mens den ikke er vurdert
        new.status := old.status; new.vurdering := old.vurdering; new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist;
        new.materiell_kost := old.materiell_kost; new.signert_navn := old.signert_navn; new.signatur := old.signatur;
      else
        raise exception 'Bare leder eller prosjektleder kan behandle reklamasjonen.' using errcode = 'P0001';
      end if;
    end if;
    if new.status is distinct from old.status and new.status in ('godkjent', 'avvist') then new.behandlet_av := meg; end if;
  end if;
  -- Utbedret: hvem og når
  if new.status = 'utbedret' and (tg_op = 'INSERT' or old.status <> 'utbedret') then
    new.utbedret_av := meg; new.utbedret_tid := now();
  elsif new.status <> 'utbedret' then
    new.utbedret_av := null; new.utbedret_tid := null;
  end if;
  -- Kundens kvittering kan bare gis når den er utbedret, og settes med tidspunkt
  if tg_op = 'UPDATE' then
    if new.signatur <> '' and new.signatur is distinct from old.signatur then
      if new.status <> 'utbedret' then raise exception 'Kunden kan kvittere når reklamasjonen er utbedret.' using errcode = 'P0001'; end if;
      if trim(new.signert_navn) = '' then raise exception 'Skriv kundens navn.' using errcode = 'P0001'; end if;
      new.signert_tid := now();
    elsif new.signatur = '' then
      new.signert_navn := ''; new.signert_tid := null;
    else
      new.signert_navn := old.signert_navn; new.signert_tid := old.signert_tid;
    end if;
  end if;
  new.endret := now();
  return new;
end $$;
drop trigger if exists reklamasjon_vakt on public.reklamasjoner;
create trigger reklamasjon_vakt before insert or update on public.reklamasjoner
  for each row execute function public.reklamasjon_vakt();

alter table public.reklamasjoner enable row level security;
drop policy if exists reklamasjoner_les on public.reklamasjoner;
create policy reklamasjoner_les on public.reklamasjoner for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists reklamasjoner_ny on public.reklamasjoner;
create policy reklamasjoner_ny on public.reklamasjoner for insert to authenticated with check (public.er_ansatt());
drop policy if exists reklamasjoner_endre on public.reklamasjoner;
create policy reklamasjoner_endre on public.reklamasjoner for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or meldt_av = public.mitt_ansatt_id() or ansvarlig_id = public.mitt_ansatt_id()))
  with check (bedrift_id = public.min_bedrift());
drop policy if exists reklamasjoner_slett on public.reklamasjoner;
create policy reklamasjoner_slett on public.reklamasjoner for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.reklamasjoner from anon;
grant select, insert, update, delete on public.reklamasjoner to authenticated;

-- Bilder av feilen og av utbedringen
alter table public.bilder add column if not exists reklamasjon_id uuid references public.reklamasjoner(id) on delete cascade;
create index if not exists bilder_reklamasjon on public.bilder (reklamasjon_id) where reklamasjon_id is not null;

-- Arbeid i planen som gjelder en reklamasjon
alter table public.oppgaver add column if not exists reklamasjon_id uuid references public.reklamasjoner(id) on delete set null;
create or replace function public.oppgave_reklamasjon() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reklamasjon_id is not null and not exists (
    select 1 from public.reklamasjoner r join public.prosjekter p on p.id = new.prosjekt_id
     where r.id = new.reklamasjon_id and r.bedrift_id = p.bedrift_id) then
    raise exception 'Fant ikke reklamasjonen.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists oppgave_reklamasjon on public.oppgaver;
create trigger oppgave_reklamasjon before insert or update of reklamasjon_id on public.oppgaver
  for each row execute function public.oppgave_reklamasjon();

-- ---------------------------------------------------------------------------
-- Timer på reklamasjon
-- ---------------------------------------------------------------------------
alter table public.timer add column if not exists reklamasjon_id uuid references public.reklamasjoner(id) on delete set null;
create index if not exists timer_reklamasjon on public.timer (reklamasjon_id) where reklamasjon_id is not null;
alter table public.stempling add column if not exists reklamasjon_id uuid references public.reklamasjoner(id) on delete set null;

create or replace function public.timer_reklamasjon() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rp uuid;
  b smallint := (select bedrift_id from public.ansatte where id = new.ansatt_id);
begin
  -- Innlogget med stempling: reklamasjonen følger med fra stemplingen
  if tg_op = 'INSERT' and new.reklamasjon_id is null and current_setting('bygglogg.stempel', true) = '1' then
    select s.reklamasjon_id into new.reklamasjon_id from public.stempling s
     where s.ansatt_id = new.ansatt_id and s.prosjekt_id is not distinct from new.prosjekt_id;
  end if;
  select reklamasjon_prosjekt_id into rp from public.bedrifter where id = b;
  if new.reklamasjon_id is not null then
    if not exists (select 1 from public.reklamasjoner where id = new.reklamasjon_id and bedrift_id = b) then
      raise exception 'Fant ikke reklamasjonen.' using errcode = 'P0001';
    end if;
    -- Timene føres på reklamasjonsprosjektet når det er valgt
    if rp is not null then new.prosjekt_id := rp; end if;
  end if;
  if new.reklamasjon_id is not null or (rp is not null and new.prosjekt_id = rp) then
    new.fakturerbar := false;
  end if;
  return new;
end $$;
drop trigger if exists timer_reklamasjon on public.timer;
create trigger timer_reklamasjon before insert or update on public.timer
  for each row execute function public.timer_reklamasjon();

/** Velg hvilken reklamasjon du jobber med mens du er logget inn (null = ingen) */
create or replace function public.stemple_reklamasjon(r uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if r is not null and not exists (select 1 from public.reklamasjoner where id = r and bedrift_id = public.min_bedrift()) then
    raise exception 'Fant ikke reklamasjonen.' using errcode = 'P0001';
  end if;
  update public.stempling set reklamasjon_id = r where ansatt_id = public.mitt_ansatt_id();
  if not found then raise exception 'Du er ikke logget inn.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.stemple_reklamasjon(uuid) from public, anon;
grant execute on function public.stemple_reklamasjon(uuid) to authenticated;

/** Leder velger bedriftens faste reklamasjonsprosjekt (null = ikke valgt) */
create or replace function public.lagre_reklamasjonsprosjekt(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan velge reklamasjonsprosjekt.' using errcode = 'P0001'; end if;
  if p is not null and not exists (select 1 from public.prosjekter where id = p and bedrift_id = public.min_bedrift()) then
    raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
  end if;
  update public.bedrifter set reklamasjon_prosjekt_id = p where id = public.min_bedrift();
  -- Timer som allerede står på prosjektet faktureres ikke
  if p is not null then
    update public.timer set fakturerbar = false where prosjekt_id = p and fakturerbar;
  end if;
end $$;
revoke all on function public.lagre_reklamasjonsprosjekt(uuid) from public, anon;
grant execute on function public.lagre_reklamasjonsprosjekt(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reklamasjoner') then
    alter publication supabase_realtime add table public.reklamasjoner;
  end if;
end $$;
