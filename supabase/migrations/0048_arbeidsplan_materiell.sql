-- Arbeidsplan og materialliste per prosjekt.
--  * Oppgaver: leder deler prosjektet opp i arbeid (f.eks. «Riving», «Membran og flis») med fra–til-dato
--    og hvem som skal gjøre det. De ansatte ser planen og kan markere sin egen oppgave som påbegynt eller ferdig.
--  * Leveranser: materiell delt opp i leveranser i den rekkefølgen det skal komme (f.eks. «1. Bjelkelag»,
--    «2. Kledning og vinduer»), med dato og status (planlagt, bestilt, levert).
--  * Materialer: linjene i materiallisten, koblet til en leveranse. Ansatte kan hake av det som er kommet.

--  * Prosjektleder (f.eks. butikk/prosjektleder): ansatt som får lov til å planlegge, dele ut arbeid og
--    styre materiallisten, uten å være leder (ser ikke lønn og oppsett).

alter table public.ansatte add column if not exists prosjektleder boolean not null default false;

create or replace function public.er_planlegger() returns boolean
language sql stable security definer set search_path = public as $$
  select public.er_leder() or exists (
    select 1 from public.ansatte
    where aktiv and prosjektleder and epost is not null
      and lower(epost) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;
revoke execute on function public.er_planlegger() from anon, public;
grant execute on function public.er_planlegger() to authenticated;

-- ---------------------------------------------------------------------------
-- Oppgaver
-- ---------------------------------------------------------------------------
create table if not exists public.oppgaver (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  prosjekt_id   uuid not null references public.prosjekter(id) on delete cascade,
  tittel        text not null check (length(trim(tittel)) between 1 and 200),
  beskrivelse   text not null default '' check (length(beskrivelse) <= 4000),
  fra           date not null,
  til           date not null,
  ansatte       uuid[] not null default '{}',
  rekkefolge    integer not null default 0,
  status        text not null default 'planlagt' check (status in ('planlagt', 'pagaar', 'ferdig')),
  opprettet_av  uuid references public.ansatte(id) on delete set null,
  opprettet     timestamptz not null default now(),
  ferdig_tid    timestamptz,
  check (til >= fra)
);
create index if not exists oppgaver_prosjekt on public.oppgaver (prosjekt_id, rekkefolge);
create index if not exists oppgaver_periode on public.oppgaver (bedrift_id, fra, til);
create index if not exists oppgaver_ansatte on public.oppgaver using gin (ansatte);

create or replace function public.oppgave_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.er_planlegger() then raise exception 'Bare leder og prosjektleder kan legge inn arbeid i planen.' using errcode = 'P0001'; end if;
    new.bedrift_id := public.min_bedrift();
    new.opprettet_av := public.mitt_ansatt_id();
    new.opprettet := now();
  else
    new.bedrift_id := old.bedrift_id; new.opprettet_av := old.opprettet_av; new.opprettet := old.opprettet;
    -- Prosjektet byttes bare når to prosjekter slås sammen
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if not public.er_planlegger() then
      -- Den som har fått oppgaven kan bare endre status
      if not (public.mitt_ansatt_id() = any (old.ansatte)) then
        raise exception 'Du kan bare endre dine egne oppgaver.' using errcode = 'P0001';
      end if;
      new.tittel := old.tittel; new.beskrivelse := old.beskrivelse; new.fra := old.fra; new.til := old.til;
      new.ansatte := old.ansatte; new.rekkefolge := old.rekkefolge;
    end if;
  end if;
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  -- Bare ansatte i samme bedrift, uten dubletter
  new.ansatte := coalesce((select array_agg(distinct a.id) from public.ansatte a
                           where a.id = any (new.ansatte) and a.bedrift_id = new.bedrift_id), '{}');
  if new.status = 'ferdig' and (tg_op = 'INSERT' or old.status <> 'ferdig') then new.ferdig_tid := now();
  elsif new.status <> 'ferdig' then new.ferdig_tid := null;
  end if;
  return new;
end $$;
drop trigger if exists oppgave_vakt on public.oppgaver;
create trigger oppgave_vakt before insert or update on public.oppgaver
  for each row execute function public.oppgave_vakt();

alter table public.oppgaver enable row level security;
drop policy if exists oppgaver_les on public.oppgaver;
create policy oppgaver_les on public.oppgaver for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists oppgaver_ny on public.oppgaver;
create policy oppgaver_ny on public.oppgaver for insert to authenticated with check (public.er_planlegger());
drop policy if exists oppgaver_endre on public.oppgaver;
create policy oppgaver_endre on public.oppgaver for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or public.mitt_ansatt_id() = any (ansatte)))
  with check (bedrift_id = public.min_bedrift());
