-- Nytt standardtema (skandinavisk, lyst). Det mørkeblå Byggfag-oppsettet kan velges som «byggfag».
alter table public.ansatte drop constraint if exists ansatte_tema_check;
alter table public.ansatte add constraint ansatte_tema_check check (tema in ('standard', 'byggfag', 'fargerik', 'mork'));

create or replace function public.sett_mitt_tema(tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if tema not in ('standard', 'byggfag', 'fargerik', 'mork') then raise exception 'Ukjent tema.' using errcode = 'P0001'; end if;
  update public.ansatte set tema = sett_mitt_tema.tema where id = public.mitt_ansatt_id();
end $$;
