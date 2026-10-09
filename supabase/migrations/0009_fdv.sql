-- ByggLogg del 4: FDV-dokumentasjon i sluttdokumentasjonen.
-- Varer brukt på prosjektet hentes fra ordrelinjene i Visma. NOBB-nummeret gir lenke til FDV hos NOBB.
-- Egne FDV-dokumenter (PDF) kan lastes opp per prosjekt.

-- Vareregister: ett rad per varenummer i Visma. Leder kan rette NOBB-nr, legge inn egen FDV-lenke eller skjule varen.
create table public.varer (
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  varenr       text not null,
  beskrivelse  text not null default '',
  nobb_nr      text not null default '',     -- fra Visma (eller rettet av leder)
  ean          text not null default '',
  fdv_url      text not null default '',     -- egen lenke til FDV, går foran NOBB
  skjul        boolean not null default false, -- f.eks. arbeid, frakt, småvarer
  manuell      boolean not null default false, -- leder har rettet: hentingen fra Visma overskriver ikke nobb_nr
  oppdatert    timestamptz not null default now(),
  primary key (bedrift_id, varenr)
);

-- Varer brukt per prosjekt (summert fra ordrelinjene)
create table public.prosjekt_vare (
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid not null references public.prosjekter(id) on delete cascade,
  varenr       text not null,
  beskrivelse  text not null default '',
  antall       numeric(14,3) not null default 0,
  enhet        text not null default '',
  oppdatert    timestamptz not null default now(),
  primary key (prosjekt_id, varenr)
);
create index prosjekt_vare_bedrift on public.prosjekt_vare (bedrift_id);

-- Egne FDV-dokumenter per prosjekt
create table public.fdv_dok (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid not null references public.prosjekter(id) on delete cascade,
  ansatt_id    uuid not null references public.ansatte(id) on delete restrict,
  navn         text not null check (length(trim(navn)) > 0),
  sti          text not null,
  storrelse    integer,
  opprettet    timestamptz not null default now()
);
create index fdv_dok_prosjekt on public.fdv_dok (prosjekt_id);

create or replace function public.fdv_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.ansatt_id := public.mitt_ansatt_id();
    new.bedrift_id := public.min_bedrift();
  else
    new.ansatt_id := old.ansatt_id; new.bedrift_id := old.bedrift_id;
  end if;
  return new;
end $$;
create trigger fdv_vakt before insert or update on public.fdv_dok
  for each row execute function public.fdv_vakt();

-- Når leder retter en vare, merk den som manuell
create or replace function public.vare_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.bedrift_id := old.bedrift_id; new.varenr := old.varenr;
    new.manuell := true; new.oppdatert := now();
  end if;
  return new;
end $$;
create trigger vare_vakt before update on public.varer
  for each row execute function public.vare_vakt();

alter table public.varer enable row level security;
alter table public.prosjekt_vare enable row level security;
alter table public.fdv_dok enable row level security;

create policy varer_les on public.varer for select to authenticated using (bedrift_id = public.min_bedrift());
create policy varer_endre on public.varer for update to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
create policy prosjekt_vare_les on public.prosjekt_vare for select to authenticated using (bedrift_id = public.min_bedrift());

create policy fdv_les on public.fdv_dok for select to authenticated using (bedrift_id = public.min_bedrift());
create policy fdv_ny on public.fdv_dok for insert to authenticated with check (public.er_ansatt());
create policy fdv_slett on public.fdv_dok for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()));

revoke all on public.varer, public.prosjekt_vare, public.fdv_dok from anon;
grant select, update on public.varer to authenticated;
grant select on public.prosjekt_vare to authenticated;
grant select, insert, delete on public.fdv_dok to authenticated;

-- Lagring av dokumenter (PDF og bilder), mappe per bedrift
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('dokumenter', 'dokumenter', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;

    execute $p$ create policy "dokumenter les egen bedrift" on storage.objects for select to authenticated
      using (bucket_id = 'dokumenter' and (storage.foldername(name))[1] = public.min_bedrift()::text) $p$;
    execute $p$ create policy "dokumenter last opp egen bedrift" on storage.objects for insert to authenticated
      with check (bucket_id = 'dokumenter' and (storage.foldername(name))[1] = public.min_bedrift()::text and public.er_ansatt()) $p$;
    execute $p$ create policy "dokumenter slett egen bedrift" on storage.objects for delete to authenticated
      using (bucket_id = 'dokumenter' and (storage.foldername(name))[1] = public.min_bedrift()::text
        and (public.er_leder() or owner_id = auth.uid()::text)) $p$;
  end if;
end $$;
