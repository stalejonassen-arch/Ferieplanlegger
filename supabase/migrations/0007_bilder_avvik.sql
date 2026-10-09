-- ByggLogg del 2: bilder på prosjekter og avviksbehandling (avvik, RUH, skade).
-- Bildene ligger i en privat lagringsbøtte; filstien starter med bedrift-id, så hver bedrift ser bare sine egne.

-- ---------------------------------------------------------------------------
-- Avvik
-- ---------------------------------------------------------------------------
create table public.avvik (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  prosjekt_id   uuid references public.prosjekter(id) on delete set null,
  meldt_av      uuid not null references public.ansatte(id) on delete restrict,
  type          text not null default 'avvik' check (type in ('avvik', 'ruh', 'skade', 'forbedring')),
  tittel        text not null check (length(trim(tittel)) > 0),
  beskrivelse   text not null default '',
  ansvarlig_id  uuid references public.ansatte(id) on delete set null,
  frist         date,
  status        text not null default 'apen' check (status in ('apen', 'under_arbeid', 'lukket')),
  tiltak        text not null default '',
  lukket_av     uuid references public.ansatte(id) on delete set null,
  lukket_tid    timestamptz,
  opprettet     timestamptz not null default now()
);
create index avvik_prosjekt on public.avvik (prosjekt_id);
create index avvik_status on public.avvik (bedrift_id, status);

-- Den som melder kan rette tittel/beskrivelse mens avviket er åpent; leder eller ansvarlig behandler
create or replace function public.avvik_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  leder boolean := public.er_leder();
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := (select bedrift_id from public.ansatte where id = meg);
    new.meldt_av := meg;
    if not leder then
      new.status := 'apen'; new.ansvarlig_id := null; new.frist := null; new.tiltak := '';
    end if;
  else
    new.bedrift_id := old.bedrift_id;
    new.meldt_av := old.meldt_av;
    if not leder then
      if meg is distinct from old.ansvarlig_id then
        -- Melder: kan bare endre tekst mens avviket er åpent
        if old.status <> 'apen' then raise exception 'Avviket er under behandling og kan ikke endres.' using errcode = 'P0001'; end if;
        new.status := old.status; new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist; new.tiltak := old.tiltak;
      else
        -- Ansvarlig: kan skrive tiltak og endre status, men ikke flytte ansvar eller frist
        new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist;
      end if;
    end if;
  end if;
  if new.status = 'lukket' and (tg_op = 'INSERT' or old.status <> 'lukket') then
    new.lukket_av := meg; new.lukket_tid := now();
  elsif new.status <> 'lukket' then
    new.lukket_av := null; new.lukket_tid := null;
  end if;
  return new;
end $$;
create trigger avvik_vakt before insert or update on public.avvik
  for each row execute function public.avvik_vakt();

-- ---------------------------------------------------------------------------
-- Bilder (på prosjekt og/eller avvik)
-- ---------------------------------------------------------------------------
create table public.bilder (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid references public.prosjekter(id) on delete cascade,
  avvik_id     uuid references public.avvik(id) on delete cascade,
  ansatt_id    uuid not null references public.ansatte(id) on delete restrict,
  sti          text not null unique,          -- sti i lagringsbøtta «bilder»
  tekst        text not null default '',
  opprettet    timestamptz not null default now(),
  check (prosjekt_id is not null or avvik_id is not null)
);
create index bilder_prosjekt on public.bilder (prosjekt_id);
create index bilder_avvik on public.bilder (avvik_id);

create or replace function public.bilde_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.ansatt_id := public.mitt_ansatt_id();
  new.bedrift_id := public.min_bedrift();
  if split_part(new.sti, '/', 1) <> new.bedrift_id::text then
    raise exception 'Ugyldig filsti.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bilde_vakt before insert on public.bilder
  for each row execute function public.bilde_vakt();

-- ---------------------------------------------------------------------------
-- Tilgang
-- ---------------------------------------------------------------------------
alter table public.avvik  enable row level security;
alter table public.bilder enable row level security;

-- Alle ansatte i bedriften ser avvik (åpenhet om HMS), alle kan melde
create policy avvik_les on public.avvik for select to authenticated using (bedrift_id = public.min_bedrift());
create policy avvik_ny on public.avvik for insert to authenticated with check (public.er_ansatt());
create policy avvik_endre on public.avvik for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or meldt_av = public.mitt_ansatt_id() or ansvarlig_id = public.mitt_ansatt_id()))
  with check (bedrift_id = public.min_bedrift());
create policy avvik_slett on public.avvik for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());

create policy bilder_les on public.bilder for select to authenticated using (bedrift_id = public.min_bedrift());
create policy bilder_ny on public.bilder for insert to authenticated with check (public.er_ansatt());
create policy bilder_slett on public.bilder for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()));

revoke all on public.avvik, public.bilder from anon;
grant select, insert, update, delete on public.avvik, public.bilder to authenticated;

-- ---------------------------------------------------------------------------
-- Lagring: privat bøtte, mappe per bedrift
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('bilder', 'bilder', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;

    execute $p$ create policy "bilder les egen bedrift" on storage.objects for select to authenticated
      using (bucket_id = 'bilder' and (storage.foldername(name))[1] = public.min_bedrift()::text) $p$;
    execute $p$ create policy "bilder last opp egen bedrift" on storage.objects for insert to authenticated
      with check (bucket_id = 'bilder' and (storage.foldername(name))[1] = public.min_bedrift()::text and public.er_ansatt()) $p$;
    execute $p$ create policy "bilder slett egen bedrift" on storage.objects for delete to authenticated
      using (bucket_id = 'bilder' and (storage.foldername(name))[1] = public.min_bedrift()::text
        and (public.er_leder() or owner_id = auth.uid()::text)) $p$;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.avvik, public.bilder;
  end if;
end $$;
