-- Push-varsel når en ansatt har vært stemplet inn lenge (glemt å stemple ut).
-- Tiden regnes fra første stempling i dag. Standard 8 t 15 min, de polske 9 t 15 min. Leder kan endre per ansatt (null = av).
-- Ett varsel per ansatt per dag. Hvert 5. minutt sjekker databasen og kaller edge-funksjonen «push».

alter table public.ansatte add column if not exists varsel_stemplet_min smallint default 495
  check (varsel_stemplet_min is null or varsel_stemplet_min between 60 and 960);
update public.ansatte set varsel_stemplet_min = 555 where sprak = 'pl';

-- Hvem som har passert grensen og ikke har fått varsel i dag
create or replace function public.stemplet_lenge() returns table (ansatt_id uuid, dato date, start time, minutter integer)
language sql stable security definer set search_path = public as $$
  with s as (
    select st.ansatt_id, st.dato, a.varsel_stemplet_min as grense,
      least(st.fra, coalesce((select min(t.fra) from public.timer t
        where t.ansatt_id = st.ansatt_id and t.dato = st.dato and t.kilde = 'stempel'), st.fra)) as start
    from public.stempling st
    join public.ansatte a on a.id = st.ansatt_id
    where a.aktiv and a.varsel_stemplet_min is not null
  )
  select s.ansatt_id, s.dato, s.start,
    (extract(epoch from ((now() at time zone 'Europe/Oslo') - (s.dato + s.start))) / 60)::integer
  from s
  where (now() at time zone 'Europe/Oslo') - (s.dato + s.start) >= make_interval(mins => s.grense)
    and not exists (select 1 from public.push_logg l where l.type = 'stemplet:' || s.dato and l.id = s.ansatt_id)
$$;
revoke all on function public.stemplet_lenge() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.stemplet_lenge() to service_role; end if;
end $$;

create or replace function public.stemplet_varsle() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then return; end if;
  for r in select * from public.stemplet_lenge() loop
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/push',
      body := jsonb_build_object('type', 'stemplet', 'id', r.ansatt_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;
end $$;
revoke all on function public.stemplet_varsle() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('stemplet-varsel', '*/5 * * * *', 'select public.stemplet_varsle()');
  end if;
end $$;
