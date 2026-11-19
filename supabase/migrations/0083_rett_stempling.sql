-- Trykket feil? Den ansatte kan selv
--  1) flytte økten han er logget inn på til riktig prosjekt (hele økten, uten å dele den opp), og
--  2) angre en utlogging de siste 15 minuttene (økten åpnes igjen, og timeføringen som ble laget fjernes).

create or replace function public.rett_stempling(prosjekt uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  s public.stempling;
begin
  if meg is null then raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = 'P0001'; end if;
  select * into s from public.stempling where ansatt_id = meg for update;
  if s.ansatt_id is null then raise exception 'Du er ikke logget inn.' using errcode = 'P0001'; end if;
  if prosjekt is not null and not exists (select 1 from public.prosjekter where id = prosjekt and bedrift_id = public.min_bedrift()) then
    raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
  end if;
  if prosjekt is not distinct from s.prosjekt_id then return; end if;
  update public.stempling
     set prosjekt_id = prosjekt, reklamasjon_id = null, tillegg_id = null, service_id = null
   where ansatt_id = meg;
end $$;
revoke all on function public.rett_stempling(uuid) from public, anon;
grant execute on function public.rett_stempling(uuid) to authenticated;

create or replace function public.angre_utlogging()
returns void
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  t public.timer;
begin
  if meg is null then raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.stempling where ansatt_id = meg) then
    raise exception 'Du er allerede logget inn.' using errcode = 'P0001';
  end if;
  select * into t from public.timer
   where ansatt_id = meg and kilde = 'stempel' and status = 'levert' and opprettet > now() - interval '15 minutes'
   order by opprettet desc limit 1;
  if t.id is null then
    raise exception 'Det er ingen utlogging å angre. Det går bare de første 15 minuttene – ellers retter du timene i ukelista.' using errcode = 'P0001';
  end if;
  insert into public.stempling (ansatt_id, bedrift_id, prosjekt_id, dato, fra, startet, reklamasjon_id, tillegg_id, service_id)
  values (meg, t.bedrift_id, t.prosjekt_id, t.dato, t.fra, (t.dato + t.fra) at time zone 'Europe/Oslo', t.reklamasjon_id, t.tillegg_id, t.service_id);
  delete from public.timer where id = t.id;
end $$;
revoke all on function public.angre_utlogging() from public, anon;
grant execute on function public.angre_utlogging() to authenticated;
