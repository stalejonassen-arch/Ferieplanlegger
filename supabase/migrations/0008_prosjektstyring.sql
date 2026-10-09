-- ByggLogg del 3: fakturerbare timer, plan for prosjekt, dagbok og tilleggsarbeid med kundesignatur.

-- ---------------------------------------------------------------------------
-- Fakturerbare timer og plan
-- ---------------------------------------------------------------------------
alter table public.timer add column fakturerbar boolean not null default true;
update public.timer set fakturerbar = false where prosjekt_id is null;

-- Plan som leder setter i ByggLogg (hentingen fra Visma rører ikke disse)
alter table public.prosjekter add column planlagt_start date;
alter table public.prosjekter add column planlagt_slutt date;
alter table public.prosjekter add column notat text not null default '';

-- Mål for fakturerte timer per måned (allmøtet 2. okt 2026: 6 000 i året)
alter table public.bedrifter add column maal_fakturert_mnd numeric(6,1) not null default 500;

-- ---------------------------------------------------------------------------
-- Dagbok
-- ---------------------------------------------------------------------------
create table public.dagbok (
  id           uuid primary key default gen_random_uuid(),
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid not null references public.prosjekter(id) on delete cascade,
  ansatt_id    uuid not null references public.ansatte(id) on delete restrict,
  dato         date not null default current_date,
  vaer         text not null default '',
  tekst        text not null check (length(trim(tekst)) > 0),
  hindringer   text not null default '',
  opprettet    timestamptz not null default now()
);
create index dagbok_prosjekt on public.dagbok (prosjekt_id, dato desc);

-- ---------------------------------------------------------------------------
-- Tilleggsarbeid / endringsmeldinger
-- ---------------------------------------------------------------------------
create table public.tillegg (
  id             uuid primary key default gen_random_uuid(),
  bedrift_id     smallint not null default 1 references public.bedrifter(id),
  prosjekt_id    uuid not null references public.prosjekter(id) on delete cascade,
  opprettet_av   uuid not null references public.ansatte(id) on delete restrict,
  tittel         text not null check (length(trim(tittel)) > 0),
  beskrivelse    text not null default '',
  timer          numeric(6,1),
  materiell      text not null default '',
  pris           numeric(12,2),
  status         text not null default 'utkast' check (status in ('utkast', 'signert', 'avvist', 'fakturert')),
  signert_navn   text not null default '',
  signatur       text not null default '',   -- PNG som data-URL, tegnet av kunden på skjermen
  signert_tid    timestamptz,
  opprettet      timestamptz not null default now()
);
create index tillegg_prosjekt on public.tillegg (prosjekt_id);

alter table public.bilder add column dagbok_id uuid references public.dagbok(id) on delete cascade;
alter table public.bilder add column tillegg_id uuid references public.tillegg(id) on delete cascade;

-- Felles: sett bedrift og forfatter ut fra innlogget ansatt
create or replace function public.dagbok_vakt() returns trigger
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
create trigger dagbok_vakt before insert or update on public.dagbok
  for each row execute function public.dagbok_vakt();

-- Tillegg: signert er låst for alle unntatt leder; signatur krever navn og tegning
create or replace function public.tillegg_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.opprettet_av := public.mitt_ansatt_id();
    new.bedrift_id := public.min_bedrift();
    if not public.er_leder() and new.status not in ('utkast', 'signert') then new.status := 'utkast'; end if;
  else
    new.opprettet_av := old.opprettet_av; new.bedrift_id := old.bedrift_id;
    if not public.er_leder() then
      if old.status <> 'utkast' then
        raise exception 'Tilleggsarbeidet er signert og kan bare endres av leder.' using errcode = 'P0001';
      end if;
      if new.status not in ('utkast', 'signert') then new.status := old.status; end if;
    end if;
  end if;
  if new.status = 'signert' and (tg_op = 'INSERT' or old.status <> 'signert') then
    if length(trim(new.signert_navn)) = 0 or length(new.signatur) < 100 then
      raise exception 'Kunden må skrive navnet sitt og signere.' using errcode = 'P0001';
    end if;
    new.signert_tid := now();
  end if;
  return new;
end $$;
create trigger tillegg_vakt before insert or update on public.tillegg
  for each row execute function public.tillegg_vakt();

-- ---------------------------------------------------------------------------
-- Tilgang
-- ---------------------------------------------------------------------------
alter table public.dagbok  enable row level security;
alter table public.tillegg enable row level security;

create policy dagbok_les on public.dagbok for select to authenticated using (bedrift_id = public.min_bedrift());
create policy dagbok_ny on public.dagbok for insert to authenticated with check (public.er_ansatt());
create policy dagbok_endre on public.dagbok for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()))
  with check (bedrift_id = public.min_bedrift());
create policy dagbok_slett on public.dagbok for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()));

create policy tillegg_les on public.tillegg for select to authenticated using (bedrift_id = public.min_bedrift());
create policy tillegg_ny on public.tillegg for insert to authenticated with check (public.er_ansatt());
create policy tillegg_endre on public.tillegg for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
create policy tillegg_slett on public.tillegg for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or (opprettet_av = public.mitt_ansatt_id() and status = 'utkast')));

revoke all on public.dagbok, public.tillegg from anon;
grant select, insert, update, delete on public.dagbok, public.tillegg to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dagbok, public.tillegg;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ordrer fra Visma koblet til prosjekt (lønnsomhet). Bare leder ser tallene.
-- ---------------------------------------------------------------------------
create table public.prosjekt_ordre (
  bedrift_id      smallint not null default 1 references public.bedrifter(id),
  visma_ordrenr   integer not null,
  prosjekt_id     uuid references public.prosjekter(id) on delete cascade,
  ordredato       date,
  ordretype       smallint,
  transaksjonstype smallint,
  navn            text not null default '',
  sum_netto       numeric(14,2) not null default 0,
  kostnad         numeric(14,2) not null default 0,
  dekningsbidrag  numeric(14,2) not null default 0,
  fakturert       numeric(14,2) not null default 0,
  ferdig          date,
  oppdatert       timestamptz not null default now(),
  primary key (bedrift_id, visma_ordrenr)
);
create index prosjekt_ordre_prosjekt on public.prosjekt_ordre (prosjekt_id);
alter table public.prosjekt_ordre enable row level security;
create policy prosjekt_ordre_les on public.prosjekt_ordre for select to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift());
revoke all on public.prosjekt_ordre from anon;
grant select on public.prosjekt_ordre to authenticated;
