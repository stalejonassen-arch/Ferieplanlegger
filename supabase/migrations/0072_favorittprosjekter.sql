-- Favorittprosjekter: hver ansatt kan stjernemerke «sine» prosjekter, så de ligger øverst i prosjektlista,
-- i prosjektvelgeren og som hurtigvalg når timer føres og man stempler inn.
alter table public.ansatte add column if not exists favoritter uuid[] not null default '{}';

create or replace function public.sett_favoritt(prosjekt uuid, pa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if pa then
    if not exists (select 1 from public.prosjekter where id = prosjekt and bedrift_id = public.min_bedrift()) then
      raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
    end if;
    update public.ansatte set favoritter = array_append(array_remove(favoritter, prosjekt), prosjekt)
    where id = public.mitt_ansatt_id() and coalesce(array_length(favoritter, 1), 0) < 100;
  else
    update public.ansatte set favoritter = array_remove(favoritter, prosjekt) where id = public.mitt_ansatt_id();
  end if;
end $$;
revoke all on function public.sett_favoritt(uuid, boolean) from public, anon;
grant execute on function public.sett_favoritt(uuid, boolean) to authenticated;
