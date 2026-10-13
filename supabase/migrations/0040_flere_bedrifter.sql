-- ByggLogg for flere bedrifter (abonnementsversjonen): hver bedrift ser og endrer bare sine egne data,
-- bedriften har en egen profil (navn, sted, farger, kjede), og plattform-admin kan opprette nye kunder.

-- ---------------------------------------------------------------------------
-- Bedriftens profil og abonnement
-- ---------------------------------------------------------------------------
alter table public.bedrifter
  add column if not exists undertittel     text not null default '',
  add column if not exists adresse         text not null default '',
  add column if not exists postnr          text not null default '',
  add column if not exists poststed        text not null default '',
  add column if not exists telefon         text not null default '',
  add column if not exists epost           text not null default '',
  add column if not exists sted_navn       text not null default '',
  add column if not exists sted_lat        numeric(8,5),
  add column if not exists sted_lon        numeric(8,5),
  add column if not exists tema            text not null default 'byggfag',
  add column if not exists kjede           text not null default 'Byggfag',
  add column if not exists kampanje_tittel text not null default 'Kampanje fra Byggfag',
  add column if not exists aktiv           boolean not null default true,
  add column if not exists abonnement_til  date,
  add column if not exists maks_brukere    smallint;

-- ---------------------------------------------------------------------------
-- Plattform-admin (den som selger og drifter ByggLogg)
-- ---------------------------------------------------------------------------
create table if not exists public.plattform_admin (epost text primary key);
alter table public.plattform_admin enable row level security;
revoke all on public.plattform_admin from anon, authenticated;

create or replace function public.er_plattform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plattform_admin where lower(epost) = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.er_plattform_admin() from public, anon;
grant execute on function public.er_plattform_admin() to authenticated;

-- En ansatt i en bedrift som er stengt (ikke betalt, avsluttet) får ikke tilgang
create or replace function public.mitt_ansatt_id() returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from public.ansatte a join public.bedrifter b on b.id = a.bedrift_id
  where a.aktiv and b.aktiv and a.epost is not null
    and lower(a.epost) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;
create or replace function public.er_leder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ansatte where id = public.mitt_ansatt_id() and rolle = 'leder')
$$;

/** Hører den ansatte til samme bedrift som meg? */
create or replace function public.i_min_bedrift(ansatt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ansatte where id = ansatt and bedrift_id = public.min_bedrift())
$$;
revoke all on function public.i_min_bedrift(uuid) from public, anon;
grant execute on function public.i_min_bedrift(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tilgangsregler som manglet bedrift-skille
-- ---------------------------------------------------------------------------
drop policy if exists ansatte_les on public.ansatte;
drop policy if exists ansatte_leder on public.ansatte;
create policy ansatte_les on public.ansatte for select to authenticated using (bedrift_id = public.min_bedrift());
create policy ansatte_leder on public.ansatte for all to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift())
  with check (public.er_leder() and bedrift_id = public.min_bedrift());

drop policy if exists avdelinger_les on public.avdelinger;
drop policy if exists avdelinger_leder on public.avdelinger;
create policy avdelinger_les on public.avdelinger for select to authenticated using (bedrift_id = public.min_bedrift());
create policy avdelinger_leder on public.avdelinger for all to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift())
  with check (public.er_leder() and bedrift_id = public.min_bedrift());
-- Avdelingsnavn er unike per bedrift, ikke for hele plattformen
alter table public.avdelinger drop constraint if exists avdelinger_navn_key;
create unique index if not exists avdelinger_bedrift_navn on public.avdelinger (bedrift_id, navn);

drop policy if exists ferieaar_les on public.ferieaar;
drop policy if exists ferieaar_leder on public.ferieaar;
create policy ferieaar_les on public.ferieaar for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and public.i_min_bedrift(ansatt_id)));
create policy ferieaar_leder on public.ferieaar for all to authenticated
  using (public.er_leder() and public.i_min_bedrift(ansatt_id))
  with check (public.er_leder() and public.i_min_bedrift(ansatt_id));

drop policy if exists soknader_les on public.soknader;
drop policy if exists soknader_ny on public.soknader;
drop policy if exists soknader_endre on public.soknader;
drop policy if exists soknader_slett on public.soknader;
create policy soknader_les on public.soknader for select to authenticated using (public.i_min_bedrift(ansatt_id));
create policy soknader_ny on public.soknader for insert to authenticated
  with check (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and public.i_min_bedrift(ansatt_id)));
