-- Fargetema i appen per ansatt (standard Byggfag-blå, fargerik, mørk). Den ansatte kan bytte selv.
alter table public.ansatte add column if not exists tema text not null default 'standard'
  check (tema in ('standard', 'fargerik', 'mork'));

create or replace function public.sett_mitt_tema(tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if tema not in ('standard', 'fargerik', 'mork') then raise exception 'Ukjent tema.' using errcode = 'P0001'; end if;
  update public.ansatte set tema = sett_mitt_tema.tema where id = public.mitt_ansatt_id();
end $$;
revoke all on function public.sett_mitt_tema(text) from public, anon;
grant execute on function public.sett_mitt_tema(text) to authenticated;

-- Karianne (Kjøkken og Interiør) starter med det fargerike oppsettet
update public.ansatte set tema = 'fargerik' where navn ilike 'Karianne%';
