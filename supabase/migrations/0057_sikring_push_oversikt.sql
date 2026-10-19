-- 1) Nøkkel for drift/feilsøking av edge-funksjonen visma-sync. Feilsøkingsvalgene (?prove, ?typer, ?type,
--    ?firmaer, ?skjema) og tvungen henting (?varer, ?utstyr, ?salg) krever headeren x-bygglogg-noekkel med denne
--    verdien. Bare tjenestenøkkelen (edge-funksjonen) og databasen selv kan lese den.
create table if not exists public.drift_noekkel (
  id     smallint primary key default 1 check (id = 1),
  verdi  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.drift_noekkel (id) values (1) on conflict do nothing;
alter table public.drift_noekkel enable row level security;
revoke all on public.drift_noekkel from anon, authenticated;

-- 2) Leder ser hvem som har slått på varsler (uten å se selve abonnementene)
create or replace function public.ansatte_med_push() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct p.ansatt_id from public.push_abonnement p
    join public.ansatte a on a.id = p.ansatt_id
   where a.bedrift_id = public.min_bedrift() and public.er_leder()
$$;
revoke all on function public.ansatte_med_push() from public, anon;
grant execute on function public.ansatte_med_push() to authenticated;
