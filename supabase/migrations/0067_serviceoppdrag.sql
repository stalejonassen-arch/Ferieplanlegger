-- Serviceoppdrag: små betalte oppdrag hos en kunde som gjøres på en dag, maks to.
-- Hastegrad (haster / denne uken / når det passer), én ansvarlig snekker, timer og materiell føres på
-- oppdraget, kunden kan kvittere, og oppdraget går til «Klar til fakturering» når det er ferdig.
-- Timene føres på bedriftens faste serviceprosjekt i Visma (fakturerbare), merket med oppdraget.
-- Registreres av butikk/leder, snekkere, eller av kunden selv via et skjema på nettsiden.

alter table public.bedrifter
  add column if not exists service_prosjekt_id uuid references public.prosjekter(id) on delete set null,
  add column if not exists service_skjema_nokkel text not null default replace(gen_random_uuid()::text, '-', '');

create table if not exists public.serviceoppdrag (
  id              uuid primary key default gen_random_uuid(),
  bedrift_id      smallint not null default 1 references public.bedrifter(id),
  kunde_id        uuid references public.kunder(id) on delete set null,
  kunde_navn      text not null default '' check (length(kunde_navn) <= 200),   -- når kunden ikke finnes i Visma ennå
  telefon         text not null default '' check (length(telefon) <= 40),
  epost           text not null default '' check (length(epost) <= 200),
  adresse         text not null default '' check (length(adresse) <= 300),
  tittel          text not null check (length(trim(tittel)) between 1 and 200),
  beskrivelse     text not null default '' check (length(beskrivelse) <= 5000),
  prioritet       text not null default 'uke' check (prioritet in ('haster', 'uke', 'ledig')),
  status          text not null default 'ny' check (status in ('ny', 'planlagt', 'ferdig', 'fakturert', 'avvist')),
  ansvarlig_id    uuid references public.ansatte(id) on delete set null,
  dato            date,
  dager           smallint not null default 1 check (dager between 1 and 2),
  kilde           text not null default 'app' check (kilde in ('app', 'skjema')),
  registrert_av   uuid references public.ansatte(id) on delete set null,
  materiell       jsonb not null default '[]' check (jsonb_typeof(materiell) = 'array' and jsonb_array_length(materiell) <= 100),
  merknad         text not null default '' check (length(merknad) <= 2000),     -- intern (f.eks. svar ved avvisning)
  ferdig_av       uuid references public.ansatte(id) on delete set null,
  ferdig_tid      timestamptz,
  visma_ordrenr   text not null default '' check (length(visma_ordrenr) <= 40),
  fakturert_tid   timestamptz,
  signert_navn    text not null default '' check (length(signert_navn) <= 200),
  signatur        text not null default '' check (length(signatur) <= 400000),
  signert_tid     timestamptz,
  opprettet       timestamptz not null default now(),
  endret          timestamptz not null default now()
);
create index if not exists serviceoppdrag_status on public.serviceoppdrag (bedrift_id, status, dato);

