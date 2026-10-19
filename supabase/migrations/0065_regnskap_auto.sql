-- Automatisk oppsett mot regnskapet (Visma Business NXT eller Tripletex).
--  * Visma: firmaet finnes av seg selv ut fra org.nr. når kunden har godkjent ByggLogg i Visma.
--    visma-sync ser etter nye firmaer hvert kvarter, og leder kan trykke «Sjekk nå».
--  * Ansatte som finnes i regnskapet, men ikke i ByggLogg, vises som forslag. Leder legger dem til
--    med ett trykk, og kan sende invitasjon til appen samtidig.
alter table public.bedrifter
  add column if not exists visma_status text not null default '',
  add column if not exists visma_sist   timestamptz,
  add column if not exists visma_navn   text not null default '';

-- Org.nr. kan bare settes av leder én gang (når det er tomt). Det brukes til å finne firmaet i Visma,
-- så det skal ikke kunne endres til et annet firma sitt nummer etterpå.
create or replace function public.bedrift_orgnr_vakt() returns trigger
language plpgsql set search_path = public as $$
begin
  new.orgnr := regexp_replace(coalesce(new.orgnr, ''), '\D', '', 'g');
  if coalesce(old.orgnr, '') <> '' and new.orgnr is distinct from old.orgnr
     and coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and not coalesce(public.er_plattform_admin(), false) then
    new.orgnr := old.orgnr;
  end if;
  return new;
end $$;
drop trigger if exists bedrift_orgnr_vakt on public.bedrifter;
create trigger bedrift_orgnr_vakt before update of orgnr on public.bedrifter
  for each row execute function public.bedrift_orgnr_vakt();

/** Leder: se etter firmaet i Visma nå (i stedet for å vente på neste kvarter) */
create or replace function public.koble_visma() returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bedrifter;
  u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if not public.er_leder() then raise exception 'Bare leder kan koble til Visma.' using errcode = 'P0001'; end if;
  select * into b from public.bedrifter where id = public.min_bedrift();
  if coalesce(b.orgnr, '') !~ '^\d{9}$' then raise exception 'Legg inn org.nr. i bedriftsprofilen først.' using errcode = 'P0001'; end if;
  if b.visma_sist is not null and b.visma_sist > now() - interval '1 minute' and b.visma_firma_nr is null then
    raise exception 'Sjekket nettopp. Vent et minutt.' using errcode = 'P0001';
  end if;
  update public.bedrifter set visma_status = 'Ser etter firmaet i Visma …', visma_sist = now() where id = b.id;
  if u is not null and exists (select 1 from pg_namespace where nspname = 'net') then
    perform net.http_post(url := u || '/visma-sync', body := jsonb_build_object('bedrift', b.id),
      headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 300000);
  end if;
end $$;
revoke all on function public.koble_visma() from public, anon;
grant execute on function public.koble_visma() to authenticated;

/** Leder: status for Visma-koblingen */
create or replace function public.visma_kobling() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.er_leder() then null else (
    select jsonb_build_object('koblet', b.visma_firma_nr is not null, 'firma', b.visma_navn, 'status', b.visma_status,
      'sist', b.visma_sist, 'orgnr', b.orgnr,
      'kunder', (select count(*) from public.kunder k where k.bedrift_id = b.id and k.visma_nr is not null),
      'prosjekter', (select count(*) from public.prosjekter p where p.bedrift_id = b.id and p.visma_nr is not null))
    from public.bedrifter b where b.id = public.min_bedrift()) end
$$;
revoke all on function public.visma_kobling() from public, anon;
grant execute on function public.visma_kobling() to authenticated;

-- ---------------------------------------------------------------------------
-- Ansatte funnet i regnskapet (skrives av visma-sync og tripletex-sync)
-- ---------------------------------------------------------------------------
create table if not exists public.ansatt_forslag (
  bedrift_id  smallint not null references public.bedrifter(id) on delete cascade,
  kilde       text not null check (kilde in ('visma', 'tripletex')),
  ekstern_id  text not null,
  navn        text not null,
  epost       text,
  ansattnr    text,
  sett        timestamptz not null default now(),
  avvist      boolean not null default false,
  primary key (bedrift_id, kilde, ekstern_id)
);
alter table public.ansatt_forslag enable row level security;
revoke all on public.ansatt_forslag from anon, authenticated;