create policy soknader_endre on public.soknader for update to authenticated
  using ((public.er_leder() and public.i_min_bedrift(ansatt_id)) or (ansatt_id = public.mitt_ansatt_id() and status = 'venter'))
  with check ((public.er_leder() and public.i_min_bedrift(ansatt_id)) or ansatt_id = public.mitt_ansatt_id());
create policy soknader_slett on public.soknader for delete to authenticated
  using ((public.er_leder() and public.i_min_bedrift(ansatt_id)) or (ansatt_id = public.mitt_ansatt_id() and status = 'venter'));

-- Synkloggen gjelder hele plattformen: bare plattform-admin ser den
drop policy if exists visma_sync_les on public.visma_sync_logg;
create policy visma_sync_les on public.visma_sync_logg for select to authenticated using (public.er_plattform_admin());

-- Plattform-admin ser alle bedrifter
drop policy if exists bedrifter_admin on public.bedrifter;
create policy bedrifter_admin on public.bedrifter for select to authenticated using (public.er_plattform_admin());

-- Nye ansatte og avdelinger havner alltid i lederens egen bedrift, og kan ikke flyttes
create or replace function public.bedrift_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Plattform-admin som oppretter en ny kunde, setter bedriften selv (se opprett_bedrift)
    if coalesce(current_setting('bygglogg.ny_bedrift', true), '') <> new.bedrift_id::text then
      new.bedrift_id := coalesce(public.min_bedrift(), new.bedrift_id);
    end if;
  else
    new.bedrift_id := old.bedrift_id;
  end if;
  -- En ansatt kan bare høre til en avdeling i sin egen bedrift
  if tg_table_name = 'ansatte' then
    if not exists (select 1 from public.avdelinger where id = (to_jsonb(new) ->> 'avdeling_id')::bigint and bedrift_id = new.bedrift_id) then
      raise exception 'Avdelingen finnes ikke i bedriften.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ansatte_bedrift on public.ansatte;
create trigger ansatte_bedrift before insert or update on public.ansatte for each row execute function public.bedrift_vakt();
drop trigger if exists avdelinger_bedrift on public.avdelinger;
create trigger avdelinger_bedrift before insert or update on public.avdelinger for each row execute function public.bedrift_vakt();

-- Hver bedrift må ha minst én aktiv leder med e-post
create or replace function public.leder_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ansatte where bedrift_id = old.bedrift_id and aktiv and rolle = 'leder' and epost is not null) then
    raise exception 'Det må være minst én aktiv leder med e-post.' using errcode = 'P0001';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Bedriftens egen profil (leder kan endre navn, adresse, sted for vær, farger og kampanjetittel)
