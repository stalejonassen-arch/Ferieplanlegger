-- Dagbok-påminnelse: interntid trenger ikke dagbok. Bare fakturerbare timer teller, og innstempling på
-- interne prosjekter (som bare har ikke-fakturerbare timer) gir ikke varsel.
create or replace function public.mangler_dagbok() returns table (ansatt_id uuid, prosjekt_id uuid, navn text)
language sql stable security definer set search_path = public as $$
  with idag as (select (now() at time zone 'Europe/Oslo')::date d),
  -- Interne prosjekter (bare ikke-fakturerbare timer før i dag, siste 120 dager, f.eks. lastebil, kasser) trenger ikke dagbok
  intern as (
    select t.prosjekt_id from public.timer t, idag
    where t.prosjekt_id is not null and t.dato > idag.d - 120 and t.dato < idag.d
    group by t.prosjekt_id having not bool_or(t.fakturerbar)
  ),
  jobbet as (
    select t.ansatt_id, t.prosjekt_id from public.timer t, idag where t.dato = idag.d and t.prosjekt_id is not null and t.fakturerbar and t.prosjekt_id not in (select prosjekt_id from intern)
    union
    select s.ansatt_id, s.prosjekt_id from public.stempling s, idag
    where s.dato = idag.d and s.prosjekt_id is not null and s.prosjekt_id not in (select prosjekt_id from intern)
  )
  select j.ansatt_id, j.prosjekt_id, p.navn
  from jobbet j
  join public.ansatte a on a.id = j.ansatt_id and a.aktiv
  join public.prosjekter p on p.id = j.prosjekt_id and p.aktiv and p.navn !~* 'utstyr|arbeidskl|arbeidst'
  where not exists (select 1 from public.dagbok b, idag where b.prosjekt_id = j.prosjekt_id and b.dato = idag.d)
  order by j.ansatt_id, p.navn
$$;