/** Leder: forslag som ikke allerede er ansatt i ByggLogg (samme e-post, navn eller Tripletex-ID) */
create or replace function public.ansatt_forslag_liste()
returns table (kilde text, ekstern_id text, navn text, epost text, ansattnr text)
language sql stable security definer set search_path = public as $$
  select f.kilde, f.ekstern_id, f.navn, f.epost, f.ansattnr
    from public.ansatt_forslag f
   where public.er_leder() and f.bedrift_id = public.min_bedrift() and not f.avvist
     and not exists (
       select 1 from public.ansatte a where a.bedrift_id = f.bedrift_id and (
         (f.epost is not null and lower(trim(a.epost)) = lower(trim(f.epost)))
         or lower(trim(a.navn)) = lower(trim(f.navn))
         or (f.kilde = 'tripletex' and a.tripletex_id::text = f.ekstern_id)))
   order by f.navn
$$;
revoke all on function public.ansatt_forslag_liste() from public, anon;
grant execute on function public.ansatt_forslag_liste() to authenticated;

/** Leder: legg til forslagene som ansatte, og send invitasjon til de som har e-post. Gir antall lagt til. */
create or replace function public.legg_til_forslag(kilde text, ider text[], inviter boolean default true) returns integer
language plpgsql security definer set search_path = public as $$
declare
  b smallint := public.min_bedrift();
  avd integer := (select min(id) from public.avdelinger where bedrift_id = public.min_bedrift());
  f record;
  ny uuid;
  n integer := 0;
begin
  if not public.er_leder() then raise exception 'Bare leder kan legge til ansatte.' using errcode = 'P0001'; end if;
  if coalesce(array_length(ider, 1), 0) > 200 then raise exception 'For mange på en gang.' using errcode = 'P0001'; end if;
  for f in select x.* from public.ansatt_forslag_liste() x where x.kilde = legg_til_forslag.kilde and x.ekstern_id = any(ider) loop
    -- E-post som allerede brukes av en annen bedrift, kan ikke brukes til innlogging her
    if f.epost is not null and exists (select 1 from public.ansatte a where lower(trim(a.epost)) = lower(trim(f.epost))) then
      f.epost := null;
    end if;
    insert into public.ansatte (navn, epost, ansattnr, avdeling_id, bedrift_id, rekkefolge)
      values (f.navn, nullif(trim(f.epost), ''), nullif(trim(f.ansattnr), ''), avd, b, 99) returning id into ny;
    if f.kilde = 'tripletex' and f.ekstern_id ~ '^\d+$' then
      update public.ansatte set tripletex_id = f.ekstern_id::bigint where id = ny;
    end if;
    n := n + 1;
    if inviter and f.epost is not null then
      begin perform public.send_invitasjon(ny); exception when others then null; end;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.legg_til_forslag(text, text[], boolean) from public, anon;
grant execute on function public.legg_til_forslag(text, text[], boolean) to authenticated;

create or replace function public.avvis_forslag(kilde text, ekstern_id text) returns void
language sql security definer set search_path = public as $$
  update public.ansatt_forslag f set avvist = true
   where public.er_leder() and f.bedrift_id = public.min_bedrift() and f.kilde = avvis_forslag.kilde and f.ekstern_id = avvis_forslag.ekstern_id
$$;
revoke all on function public.avvis_forslag(text, text) from public, anon;
grant execute on function public.avvis_forslag(text, text) to authenticated;

-- Invitasjon til alle aktive med e-post som ikke har logget inn
create or replace function public.inviter_alle_som_mangler() returns integer
language plpgsql security definer set search_path = public as $$
declare
  a record;
  n integer := 0;
begin
  if not public.er_leder() then raise exception 'Bare leder kan sende invitasjoner.' using errcode = 'P0001'; end if;
  for a in select i.ansatt_id from public.ansatte_innlogging() i join public.ansatte x on x.id = i.ansatt_id
            where x.aktiv and coalesce(trim(x.epost), '') <> '' and i.innlogget is null
              and (i.invitert is null or i.invitert < now() - interval '1 day') loop
    begin perform public.send_invitasjon(a.ansatt_id); n := n + 1; exception when others then null; end;
  end loop;
  return n;
end $$;
revoke all on function public.inviter_alle_som_mangler() from public, anon;
grant execute on function public.inviter_alle_som_mangler() to authenticated;

-- Visma-henting hvert kvarter for bedrifter som bruker (eller venter på) Visma
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('visma-sync', '*/15 4-20 * * *', $c$
      select net.http_post(
        url := o.verdi || '/visma-sync',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 300000)
      from public.plattform_oppsett o
      where o.nokkel = 'functions_url'
        and exists (select 1 from public.bedrifter b where b.aktiv and not b.tripletex_aktiv
                     and (b.visma_firma_nr is not null or b.orgnr ~ '^\d{9}$'))
    $c$);
  end if;
end $$;
