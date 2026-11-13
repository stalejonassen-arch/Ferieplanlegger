-- Befaring: tre typer i samme modul.
--  * «tilbud»      – befaring hos kunden før tilbud: mål, adkomst, underlag, ønsker, bilder. Kan bli et tilbud,
--                    og kobles til prosjektet når jobben er vunnet.
--  * «underveis»   – befaring på prosjektet mens jobben pågår (fremdrift, tillegg, kundens merknader).
--  * «overtakelse» – ferdigbefaring/overtakelse med kunden: mangler blir avvik på prosjektet, kunden signerer.
-- Punktene har svar (ok / avvik / ikke aktuelt), merknad og eventuelt mål. Bilder kobles til befaringen.

create table if not exists public.befaringer (
  id            uuid primary key default gen_random_uuid(),
  bedrift_id    smallint not null default 1 references public.bedrifter(id),
  type          text not null default 'tilbud' check (type in ('tilbud', 'underveis', 'overtakelse')),
  prosjekt_id   uuid references public.prosjekter(id) on delete set null,
  kunde_id      uuid references public.kunder(id) on delete set null,
  kunde_navn    text not null default '' check (length(kunde_navn) <= 200),
  telefon       text not null default '' check (length(telefon) <= 40),
  epost         text not null default '' check (length(epost) <= 200),
  adresse       text not null default '' check (length(adresse) <= 300),
  tittel        text not null check (length(trim(tittel)) between 1 and 200),
  dato          date not null default (now() at time zone 'Europe/Oslo')::date,
  deltakere     text not null default '' check (length(deltakere) <= 500),
  notat         text not null default '' check (length(notat) <= 10000),
  punkter       jsonb not null default '[]'::jsonb check (jsonb_typeof(punkter) = 'array' and jsonb_array_length(punkter) <= 200),
  status        text not null default 'apen' check (status in ('apen', 'ferdig')),
  utfort_av     uuid references public.ansatte(id) on delete set null,
  tilbud_id     uuid references public.tilbud(id) on delete set null,
  signert_navn  text not null default '' check (length(signert_navn) <= 200),
  signatur      text not null default '' check (length(signatur) <= 400000),
  signert_tid   timestamptz,
  opprettet     timestamptz not null default now(),
  endret        timestamptz not null default now()
);
create index if not exists befaringer_bedrift on public.befaringer (bedrift_id, dato desc);
create index if not exists befaringer_prosjekt on public.befaringer (prosjekt_id) where prosjekt_id is not null;

-- Avvik kan komme fra et punkt i en befaring (overtakelse/underveis på et prosjekt)
alter table public.avvik add column if not exists befaring_id uuid;
alter table public.avvik drop constraint if exists avvik_befaring_id_fkey;
alter table public.avvik add constraint avvik_befaring_id_fkey foreign key (befaring_id)
  references public.befaringer(id) on delete set null deferrable initially deferred;
create index if not exists avvik_befaring on public.avvik (befaring_id) where befaring_id is not null;

-- Bilder kan høre til en befaring (også før det finnes et prosjekt)
alter table public.bilder add column if not exists befaring_id uuid references public.befaringer(id) on delete cascade;
create index if not exists bilder_befaring on public.bilder (befaring_id) where befaring_id is not null;
alter table public.bilder drop constraint if exists bilder_check;
alter table public.bilder add constraint bilder_check check (prosjekt_id is not null or avvik_id is not null or befaring_id is not null);

create or replace function public.befaring_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  planlegger boolean := public.er_planlegger();
  p jsonb; i int; ut jsonb := '[]'::jsonb; avvik_id uuid;
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.utfort_av := meg;
    new.opprettet := now();
    new.signert_navn := ''; new.signatur := ''; new.signert_tid := null;
    new.status := 'apen';
  else
    new.bedrift_id := old.bedrift_id; new.opprettet := old.opprettet;
    if not planlegger and meg is distinct from old.utfort_av then
      raise exception 'Bare den som gjorde befaringen, leder eller prosjektleder kan endre den.' using errcode = 'P0001';
    end if;
    if old.status = 'ferdig' and old.signert_tid is not null and not planlegger then
      raise exception 'Befaringen er signert av kunden. Be leder eller prosjektleder åpne den igjen.' using errcode = 'P0001';
    end if;
    if not planlegger then new.utfort_av := old.utfort_av; end if;
  end if;

  if new.prosjekt_id is not null and not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  if new.kunde_id is not null and not exists (select 1 from public.kunder where id = new.kunde_id and bedrift_id = new.bedrift_id) then
    new.kunde_id := null;
  end if;
  if new.tilbud_id is not null and not exists (select 1 from public.tilbud where id = new.tilbud_id and bedrift_id = new.bedrift_id) then
    new.tilbud_id := null;
  end if;

  -- Kundens signatur: tidspunktet settes her, og en signatur kan bare fjernes av leder/prosjektleder
  if tg_op = 'UPDATE' and new.signatur = old.signatur and new.signert_navn = old.signert_navn then
    new.signert_tid := old.signert_tid;
  elsif new.signatur <> '' then
    if length(trim(new.signert_navn)) = 0 then raise exception 'Skriv kundens navn.' using errcode = 'P0001'; end if;
    new.signert_tid := now();
  elsif tg_op = 'UPDATE' and old.signatur <> '' and not planlegger then
    new.signatur := old.signatur; new.signert_navn := old.signert_navn; new.signert_tid := old.signert_tid;
  else
    new.signert_tid := null;
  end if;

  -- Punkt med svar «avvik» på et prosjekt blir et avvik i avviksregisteret
  for p, i in select x, n - 1 from jsonb_array_elements(new.punkter) with ordinality as t(x, n) loop
    if p ->> 'svar' = 'avvik' and coalesce(p ->> 'avvik_id', '') = '' and new.prosjekt_id is not null and meg is not null
       and new.type <> 'tilbud' then
      insert into public.avvik (prosjekt_id, type, tittel, beskrivelse, befaring_id)
      values (new.prosjekt_id, 'avvik',
              left((case new.type when 'overtakelse' then 'Overtakelse' else 'Befaring' end) || ' – ' || coalesce(p ->> 'tekst', ''), 200),
              coalesce(nullif(trim(p ->> 'merknad'), ''), 'Registrert på befaring ' || to_char(new.dato, 'DD.MM.YYYY') || '.'), new.id)
      returning id into avvik_id;
      p := p || jsonb_build_object('avvik_id', avvik_id);
    end if;
    ut := ut || jsonb_build_array(p);
  end loop;
  new.punkter := ut;

  new.endret := now();
  return new;
end $$;
drop trigger if exists befaring_vakt on public.befaringer;
create trigger befaring_vakt before insert or update on public.befaringer
  for each row execute function public.befaring_vakt();

alter table public.befaringer enable row level security;
drop policy if exists befaringer_les on public.befaringer;
create policy befaringer_les on public.befaringer for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists befaringer_ny on public.befaringer;
create policy befaringer_ny on public.befaringer for insert to authenticated with check (public.er_ansatt());
drop policy if exists befaringer_endre on public.befaringer;
create policy befaringer_endre on public.befaringer for update to authenticated
  using (bedrift_id = public.min_bedrift()) with check (bedrift_id = public.min_bedrift());
drop policy if exists befaringer_slett on public.befaringer;
create policy befaringer_slett on public.befaringer for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or (utfort_av = public.mitt_ansatt_id() and signert_tid is null)));
revoke all on public.befaringer from anon;
grant select, insert, update, delete on public.befaringer to authenticated;
