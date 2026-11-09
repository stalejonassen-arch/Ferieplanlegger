-- Nytt tema «Skog og messing» (ByggLoggs profilfarger, som bygglogg.app)
alter table public.ansatte drop constraint if exists ansatte_tema_check;
alter table public.ansatte add constraint ansatte_tema_check check (tema is null or tema in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'thaugland', 'egen', 'skifer', 'skog'));
-- Bedriftens standardtema finnes bare der bedriftene har eget oppsett
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bedrifter' and column_name = 'tema') then
    alter table public.bedrifter drop constraint if exists bedrifter_tema_check;
    alter table public.bedrifter add constraint bedrifter_tema_check check (tema in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'thaugland', 'egen', 'skifer', 'skog'));
  end if;
end $$;

create or replace function public.sett_mitt_tema(tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if tema not in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'thaugland', 'egen', 'skifer', 'skog') then raise exception 'Ukjent tema.' using errcode = 'P0001'; end if;
  update public.ansatte set tema = sett_mitt_tema.tema where id = public.mitt_ansatt_id();
end $$;
