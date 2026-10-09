-- Mål for fakturerte timer settes per år og kan endres av leder i ByggLogg (7 000 fra okt 2026).
alter table public.bedrifter add column maal_fakturert_aar numeric(7,1) not null default 6000;
update public.bedrifter set maal_fakturert_aar = 7000 where id = 1;

create or replace function public.sett_maal(aar numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then
    raise exception 'Bare leder kan endre målet.' using errcode = 'P0001';
  end if;
  if aar is null or aar <= 0 or aar > 100000 then
    raise exception 'Målet må være et positivt antall timer.' using errcode = 'P0001';
  end if;
  update public.bedrifter set maal_fakturert_aar = aar, maal_fakturert_mnd = round(aar / 12, 1) where id = public.min_bedrift();
end $$;
revoke all on function public.sett_maal(numeric) from public, anon;
grant execute on function public.sett_maal(numeric) to authenticated;
update public.bedrifter set maal_fakturert_mnd = round(maal_fakturert_aar / 12, 1);
