-- Meldinger i appen (erstatter Messenger): felles kanal for hele bedriften, én tråd per prosjekt,
-- og private samtaler mellom to ansatte.
-- kanal: 'felles' | 'p:<prosjekt-id>' | 'dm:<ansatt-id>:<ansatt-id>' (id-ene sortert)
create table public.meldinger (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  kanal       text not null check (kanal = 'felles' or kanal ~ '^p:[0-9a-f-]{36}$' or kanal ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  tekst       text not null default '' check (length(tekst) <= 4000),
  bilde_sti   text,
  opprettet   timestamptz not null default now(),
  endret      timestamptz,
  check (tekst <> '' or bilde_sti is not null)
);
create index meldinger_kanal on public.meldinger (bedrift_id, kanal, opprettet desc);

-- Hvem kan se en kanal: felles og prosjekt = alle i bedriften; privat = bare de to
create or replace function public.kan_se_kanal(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select k = 'felles' or k like 'p:%' or (k like 'dm:%' and position(public.mitt_ansatt_id()::text in k) > 0)
$$;
revoke all on function public.kan_se_kanal(text) from public, anon;
grant execute on function public.kan_se_kanal(text) to authenticated;

create or replace function public.meldinger_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.ansatt_id := public.mitt_ansatt_id();
    new.opprettet := now();
    if new.kanal like 'p:%' and not exists (select 1 from public.prosjekter where id = substr(new.kanal, 3)::uuid and bedrift_id = new.bedrift_id) then
      raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
    end if;
    if new.kanal like 'dm:%' then
      if split_part(new.kanal, ':', 2) >= split_part(new.kanal, ':', 3) then raise exception 'Ugyldig samtale.' using errcode = 'P0001'; end if;
      if (select count(*) from public.ansatte where bedrift_id = new.bedrift_id
            and id::text in (split_part(new.kanal, ':', 2), split_part(new.kanal, ':', 3))) <> 2 then
        raise exception 'Ukjent mottaker.' using errcode = 'P0001';
      end if;
    end if;
  else
    -- bare teksten kan rettes
    new.bedrift_id := old.bedrift_id; new.ansatt_id := old.ansatt_id; new.kanal := old.kanal;
    new.opprettet := old.opprettet; new.bilde_sti := old.bilde_sti; new.endret := now();
  end if;
  return new;
end $$;
create trigger meldinger_vakt before insert or update on public.meldinger
  for each row execute function public.meldinger_vakt();

alter table public.meldinger enable row level security;
create policy meldinger_les on public.meldinger for select to authenticated
  using (bedrift_id = public.min_bedrift() and public.kan_se_kanal(kanal));
create policy meldinger_ny on public.meldinger for insert to authenticated
  with check (public.er_ansatt() and public.kan_se_kanal(kanal));
create policy meldinger_endre on public.meldinger for update to authenticated
  using (bedrift_id = public.min_bedrift() and ansatt_id = public.mitt_ansatt_id())
  with check (bedrift_id = public.min_bedrift());
create policy meldinger_slett on public.meldinger for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and kanal not like 'dm:%')));
revoke all on public.meldinger from anon;
grant select, insert, delete on public.meldinger to authenticated;
grant update (tekst) on public.meldinger to authenticated;

-- Sist lest per kanal (for uleste-merker)
create table public.kanal_lest (
  ansatt_id uuid not null references public.ansatte(id) on delete cascade,
  kanal     text not null,
  lest      timestamptz not null default now(),
  primary key (ansatt_id, kanal)
);
alter table public.kanal_lest enable row level security;
create policy kanal_lest_egen on public.kanal_lest for all to authenticated
  using (ansatt_id = public.mitt_ansatt_id()) with check (ansatt_id = public.mitt_ansatt_id());
revoke all on public.kanal_lest from anon;
grant select, insert, update, delete on public.kanal_lest to authenticated;

create or replace function public.marker_kanal_lest(k text) returns void
language sql security definer set search_path = public as $$
  insert into public.kanal_lest (ansatt_id, kanal, lest) values (public.mitt_ansatt_id(), k, now())
  on conflict (ansatt_id, kanal) do update set lest = now();
$$;
revoke all on function public.marker_kanal_lest(text) from public, anon;
grant execute on function public.marker_kanal_lest(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.meldinger;
  end if;
end $$;
