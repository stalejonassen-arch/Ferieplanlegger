-- Kampanjer fra Byggfag (DM): leder legger inn sidene som bilder med periode, alle ansatte ser dem i appen.
-- Hver ansatt kan skjule en kampanje, eller slå av kampanjer helt.
create table public.kampanjer (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  tittel      text not null check (length(tittel) between 1 and 120),
  tekst       text not null default '' check (length(tekst) <= 1000),
  fra         date not null,
  til         date not null,
  lenke       text check (lenke is null or lenke ~* '^https?://'),
  sider       text[] not null default '{}',
  opprettet   timestamptz not null default now(),
  check (til >= fra)
);
create index kampanjer_periode on public.kampanjer (bedrift_id, til desc);

create or replace function public.kampanjer_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := public.min_bedrift();
  if tg_op = 'UPDATE' then new.opprettet := old.opprettet; end if;
  return new;
end $$;
create trigger kampanjer_vakt before insert or update on public.kampanjer
  for each row execute function public.kampanjer_vakt();

alter table public.kampanjer enable row level security;
create policy kampanjer_les on public.kampanjer for select to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_ansatt());
create policy kampanjer_ny on public.kampanjer for insert to authenticated
  with check (public.er_leder());
create policy kampanjer_endre on public.kampanjer for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder()) with check (public.er_leder());
create policy kampanjer_slett on public.kampanjer for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.kampanjer from anon;
grant select, insert, update, delete on public.kampanjer to authenticated;

-- Den ansattes valg
alter table public.ansatte add column if not exists vis_kampanjer boolean not null default true;
alter table public.ansatte add column if not exists skjulte_kampanjer uuid[] not null default '{}';

create or replace function public.sett_vis_kampanjer(vis boolean) returns void
language sql security definer set search_path = public as $$
  update public.ansatte set vis_kampanjer = coalesce(sett_vis_kampanjer.vis, true) where id = public.mitt_ansatt_id();
$$;
revoke all on function public.sett_vis_kampanjer(boolean) from public, anon;
grant execute on function public.sett_vis_kampanjer(boolean) to authenticated;

create or replace function public.skjul_kampanje(kampanje uuid) returns void
language sql security definer set search_path = public as $$
  update public.ansatte
     set skjulte_kampanjer = (select coalesce(array_agg(distinct x), '{}') from unnest(skjulte_kampanjer || skjul_kampanje.kampanje) x
                               where x in (select id from public.kampanjer))
   where id = public.mitt_ansatt_id();
$$;
revoke all on function public.skjul_kampanje(uuid) from public, anon;
grant execute on function public.skjul_kampanje(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kampanjer;
  end if;
end $$;
