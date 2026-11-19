-- HMS: stoffkartotek (kjemikalier med sikkerhetsdatablad) og HMS-dokumenter (håndbok, rutiner) med lesebekreftelse.
-- Stoffkartotek er lovpålagt (stoffkartotekforskriften): alle ansatte skal kunne se det, og databladene skal være oppdaterte.

create table if not exists public.stoffer (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  navn          text not null check (length(navn) between 1 and 200),
  leverandor    text not null default '' check (length(leverandor) <= 200),
  nobb          text not null default '' check (length(nobb) <= 20),
  bruk          text not null default '' check (length(bruk) <= 500),
  plassering    text not null default '' check (length(plassering) <= 200),
  farer         text[] not null default '{}',
  verneutstyr   text not null default '' check (length(verneutstyr) <= 300),
  datablad_dato date,
  sti           text,
  filnavn       text not null default '',
  lenke         text not null default '' check (lenke = '' or lenke ~ '^https://'),
  aktiv         boolean not null default true,
  lagt_inn_av   uuid references public.ansatte(id) on delete set null,
  opprettet     timestamptz not null default now(),
  endret        timestamptz not null default now()
);
create index if not exists stoffer_bedrift on public.stoffer (bedrift_id, navn);

create or replace function public.stoffer_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.lagt_inn_av := public.mitt_ansatt_id();
    new.opprettet := now();
  else
    new.bedrift_id := old.bedrift_id; new.lagt_inn_av := old.lagt_inn_av; new.opprettet := old.opprettet;
  end if;
  new.endret := now();
  return new;
end $$;
drop trigger if exists stoffer_vakt on public.stoffer;
create trigger stoffer_vakt before insert or update on public.stoffer for each row execute function public.stoffer_vakt();

alter table public.stoffer enable row level security;
drop policy if exists stoffer_les on public.stoffer;
create policy stoffer_les on public.stoffer for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists stoffer_ny on public.stoffer;
create policy stoffer_ny on public.stoffer for insert to authenticated with check (public.er_ansatt());
drop policy if exists stoffer_endre on public.stoffer;
create policy stoffer_endre on public.stoffer for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or lagt_inn_av = public.mitt_ansatt_id()))
  with check (bedrift_id = public.min_bedrift());
drop policy if exists stoffer_slett on public.stoffer;
create policy stoffer_slett on public.stoffer for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or lagt_inn_av = public.mitt_ansatt_id()));
revoke all on public.stoffer from anon;
grant select, insert, update, delete on public.stoffer to authenticated;

-- HMS-dokumenter: leder legger inn, alle leser og kvitterer.
create table if not exists public.hms_dokumenter (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  tittel        text not null check (length(tittel) between 1 and 200),
  kategori      text not null default 'rutine' check (kategori in ('handbok', 'rutine', 'beredskap', 'risiko', 'kvalitet', 'annet')),
  versjon       text not null default '1' check (length(versjon) <= 20),
  gyldig_fra    date,
  revideres     date,
  beskrivelse   text not null default '' check (length(beskrivelse) <= 2000),
  sti           text,
  filnavn       text not null default '',
  lenke         text not null default '' check (lenke = '' or lenke ~ '^https://'),
  ma_leses      boolean not null default true,
  opprettet     timestamptz not null default now(),
  endret        timestamptz not null default now()
);
create index if not exists hms_dokumenter_bedrift on public.hms_dokumenter (bedrift_id, kategori);

create or replace function public.hms_dok_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.bedrift_id := public.min_bedrift(); new.opprettet := now();
  else
    new.bedrift_id := old.bedrift_id; new.opprettet := old.opprettet;
    -- Ny versjon: alle må lese den på nytt
    if new.versjon is distinct from old.versjon or new.sti is distinct from old.sti then
      delete from public.hms_lest where dokument_id = old.id;
    end if;
  end if;
  new.endret := now();
  return new;
end $$;

create table if not exists public.hms_lest (
  dokument_id uuid not null references public.hms_dokumenter(id) on delete cascade,
  ansatt_id   uuid not null default public.mitt_ansatt_id() references public.ansatte(id) on delete cascade,
  tid         timestamptz not null default now(),
  primary key (dokument_id, ansatt_id)
);
drop trigger if exists hms_dok_vakt on public.hms_dokumenter;
create trigger hms_dok_vakt before insert or update on public.hms_dokumenter for each row execute function public.hms_dok_vakt();

alter table public.hms_dokumenter enable row level security;
drop policy if exists hms_dok_les on public.hms_dokumenter;
create policy hms_dok_les on public.hms_dokumenter for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists hms_dok_ny on public.hms_dokumenter;
create policy hms_dok_ny on public.hms_dokumenter for insert to authenticated with check (public.er_leder());
drop policy if exists hms_dok_endre on public.hms_dokumenter;
create policy hms_dok_endre on public.hms_dokumenter for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder()) with check (bedrift_id = public.min_bedrift());
drop policy if exists hms_dok_slett on public.hms_dokumenter;
create policy hms_dok_slett on public.hms_dokumenter for delete to authenticated using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.hms_dokumenter from anon;
grant select, insert, update, delete on public.hms_dokumenter to authenticated;

alter table public.hms_lest enable row level security;
drop policy if exists hms_lest_les on public.hms_lest;
create policy hms_lest_les on public.hms_lest for select to authenticated
  using (exists (select 1 from public.hms_dokumenter d where d.id = dokument_id and d.bedrift_id = public.min_bedrift()));
drop policy if exists hms_lest_ny on public.hms_lest;
create policy hms_lest_ny on public.hms_lest for insert to authenticated
  with check (ansatt_id = public.mitt_ansatt_id()
    and exists (select 1 from public.hms_dokumenter d where d.id = dokument_id and d.bedrift_id = public.min_bedrift()));
revoke all on public.hms_lest from anon;
grant select, insert on public.hms_lest to authenticated;
