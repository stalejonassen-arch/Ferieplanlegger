-- Plattform: push-varsler og «fortsatt stemplet inn» kaller edge-funksjonen i sitt eget Supabase-prosjekt.
-- Adressen ligger i plattform_oppsett (functions_url), slik som for Tripletex-hentingen.

create or replace function public.push_varsel() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if u is not null and exists (select 1 from pg_namespace where nspname = 'net') then
    perform net.http_post(
      url := u || '/push',
      body := jsonb_build_object('type', tg_argv[0], 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;

create or replace function public.stemplet_varsle() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if u is null or not exists (select 1 from pg_namespace where nspname = 'net') then return; end if;
  for r in select * from public.stemplet_lenge() loop
    perform net.http_post(
      url := u || '/push',
      body := jsonb_build_object('type', 'stemplet', 'id', r.ansatt_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;
end $$;
revoke all on function public.stemplet_varsle() from public, anon, authenticated;