drop policy if exists oppgaver_slett on public.oppgaver;
create policy oppgaver_slett on public.oppgaver for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger());

-- ---------------------------------------------------------------------------
-- Leveranser og materialliste
-- ---------------------------------------------------------------------------
create table if not exists public.leveranser (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid not null references public.prosjekter(id) on delete cascade,
  navn         text not null check (length(trim(navn)) between 1 and 200),
  rekkefolge   integer not null default 0,
  dato         date,
  status       text not null default 'planlagt' check (status in ('planlagt', 'bestilt', 'levert')),
  leverandor   text not null default '',
  notat        text not null default '' check (length(notat) <= 2000),
  opprettet    timestamptz not null default now()
);
create index if not exists leveranser_prosjekt on public.leveranser (prosjekt_id, rekkefolge);

create table if not exists public.materialer (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid not null references public.prosjekter(id) on delete cascade,
  leveranse_id uuid references public.leveranser(id) on delete set null,
  rekkefolge   integer not null default 0,
  varenr       text not null default '',
  nobb_nr      text not null default '',
  beskrivelse  text not null check (length(trim(beskrivelse)) between 1 and 300),
  antall       numeric(12,3) not null default 0 check (antall >= 0),
  enhet        text not null default '',
  notat        text not null default '' check (length(notat) <= 1000),
  levert       boolean not null default false,
  opprettet    timestamptz not null default now()
);
create index if not exists materialer_prosjekt on public.materialer (prosjekt_id, leveranse_id, rekkefolge);

-- Leder og prosjektleder lager og endrer alt. Ansatte kan bare melde at noe er kommet (levert).
create or replace function public.leveranse_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.er_planlegger() then raise exception 'Bare leder og prosjektleder kan lage leveranser.' using errcode = 'P0001'; end if;
    new.bedrift_id := public.min_bedrift();
    new.opprettet := now();
  else
    new.bedrift_id := old.bedrift_id; new.opprettet := old.opprettet;
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if not public.er_planlegger() then
      new.navn := old.navn; new.rekkefolge := old.rekkefolge; new.dato := old.dato;
      new.leverandor := old.leverandor; new.notat := old.notat;
      if new.status <> 'levert' then new.status := old.status; end if;
    end if;
  end if;
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists leveranse_vakt on public.leveranser;
create trigger leveranse_vakt before insert or update on public.leveranser
  for each row execute function public.leveranse_vakt();

create or replace function public.materiale_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.er_planlegger() then raise exception 'Bare leder og prosjektleder kan endre materiallisten.' using errcode = 'P0001'; end if;
    new.bedrift_id := public.min_bedrift();
    new.opprettet := now();
  else
    new.bedrift_id := old.bedrift_id; new.opprettet := old.opprettet;
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if not public.er_planlegger() then
      new.leveranse_id := old.leveranse_id; new.rekkefolge := old.rekkefolge; new.varenr := old.varenr;
      new.nobb_nr := old.nobb_nr; new.beskrivelse := old.beskrivelse; new.antall := old.antall;
      new.enhet := old.enhet; new.notat := old.notat;
    end if;
  end if;
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  if new.leveranse_id is not null and current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' and not exists (
    select 1 from public.leveranser where id = new.leveranse_id and prosjekt_id = new.prosjekt_id) then
    raise exception 'Leveransen hører til et annet prosjekt.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists materiale_vakt on public.materialer;
create trigger materiale_vakt before insert or update on public.materialer
  for each row execute function public.materiale_vakt();

alter table public.leveranser enable row level security;
alter table public.materialer enable row level security;
drop policy if exists leveranser_les on public.leveranser;
create policy leveranser_les on public.leveranser for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists leveranser_ny on public.leveranser;
create policy leveranser_ny on public.leveranser for insert to authenticated with check (public.er_planlegger());
drop policy if exists leveranser_endre on public.leveranser;
create policy leveranser_endre on public.leveranser for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists leveranser_slett on public.leveranser;
create policy leveranser_slett on public.leveranser for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger());

drop policy if exists materialer_les on public.materialer;
create policy materialer_les on public.materialer for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists materialer_ny on public.materialer;
create policy materialer_ny on public.materialer for insert to authenticated with check (public.er_planlegger());
drop policy if exists materialer_endre on public.materialer;
create policy materialer_endre on public.materialer for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists materialer_slett on public.materialer;
create policy materialer_slett on public.materialer for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger());

revoke all on public.oppgaver, public.leveranser, public.materialer from anon;
grant select, insert, update, delete on public.oppgaver, public.leveranser, public.materialer to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.oppgaver, public.leveranser, public.materialer;
  end if;
end $$;
