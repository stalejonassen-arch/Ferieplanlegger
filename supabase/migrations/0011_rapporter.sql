-- ByggLogg: månedsrapporter til de ansatte. Leder publiserer, alle får e-post, leder ser hvem som har lest.

create table public.rapporter (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  tittel        text not null check (length(trim(tittel)) > 0),
  periode       date not null,                 -- første dag i måneden rapporten gjelder
  ingress       text not null default '',      -- kort tekst som står i e-posten og i appen
  lenke         text not null default '' check (lenke = '' or lenke ~ '^https://'),
  sti           text not null default '',      -- PDF i lagringen «dokumenter»
  publisert     timestamptz,                   -- null = utkast, bare leder ser den
  opprettet_av  uuid references public.ansatte(id) on delete set null,
  opprettet     timestamptz not null default now(),
  check (lenke <> '' or sti <> '')
);
create index rapporter_periode on public.rapporter (bedrift_id, periode desc);

create table public.rapport_lest (
  rapport_id  uuid not null references public.rapporter(id) on delete cascade,
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  lest        timestamptz not null default now(),
  primary key (rapport_id, ansatt_id)
);

create table public.rapport_varsel_logg (
  rapport_id  uuid primary key references public.rapporter(id) on delete cascade,
  sendt       timestamptz not null default now(),
  antall      integer not null default 0
);

create or replace function public.rapport_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.opprettet_av := coalesce(public.mitt_ansatt_id(), new.opprettet_av);
    new.bedrift_id := coalesce(public.min_bedrift(), new.bedrift_id);
  else
    new.opprettet_av := old.opprettet_av; new.bedrift_id := old.bedrift_id;
    -- En publisert rapport kan ikke gjøres om til utkast (varselet er alt sendt)
    if old.publisert is not null then new.publisert := old.publisert; end if;
  end if;
  return new;
end $$;
create trigger rapport_vakt before insert or update on public.rapporter
  for each row execute function public.rapport_vakt();

-- Send e-post til alle ansatte når rapporten publiseres
create or replace function public.rapport_varsel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.publisert is not null and (tg_op = 'INSERT' or old.publisert is null) then
    if exists (select 1 from pg_extension where extname = 'pg_net') then
      perform net.http_post(
        url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/varsle',
        body := jsonb_build_object('id', new.id, 'hendelse', 'rapport'),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  end if;
  return null;
end $$;
create trigger rapport_varsel after insert or update on public.rapporter
  for each row execute function public.rapport_varsel();

-- Ansatt markerer en rapport som lest (bare seg selv, bare publiserte rapporter i egen bedrift)
create or replace function public.marker_lest(rapport uuid) returns void
language plpgsql security definer set search_path = public as $$
declare meg uuid := public.mitt_ansatt_id();
begin
  if meg is null then raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.rapporter where id = rapport and publisert is not null and bedrift_id = public.min_bedrift()) then
    raise exception 'Rapporten finnes ikke.' using errcode = 'P0001';
  end if;
  insert into public.rapport_lest (rapport_id, ansatt_id) values (rapport, meg) on conflict do nothing;
end $$;
revoke all on function public.marker_lest(uuid) from public, anon;
grant execute on function public.marker_lest(uuid) to authenticated;

alter table public.rapporter enable row level security;
alter table public.rapport_lest enable row level security;
alter table public.rapport_varsel_logg enable row level security;

create policy rapporter_les on public.rapporter for select to authenticated
  using (bedrift_id = public.min_bedrift() and (publisert is not null or public.er_leder()));
create policy rapporter_ny on public.rapporter for insert to authenticated with check (public.er_leder());
create policy rapporter_endre on public.rapporter for update to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
create policy rapporter_slett on public.rapporter for delete to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift());

-- Leder ser alle lesinger i egen bedrift, ansatte bare sine egne
create policy rapport_lest_les on public.rapport_lest for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id()
    or (public.er_leder() and exists (select 1 from public.rapporter r where r.id = rapport_id and r.bedrift_id = public.min_bedrift())));

revoke all on public.rapporter, public.rapport_lest, public.rapport_varsel_logg from anon;
revoke all on public.rapport_varsel_logg from authenticated;
grant select, insert, update, delete on public.rapporter to authenticated;
grant select on public.rapport_lest to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rapporter, public.rapport_lest;
  end if;
end $$;
