-- Dagbok-påminnelse: kl. 15 på hverdager får de som har jobbet på et prosjekt i dag (timer eller stemplet inn)
-- et push-varsel hvis det ikke er skrevet dagbok for prosjektet i dag. Én dagbok fra noen på prosjektet holder,
-- så et helt lag får ikke varsel når én har skrevet. Varselet åpner prosjektets dagbok direkte.

create or replace function public.mangler_dagbok() returns table (ansatt_id uuid, prosjekt_id uuid, navn text)
language sql stable security definer set search_path = public as $$
  with idag as (select (now() at time zone 'Europe/Oslo')::date d),
  jobbet as (
    select t.ansatt_id, t.prosjekt_id from public.timer t, idag where t.dato = idag.d and t.prosjekt_id is not null
    union
    select s.ansatt_id, s.prosjekt_id from public.stempling s, idag where s.dato = idag.d and s.prosjekt_id is not null
  )
  select j.ansatt_id, j.prosjekt_id, p.navn
  from jobbet j
  join public.ansatte a on a.id = j.ansatt_id and a.aktiv
  join public.prosjekter p on p.id = j.prosjekt_id and p.aktiv and p.navn !~* 'utstyr|arbeidskl|arbeidst'
  where not exists (select 1 from public.dagbok b, idag where b.prosjekt_id = j.prosjekt_id and b.dato = idag.d)
  order by j.ansatt_id, p.navn
$$;
revoke all on function public.mangler_dagbok() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.mangler_dagbok() to service_role; end if;
end $$;

-- Kjøres av pg_cron; sender bare når klokka er 15 i Norge (cron går i UTC, så både sommer- og vintertid dekkes)
create or replace function public.dagbok_varsle() returns void
language plpgsql security definer set search_path = public as $$
declare r record; naa timestamp := now() at time zone 'Europe/Oslo';
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then return; end if;
  if extract(hour from naa) <> 15 or extract(isodow from naa) > 5 then return; end if;
  for r in select distinct ansatt_id from public.mangler_dagbok() loop
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/push',
      body := jsonb_build_object('type', 'dagbok', 'id', r.ansatt_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;
end $$;
revoke all on function public.dagbok_varsle() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'dagbok-varsel') then perform cron.unschedule('dagbok-varsel'); end if;
    -- 13 UTC = 15 sommertid, 14 UTC = 15 vintertid; funksjonen sjekker selv klokka i Norge
    perform cron.schedule('dagbok-varsel', '0 13,14 * * 1-5', 'select public.dagbok_varsle()');
  end if;
end $$;