-- ---------------------------------------------------------------------------
create or replace function public.lagre_bedriftsprofil(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre bedriftens profil.' using errcode = 'P0001'; end if;
  update public.bedrifter set
    navn            = coalesce(nullif(trim(p ->> 'navn'), ''), navn),
    undertittel     = coalesce(p ->> 'undertittel', undertittel),
    adresse         = coalesce(p ->> 'adresse', adresse),
    postnr          = coalesce(p ->> 'postnr', postnr),
    poststed        = coalesce(p ->> 'poststed', poststed),
    telefon         = coalesce(p ->> 'telefon', telefon),
    epost           = coalesce(p ->> 'epost', epost),
    orgnr           = coalesce(p ->> 'orgnr', orgnr),
    sted_navn       = coalesce(p ->> 'sted_navn', sted_navn),
    sted_lat        = coalesce((p ->> 'sted_lat')::numeric, sted_lat),
    sted_lon        = coalesce((p ->> 'sted_lon')::numeric, sted_lon),
    tema            = coalesce(p ->> 'tema', tema),
    kampanje_tittel = coalesce(p ->> 'kampanje_tittel', kampanje_tittel)
  where id = public.min_bedrift();
end $$;
revoke all on function public.lagre_bedriftsprofil(jsonb) from public, anon;
grant execute on function public.lagre_bedriftsprofil(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Plattform-admin: opprett ny kunde, oversikt, steng/åpne
-- ---------------------------------------------------------------------------
create or replace function public.opprett_bedrift(navn text, orgnr text, leder_navn text, leder_epost text,
  avdelinger text[] default array['Butikk', 'Snekker'], visma_firma_nr integer default null) returns smallint
language plpgsql security definer set search_path = public as $$
declare ny smallint; avd bigint; i int := 0; a text;
begin
  if not public.er_plattform_admin() then raise exception 'Bare plattform-admin kan opprette bedrifter.' using errcode = 'P0001'; end if;
  if coalesce(trim(navn), '') = '' or coalesce(trim(leder_epost), '') = '' then raise exception 'Navn og lederens e-post må fylles ut.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.ansatte where lower(epost) = lower(trim(leder_epost))) then
    raise exception 'E-postadressen er allerede i bruk i ByggLogg.' using errcode = 'P0001';
  end if;
  insert into public.bedrifter (id, navn, orgnr, visma_firma_nr, undertittel)
  values ((select coalesce(max(id), 0) + 1 from public.bedrifter), trim(navn), coalesce(orgnr, ''), visma_firma_nr, 'Byggfag · ' || trim(navn))
  returning id into ny;
  perform set_config('bygglogg.ny_bedrift', ny::text, true);
  foreach a in array coalesce(avdelinger, array['Butikk']) loop
    i := i + 1;
    insert into public.avdelinger (navn, maks_borte, rekkefolge, bedrift_id) values (trim(a), 1, i, ny);
  end loop;
  select id into avd from public.avdelinger where bedrift_id = ny order by rekkefolge limit 1;
  insert into public.ansatte (navn, epost, avdeling_id, rolle, rekkefolge, bedrift_id)
  values (trim(leder_navn), lower(trim(leder_epost)), avd, 'leder', 1, ny);
  perform set_config('bygglogg.ny_bedrift', '', true);
  return ny;
end $$;
revoke all on function public.opprett_bedrift(text, text, text, text, text[], integer) from public, anon;
grant execute on function public.opprett_bedrift(text, text, text, text, text[], integer) to authenticated;

create or replace function public.plattform_oversikt() returns table (
  id smallint, navn text, orgnr text, aktiv boolean, abonnement_til date, visma_firma_nr integer,
  ansatte bigint, ledere text, sist_aktiv timestamptz, opprettet timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.navn, b.orgnr, b.aktiv, b.abonnement_til, b.visma_firma_nr,
    (select count(*) from public.ansatte a where a.bedrift_id = b.id and a.aktiv),
    (select string_agg(a.navn || ' <' || coalesce(a.epost, '') || '>', ', ') from public.ansatte a where a.bedrift_id = b.id and a.rolle = 'leder' and a.aktiv),
    (select max(t.opprettet) from public.timer t where t.bedrift_id = b.id),
    b.opprettet
  from public.bedrifter b
  where public.er_plattform_admin()
  order by b.id
$$;
revoke all on function public.plattform_oversikt() from public, anon;
grant execute on function public.plattform_oversikt() to authenticated;

create or replace function public.sett_abonnement(bedrift smallint, aktiv boolean, til date default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_plattform_admin() then raise exception 'Bare plattform-admin kan endre abonnement.' using errcode = 'P0001'; end if;
  update public.bedrifter set aktiv = sett_abonnement.aktiv, abonnement_til = sett_abonnement.til where id = sett_abonnement.bedrift;
end $$;
revoke all on function public.sett_abonnement(smallint, boolean, date) from public, anon;
grant execute on function public.sett_abonnement(smallint, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Farger: bedriften har standardfarger; den ansatte kan velge egne (null = følg bedriften)
-- ---------------------------------------------------------------------------
alter table public.ansatte alter column tema drop not null;
alter table public.ansatte alter column tema set default null;
alter table public.ansatte drop constraint if exists ansatte_tema_check;
alter table public.ansatte add constraint ansatte_tema_check check (tema is null or tema in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'thaugland'));
alter table public.bedrifter drop constraint if exists bedrifter_tema_check;
alter table public.bedrifter add constraint bedrifter_tema_check check (tema in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'thaugland'));

create or replace function public.sett_mitt_tema(tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if tema not in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'thaugland') then raise exception 'Ukjent tema.' using errcode = 'P0001'; end if;
  update public.ansatte set tema = sett_mitt_tema.tema where id = public.mitt_ansatt_id();
end $$;
