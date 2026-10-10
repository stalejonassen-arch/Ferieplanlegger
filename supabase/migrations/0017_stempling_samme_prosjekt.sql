-- Ansatte ser hvem andre som er logget inn – men bare når de selv er logget inn på samme prosjekt.
create or replace function public.mitt_stempel_prosjekt() returns uuid
language sql stable security definer set search_path = public as $$
  select prosjekt_id from public.stempling where ansatt_id = public.mitt_ansatt_id()
$$;
revoke all on function public.mitt_stempel_prosjekt() from public, anon;
grant execute on function public.mitt_stempel_prosjekt() to authenticated;

drop policy if exists stempling_les on public.stempling;
create policy stempling_les on public.stempling for select to authenticated
  using (
    ansatt_id = public.mitt_ansatt_id()
    or (public.er_leder() and bedrift_id = public.min_bedrift())
    or (prosjekt_id is not null and prosjekt_id = public.mitt_stempel_prosjekt())
  );
