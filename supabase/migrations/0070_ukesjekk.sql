-- Ukesjekk: fredag ettermiddag får leder et push-varsel med det som trenger ham før helgen.
-- Tallene regnes her i databasen; push-funksjonen setter dem sammen til én kort tekst.
-- Det samme (og litt til, som hvem som mangler timer) vises i appen som «Ukesjekk» på startsiden.
create or replace function public.ukesjekk_tall(b smallint) returns jsonb
language sql stable security definer set search_path = public as $$
  with idag as (select (now() at time zone 'Europe/Oslo')::date d),
       man as (select d - ((extract(isodow from d)::int) - 1) m from idag),
       av as (select coalesce(moduler_av, '{}') av from public.bedrifter where id = b)
  select jsonb_strip_nulls(jsonb_build_object(
    'soknader', (select count(*) from public.soknader s join public.ansatte a on a.id = s.ansatt_id where a.bedrift_id = b and s.status = 'venter'),
    'godkjenn', (select count(*) from public.timer t join public.ansatte a on a.id = t.ansatt_id, man where a.bedrift_id = b and t.status = 'levert' and t.dato < man.m),
    'avvik', case when (select 'avvik' = any(av) from av) then null else (select count(*) from public.avvik x, idag
              where x.bedrift_id = b and x.status <> 'lukket' and ((x.frist is not null and x.frist < idag.d) or x.opprettet::date < idag.d - 14)) end,
    'reklamasjon', case when (select 'reklamasjon' = any(av) from av) then null else (select count(*) from public.reklamasjoner r, idag
              where r.bedrift_id = b and r.status in ('ny', 'godkjent') and r.frist is not null and r.frist < idag.d) end,
    'service_faktura', case when (select 'service' = any(av) from av) then null else (select count(*) from public.serviceoppdrag s where s.bedrift_id = b and s.status = 'ferdig') end,
    'service_drar', case when (select 'service' = any(av) from av) then null else (select count(*) from public.serviceoppdrag s, idag
              where s.bedrift_id = b and s.status = 'planlagt' and s.dato is not null and s.dato + greatest(s.dager - 1, 0) < idag.d) end,
    'bestilling', case when (select 'bestilling' = any(av) from av) then null else (select count(*) from public.bestillinger x join public.prosjekter p on p.id = x.prosjekt_id
              where p.bedrift_id = b and x.status = 'ny') end,
    'tilbud', case when (select 'tilbud' = any(av) from av) then null else (select count(*) from public.tilbud t, idag
              where t.bedrift_id = b and t.status = 'apen' and t.utfall is null and t.belop >= 5000
                and (case when t.neste_kontakt is not null then t.neste_kontakt <= idag.d
                          else t.dato between idag.d - 120 and idag.d - 7 end)) end
  ))
$$;
revoke all on function public.ukesjekk_tall(smallint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ukesjekk_tall(smallint) to service_role; end if;
end $$;

/** Kjøres av pg_cron fredag: ett varsel til hver leder (push-funksjonen sender bare én gang per uke) */
create or replace function public.ukesjekk_varsle() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if u is null or not exists (select 1 from pg_namespace where nspname = 'net') then return; end if;
  for r in select id from public.ansatte where aktiv and rolle = 'leder' loop
    perform net.http_post(
      url := u || '/push',
      body := jsonb_build_object('type', 'ukesjekk', 'id', r.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;
end $$;
revoke all on function public.ukesjekk_varsle() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'ukesjekk') then perform cron.unschedule('ukesjekk'); end if;
    -- Fredag kl. 11 UTC = kl. 13 sommertid / kl. 12 vintertid
    perform cron.schedule('ukesjekk', '0 11 * * 5', 'select public.ukesjekk_varsle()');
  end if;
end $$;