create or replace function public.service_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  planlegger boolean := public.er_planlegger();
  skjema boolean := coalesce(current_setting('bygglogg.skjema', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if skjema then
      new.kilde := 'skjema'; new.registrert_av := null;
      new.status := 'ny'; new.ansvarlig_id := null; new.dato := null;
    else
      new.bedrift_id := public.min_bedrift();
      new.registrert_av := meg; new.kilde := 'app';
      if not planlegger then
        -- Snekkeren kan ta oppdraget selv, men ikke dele det ut til andre
        new.status := case when new.ansvarlig_id = meg and new.status = 'planlagt' then 'planlagt' else 'ny' end;
        if new.ansvarlig_id is distinct from meg then new.ansvarlig_id := null; end if;
      end if;
    end if;
    new.ferdig_av := null; new.ferdig_tid := null; new.visma_ordrenr := ''; new.fakturert_tid := null;
    new.signert_navn := ''; new.signatur := ''; new.signert_tid := null;
    if new.status in ('ferdig', 'fakturert') then new.status := 'ny'; end if;
  else
    new.bedrift_id := old.bedrift_id; new.registrert_av := old.registrert_av; new.kilde := old.kilde; new.opprettet := old.opprettet;
    if not planlegger then
      if meg is not distinct from old.ansvarlig_id and old.status in ('planlagt', 'ferdig') then
        -- Ansvarlig: kan melde ferdig, føre materiell og få kunden til å kvittere
        if not (new.status = old.status or (old.status = 'planlagt' and new.status = 'ferdig')) then new.status := old.status; end if;
        new.kunde_id := old.kunde_id; new.prioritet := old.prioritet; new.ansvarlig_id := old.ansvarlig_id;
        new.dato := old.dato; new.dager := old.dager; new.visma_ordrenr := old.visma_ordrenr; new.merknad := old.merknad;
        if old.status = 'ferdig' then new.materiell := old.materiell; end if;
      elsif meg is not distinct from old.registrert_av and old.status = 'ny' then
        new.status := old.status; new.ansvarlig_id := old.ansvarlig_id; new.dato := old.dato; new.visma_ordrenr := old.visma_ordrenr;
      elsif old.status = 'ny' and old.ansvarlig_id is null and new.ansvarlig_id = meg and new.status = 'planlagt' then
        -- Ledig oppdrag: snekkeren tar det selv
        new.tittel := old.tittel; new.beskrivelse := old.beskrivelse; new.kunde_id := old.kunde_id; new.prioritet := old.prioritet;
        new.visma_ordrenr := old.visma_ordrenr; new.materiell := old.materiell;
      else
        raise exception 'Bare leder, prosjektleder eller den ansvarlige kan endre serviceoppdraget.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  if new.kunde_id is not null and not exists (select 1 from public.kunder where id = new.kunde_id and bedrift_id = new.bedrift_id) then
    raise exception 'Fant ikke kunden.' using errcode = 'P0001';
  end if;
  if new.ansvarlig_id is not null and not exists (select 1 from public.ansatte where id = new.ansvarlig_id and bedrift_id = new.bedrift_id) then
    raise exception 'Fant ikke den ansatte.' using errcode = 'P0001';
  end if;
  if not skjema and new.kunde_id is null and trim(new.kunde_navn) = '' then
    raise exception 'Serviceoppdraget må være på en kunde.' using errcode = 'P0001';
  end if;
  if new.status in ('planlagt', 'ferdig', 'fakturert') then
    if new.ansvarlig_id is null then raise exception 'Velg hvem som skal gjøre oppdraget.' using errcode = 'P0001'; end if;
    if new.dato is null then raise exception 'Velg dato for oppdraget.' using errcode = 'P0001'; end if;
  end if;
  if new.status = 'fakturert' and new.kunde_id is null then
    raise exception 'Koble oppdraget til kunden i Visma før det merkes fakturert.' using errcode = 'P0001';
  end if;
  -- Ferdig og fakturert: hvem og når
  if new.status in ('ferdig', 'fakturert') and (tg_op = 'INSERT' or old.status not in ('ferdig', 'fakturert')) then
    new.ferdig_av := meg; new.ferdig_tid := now();
  elsif new.status not in ('ferdig', 'fakturert') then
    new.ferdig_av := null; new.ferdig_tid := null;
  end if;
  if new.status = 'fakturert' and (tg_op = 'INSERT' or old.status <> 'fakturert') then new.fakturert_tid := now();
  elsif new.status <> 'fakturert' then new.fakturert_tid := null; end if;
  -- Kundens kvittering bare når oppdraget er ferdig
  if tg_op = 'UPDATE' then
    if new.signatur <> '' and new.signatur is distinct from old.signatur then
      if new.status not in ('ferdig', 'fakturert') then raise exception 'Kunden kan kvittere når oppdraget er ferdig.' using errcode = 'P0001'; end if;
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
drop trigger if exists service_vakt on public.serviceoppdrag;
create trigger service_vakt before insert or update on public.serviceoppdrag
  for each row execute function public.service_vakt();

alter table public.serviceoppdrag enable row level security;
drop policy if exists service_les on public.serviceoppdrag;
create policy service_les on public.serviceoppdrag for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists service_ny on public.serviceoppdrag;
create policy service_ny on public.serviceoppdrag for insert to authenticated with check (public.er_ansatt());
drop policy if exists service_endre on public.serviceoppdrag;
create policy service_endre on public.serviceoppdrag for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists service_slett on public.serviceoppdrag;
create policy service_slett on public.serviceoppdrag for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.serviceoppdrag from anon;
grant select, insert, update, delete on public.serviceoppdrag to authenticated;

alter table public.bilder add column if not exists service_id uuid references public.serviceoppdrag(id) on delete cascade;
create index if not exists bilder_service on public.bilder (service_id) where service_id is not null;

-- ---------------------------------------------------------------------------
-- Timer på serviceoppdrag: føres på det faste serviceprosjektet, og er fakturerbare
-- ---------------------------------------------------------------------------
alter table public.timer add column if not exists service_id uuid references public.serviceoppdrag(id) on delete set null;
create index if not exists timer_service on public.timer (service_id) where service_id is not null;
alter table public.stempling add column if not exists service_id uuid references public.serviceoppdrag(id) on delete set null;

create or replace function public.timer_service() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sp uuid;
  b smallint := (select bedrift_id from public.ansatte where id = new.ansatt_id);
begin
  if tg_op = 'INSERT' and new.service_id is null and current_setting('bygglogg.stempel', true) = '1' then
    select s.service_id into new.service_id from public.stempling s
     where s.ansatt_id = new.ansatt_id and s.prosjekt_id is not distinct from new.prosjekt_id;
  end if;
  if new.service_id is null then return new; end if;
  if new.reklamasjon_id is not null or new.tillegg_id is not null then
    raise exception 'Timer på serviceoppdrag kan ikke samtidig gjelde reklamasjon eller tilleggsarbeid.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.serviceoppdrag where id = new.service_id and bedrift_id = b) then
    raise exception 'Fant ikke serviceoppdraget.' using errcode = 'P0001';
  end if;
  select service_prosjekt_id into sp from public.bedrifter where id = b;
  if sp is null then raise exception 'Leder må velge serviceprosjekt under Oppsett før det kan føres timer på serviceoppdrag.' using errcode = 'P0001'; end if;
  new.prosjekt_id := sp;
  new.fakturerbar := true;
  return new;
end $$;
drop trigger if exists timer_service on public.timer;
create trigger timer_service before insert or update on public.timer
  for each row execute function public.timer_service();

create or replace function public.stemple_service(s uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if s is not null and not exists (select 1 from public.serviceoppdrag where id = s and bedrift_id = public.min_bedrift()) then
    raise exception 'Fant ikke serviceoppdraget.' using errcode = 'P0001';
  end if;
  update public.stempling set service_id = s where ansatt_id = public.mitt_ansatt_id();
  if not found then raise exception 'Du er ikke logget inn.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.stemple_service(uuid) from public, anon;
grant execute on function public.stemple_service(uuid) to authenticated;

create or replace function public.lagre_serviceprosjekt(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan velge serviceprosjekt.' using errcode = 'P0001'; end if;
  if p is not null and not exists (select 1 from public.prosjekter where id = p and bedrift_id = public.min_bedrift()) then
    raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
  end if;
  update public.bedrifter set service_prosjekt_id = p where id = public.min_bedrift();
end $$;
revoke all on function public.lagre_serviceprosjekt(uuid) from public, anon;
grant execute on function public.lagre_serviceprosjekt(uuid) to authenticated;

/** Leder: lenken til kundeskjemaet (nøkkelen kan byttes hvis den er misbrukt) */
create or replace function public.service_skjema_nokkel(ny boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.er_leder() then return null; end if;
  if ny then
    update public.bedrifter set service_skjema_nokkel = replace(gen_random_uuid()::text, '-', '') where id = public.min_bedrift();
  end if;
  select service_skjema_nokkel into k from public.bedrifter where id = public.min_bedrift();
  return k;
end $$;
revoke all on function public.service_skjema_nokkel(boolean) from public, anon;
grant execute on function public.service_skjema_nokkel(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Kundeskjema på nettet (uten innlogging)
-- ---------------------------------------------------------------------------
create or replace function public.service_skjema_info(nokkel text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('navn', b.navn, 'telefon', coalesce(b.telefon, ''))
    from public.bedrifter b where length(coalesce(nokkel, '')) >= 20 and b.service_skjema_nokkel = nokkel
$$;
revoke all on function public.service_skjema_info(text) from public;
grant execute on function public.service_skjema_info(text) to anon, authenticated;

create or replace function public.meld_service(nokkel text, navn text, telefon text, epost text, adresse text,
  beskrivelse text, haster boolean default false, felle text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  b smallint;
  tlf text := regexp_replace(coalesce(telefon, ''), '[^0-9+]', '', 'g');
  k uuid;
begin
  if coalesce(felle, '') <> '' then return; end if;  -- robot som fylte ut det skjulte feltet
  select id into b from public.bedrifter where length(coalesce(nokkel, '')) >= 20 and service_skjema_nokkel = nokkel and aktiv;
  if b is null then raise exception 'Skjemaet er ikke i bruk lenger.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(navn, ''))) < 2 then raise exception 'Skriv navnet ditt.' using errcode = 'P0001'; end if;
  if length(regexp_replace(tlf, '\D', '', 'g')) < 8 then raise exception 'Skriv et telefonnummer vi kan nå deg på.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(beskrivelse, ''))) < 5 then raise exception 'Beskriv kort hva som skal gjøres.' using errcode = 'P0001'; end if;
  if (select count(*) from public.serviceoppdrag s where s.bedrift_id = b and s.kilde = 'skjema' and s.opprettet > now() - interval '1 hour') >= 20
     or (select count(*) from public.serviceoppdrag s where s.bedrift_id = b and s.kilde = 'skjema' and s.telefon = tlf and s.opprettet > now() - interval '1 day') >= 3 then
    raise exception 'Vi har fått mange henvendelser akkurat nå. Ring oss i stedet.' using errcode = 'P0001';
  end if;
  -- Kjent kunde på telefonnummeret?
  select id into k from public.kunder c
   where c.bedrift_id = b and length(tlf) >= 8 and right(regexp_replace(c.telefon, '\D', '', 'g'), 8) = right(regexp_replace(tlf, '\D', '', 'g'), 8)
   limit 1;
  perform set_config('bygglogg.skjema', '1', true);
  insert into public.serviceoppdrag (bedrift_id, kunde_id, kunde_navn, telefon, epost, adresse, tittel, beskrivelse, prioritet)
  values (b, k, left(trim(navn), 200), left(tlf, 40), left(trim(coalesce(epost, '')), 200), left(trim(coalesce(adresse, '')), 300),
          left(split_part(trim(beskrivelse), E'\n', 1), 200), left(trim(beskrivelse), 5000), case when haster then 'haster' else 'uke' end);
  perform set_config('bygglogg.skjema', '0', true);
end $$;
revoke all on function public.meld_service(text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.meld_service(text, text, text, text, text, text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Push: nytt oppdrag → leder og prosjektleder; tildelt → den ansvarlige
-- ---------------------------------------------------------------------------
create or replace function public.service_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if u is not null and exists (select 1 from pg_namespace where nspname = 'net')
     and (tg_op = 'INSERT' or new.ansvarlig_id is distinct from old.ansvarlig_id or (new.prioritet = 'haster' and old.prioritet <> 'haster')) then
    perform net.http_post(
      url := u || '/push',
      body := jsonb_build_object('type', 'service', 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;
drop trigger if exists service_push on public.serviceoppdrag;
create trigger service_push after insert or update of ansvarlig_id, prioritet on public.serviceoppdrag
  for each row execute function public.service_push();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'serviceoppdrag') then
    alter publication supabase_realtime add table public.serviceoppdrag;
  end if;
end $$;
