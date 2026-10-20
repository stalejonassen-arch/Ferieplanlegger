-- Flere språk i appen: engelsk (en) og litauisk (lt) i tillegg til norsk og polsk.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.ansatte'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%sprak%' loop
    execute format('alter table public.ansatte drop constraint %I', c);
  end loop;
end $$;
alter table public.ansatte add constraint ansatte_sprak_check check (sprak in ('nb', 'pl', 'en', 'lt'));

create or replace function public.sett_mitt_sprak(sprak text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if sprak not in ('nb', 'pl', 'en', 'lt') then raise exception 'Ukjent språk.' using errcode = 'P0001'; end if;
  update public.ansatte set sprak = sett_mitt_sprak.sprak where id = public.mitt_ansatt_id();
end $$;
revoke all on function public.sett_mitt_sprak(text) from public, anon;
grant execute on function public.sett_mitt_sprak(text) to authenticated;
