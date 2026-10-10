-- Språk i appen per ansatt: norsk (nb) eller polsk (pl). Den ansatte kan bytte selv.
alter table public.ansatte add column if not exists sprak text not null default 'nb' check (sprak in ('nb', 'pl'));

create or replace function public.sett_mitt_sprak(sprak text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if sprak not in ('nb', 'pl') then raise exception 'Ukjent språk.' using errcode = 'P0001'; end if;
  update public.ansatte set sprak = sett_mitt_sprak.sprak where id = public.mitt_ansatt_id();
end $$;
revoke all on function public.sett_mitt_sprak(text) from public, anon;
grant execute on function public.sett_mitt_sprak(text) to authenticated;

-- N L Austnes: polsk for Dawid, Stanislaw og Mieczyslaw
update public.ansatte set sprak = 'pl' where navn ilike 'Dawid%' or navn ilike 'Stanislaw%' or navn ilike 'Mieczys%';
