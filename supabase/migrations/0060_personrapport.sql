-- Personlig månedsrapport per ansatt, og dekningsgrad (DG) på salg av vinduer og takplater.
--
-- Salget hentes fra ordrelinjene i Visma (visma-sync) og sorteres etter teksten på linjen,
-- så også linjer på «Diverse»-varenummer kommer med. Reglene (ord som skal med / ikke med)
-- ligger på bedriften og kan endres av leder.

alter table public.bedrifter add column if not exists dg_kategorier jsonb not null default '[
  {"id": "vinduer", "navn": "Vinduer",
   "med":  ["vindu", "nordan", "natre", "h-karmen", "takv mh", "skyvedør"],
   "uten": ["base", "kitt", "pensel", "holder", "vindusvr", "vrider", "deponer", "maling", "frakt", "beslag", "lås", "sålbenk", "rullesett"]},
  {"id": "tak", "navn": "Takplater",
   "med":  ["takpl", "takplate", "takpakke", "powertekk", "takpanne", "takshingel", "takstein", "plannja", "tata steel", "tata click", "tata takpl", "decra", "ruukki", "falstak", "click fals"],
   "uten": ["glava", "flexi", "takrenne", "taklist", "undertak", "takstol", "sponpl", "takv", "spiker", "skrue", "huntonit", "trefib", "kraning"]}
]'::jsonb;

create or replace function public.lagre_dg_kategorier(k jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre dette.' using errcode = 'P0001'; end if;
  if jsonb_typeof(k) <> 'array' or jsonb_array_length(k) > 10 or exists (
    select 1 from jsonb_array_elements(k) x
     where coalesce(x->>'id', '') !~ '^[a-z]{2,20}$' or length(coalesce(x->>'navn', '')) not between 1 and 40
        or jsonb_typeof(x->'med') <> 'array' or jsonb_typeof(x->'uten') <> 'array'
        or jsonb_array_length(x->'med') > 60 or jsonb_array_length(x->'uten') > 60) then
    raise exception 'Ugyldige kategorier.' using errcode = 'P0001';
  end if;
  update public.bedrifter set dg_kategorier = k where id = public.min_bedrift();
  -- Tallene beregnes på nytt ved neste synk fra Visma
  delete from public.salg_kategori_mnd where bedrift_id = public.min_bedrift();
end $$;

-- Salg per kategori og måned (fakturert beløp og dekningsbidrag fra Visma). Skrives av visma-sync.
create table if not exists public.salg_kategori_mnd (
  bedrift_id  smallint not null references public.bedrifter(id),
  aar         smallint not null,
  mnd         smallint not null check (mnd between 1 and 12),
  kategori    text not null,
  omsetning   numeric(14,2) not null default 0,
  db          numeric(14,2) not null default 0,
  linjer      integer not null default 0,
  -- De største linjene, så leder kan se hva som er tatt med: [{"tekst": "...", "omsetning": 123, "db": 45}]
  eksempler   jsonb not null default '[]',
  oppdatert   timestamptz not null default now(),
  primary key (bedrift_id, aar, mnd, kategori)
);
alter table public.salg_kategori_mnd enable row level security;
drop policy if exists salg_kategori_les on public.salg_kategori_mnd;
create policy salg_kategori_les on public.salg_kategori_mnd for select to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_planlegger());
revoke all on public.salg_kategori_mnd from anon;
grant select on public.salg_kategori_mnd to authenticated;
revoke execute on function public.lagre_dg_kategorier(jsonb) from public, anon;
grant execute on function public.lagre_dg_kategorier(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Personlige månedsrapporter. Leder lager dem (tallene fryses i innhold), publiserer,
-- og hver ansatt ser bare sin egen. Push til den ansatte når den publiseres.
-- ---------------------------------------------------------------------------
create table if not exists public.personrapporter (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  periode     date not null check (extract(day from periode) = 1),
  innhold     jsonb not null default '{}',
  kommentar   text not null default '' check (length(kommentar) <= 4000),
  publisert   timestamptz,
  lest        timestamptz,
  opprettet   timestamptz not null default now(),
  unique (ansatt_id, periode)
);
create index if not exists personrapporter_periode on public.personrapporter (bedrift_id, periode desc);
alter table public.personrapporter enable row level security;

create or replace function public.personrapport_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := coalesce(public.min_bedrift(), new.bedrift_id);
    new.lest := null;
    if not exists (select 1 from public.ansatte where id = new.ansatt_id and bedrift_id = new.bedrift_id) then
      raise exception 'Fant ikke den ansatte.' using errcode = 'P0001';
    end if;
  else
    new.bedrift_id := old.bedrift_id; new.ansatt_id := old.ansatt_id; new.periode := old.periode;
    -- Publisert rapport blir ikke utkast igjen; lest settes bare via marker_personrapport_lest
    if old.publisert is not null then new.publisert := old.publisert; end if;
    if current_setting('bygglogg.lest', true) is distinct from '1' then new.lest := old.lest; end if;
  end if;
  return new;
end $$;
drop trigger if exists personrapport_vakt on public.personrapporter;
create trigger personrapport_vakt before insert or update on public.personrapporter
  for each row execute function public.personrapport_vakt();

drop policy if exists personrapport_les on public.personrapporter;
create policy personrapport_les on public.personrapporter for select to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or (ansatt_id = public.mitt_ansatt_id() and publisert is not null)));
drop policy if exists personrapport_ny on public.personrapporter;
create policy personrapport_ny on public.personrapporter for insert to authenticated with check (public.er_leder());
drop policy if exists personrapport_endre on public.personrapporter;
create policy personrapport_endre on public.personrapporter for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder()) with check (public.er_leder());
drop policy if exists personrapport_slett on public.personrapporter;
create policy personrapport_slett on public.personrapporter for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.personrapporter from anon;
grant select, insert, update, delete on public.personrapporter to authenticated;

create or replace function public.marker_personrapport_lest(r uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('bygglogg.lest', '1', true);
  update public.personrapporter set lest = coalesce(lest, now())
   where id = r and ansatt_id = public.mitt_ansatt_id() and publisert is not null;
  perform set_config('bygglogg.lest', '0', true);
end $$;
revoke all on function public.marker_personrapport_lest(uuid) from public, anon;
grant execute on function public.marker_personrapport_lest(uuid) to authenticated;

-- Push til den ansatte når rapporten publiseres
create or replace function public.personrapport_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if u is not null and new.publisert is not null and (tg_op = 'INSERT' or old.publisert is null)
     and exists (select 1 from pg_namespace where nspname = 'net') then
    perform net.http_post(
      url := u || '/push',
      body := jsonb_build_object('type', 'personrapport', 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;
drop trigger if exists personrapport_push on public.personrapporter;
create trigger personrapport_push after insert or update on public.personrapporter
  for each row execute function public.personrapport_push();
