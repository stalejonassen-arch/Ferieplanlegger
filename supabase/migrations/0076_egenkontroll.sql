-- Egenkontroll for sentral godkjenning (byggesaksforskriften kap. 10 og 14):
--  * Bedriftens egne sjekklistemaler med dokumentnummer og revisjon. Revisjonen øker når malen endres,
--    og sjekklisten husker hvilken revisjon den ble laget fra.
--  * Kontrollplan på prosjektet: leder eller prosjektleder planlegger hvilke kontroller som skal gjøres,
--    hvem som har ansvaret og når de skal være ferdige (sjekklister med status «planlagt»).
--  * Punkter kan ha en måling (verdi og enhet), og hvem som svarte og når.
--  * Svar «avvik» blir automatisk et avvik i avviksregisteret, koblet til sjekklisten og punktet,
--    slik at det følges opp og lukkes.
--  * Kontrollert av faglig leder: en signert sjekkliste kontrolleres og godkjennes av faglig leder
--    (eller leder/prosjektleder). Den kan ikke godkjennes før alle avvik fra den er lukket.

-- ---------------------------------------------------------------------------
-- Faglig leder
-- ---------------------------------------------------------------------------
alter table public.ansatte add column if not exists faglig_leder boolean not null default false;

create or replace function public.er_kontrollor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.er_planlegger() or exists (
    select 1 from public.ansatte
    where aktiv and faglig_leder and epost is not null
      and lower(epost) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;
revoke execute on function public.er_kontrollor() from anon, public;
grant execute on function public.er_kontrollor() to authenticated;

-- ---------------------------------------------------------------------------
-- Egne maler
-- ---------------------------------------------------------------------------
create table if not exists public.sjekkliste_maler (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  navn        text not null check (length(trim(navn)) between 1 and 200),
  kategori    text not null default '' check (length(kategori) <= 100),
  dok_nr      text not null default '' check (length(dok_nr) <= 40),
  beskrivelse text not null default '' check (length(beskrivelse) <= 2000),
  punkter     jsonb not null default '[]'::jsonb check (jsonb_typeof(punkter) = 'array' and jsonb_array_length(punkter) <= 200),
  revisjon    integer not null default 1,
  aktiv       boolean not null default true,
  endret      timestamptz not null default now(),
  endret_av   uuid references public.ansatte(id) on delete set null
);
create index if not exists sjekkliste_maler_bedrift on public.sjekkliste_maler (bedrift_id, navn);

create or replace function public.sjekkliste_mal_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.revisjon := 1;
  else
    new.bedrift_id := old.bedrift_id;
    new.revisjon := old.revisjon;
    if new.punkter is distinct from old.punkter or new.navn is distinct from old.navn then
      new.revisjon := old.revisjon + 1;
    end if;
  end if;
  new.endret := now();
  new.endret_av := public.mitt_ansatt_id();
  return new;
end $$;
drop trigger if exists sjekkliste_mal_vakt on public.sjekkliste_maler;
create trigger sjekkliste_mal_vakt before insert or update on public.sjekkliste_maler
  for each row execute function public.sjekkliste_mal_vakt();

alter table public.sjekkliste_maler enable row level security;
drop policy if exists sjekkliste_maler_les on public.sjekkliste_maler;
create policy sjekkliste_maler_les on public.sjekkliste_maler for select to authenticated using (bedrift_id = public.min_bedrift());
drop policy if exists sjekkliste_maler_ny on public.sjekkliste_maler;
create policy sjekkliste_maler_ny on public.sjekkliste_maler for insert to authenticated with check (public.er_kontrollor());
drop policy if exists sjekkliste_maler_endre on public.sjekkliste_maler;
create policy sjekkliste_maler_endre on public.sjekkliste_maler for update to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_kontrollor()) with check (bedrift_id = public.min_bedrift());
drop policy if exists sjekkliste_maler_slett on public.sjekkliste_maler;
create policy sjekkliste_maler_slett on public.sjekkliste_maler for delete to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_kontrollor());
grant select, insert, update, delete on public.sjekkliste_maler to authenticated;

-- ---------------------------------------------------------------------------
-- Sjekklister: kontrollplan, revisjon og godkjenning
-- ---------------------------------------------------------------------------
alter table public.sjekklister drop constraint if exists sjekklister_status_check;
alter table public.sjekklister add constraint sjekklister_status_check check (status in ('planlagt', 'pagaar', 'signert'));
alter table public.sjekklister add column if not exists ansvarlig_id uuid references public.ansatte(id) on delete set null;
alter table public.sjekklister add column if not exists frist date;
alter table public.sjekklister add column if not exists dok_nr text not null default '';
alter table public.sjekklister add column if not exists revisjon integer;
alter table public.sjekklister add column if not exists godkjent_av uuid references public.ansatte(id) on delete set null;
alter table public.sjekklister add column if not exists godkjent_tid timestamptz;

-- Avvik kan komme fra et punkt i en sjekkliste
alter table public.avvik add column if not exists sjekkliste_id uuid references public.sjekklister(id) on delete set null;
alter table public.avvik add column if not exists sjekkliste_punkt smallint;
create index if not exists avvik_sjekkliste on public.avvik (sjekkliste_id) where sjekkliste_id is not null;

create or replace function public.sjekkliste_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  planlegger boolean := public.er_planlegger();
  kontrollor boolean := public.er_kontrollor();
  p jsonb; gml jsonb; i int; ut jsonb := '[]'::jsonb; avvik_id uuid; endret_svar boolean := false;
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.opprettet_av := meg;
    new.opprettet := now();
    new.status := case when new.status = 'planlagt' and planlegger then 'planlagt' else 'pagaar' end;
    if not planlegger then new.ansvarlig_id := coalesce(new.ansvarlig_id, meg); end if;
    new.signert_av := null; new.signert_tid := null; new.godkjent_av := null; new.godkjent_tid := null;
  else
    new.bedrift_id := old.bedrift_id; new.opprettet_av := old.opprettet_av; new.opprettet := old.opprettet;
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then new.prosjekt_id := old.prosjekt_id; end if;
    if old.status = 'signert' and not kontrollor then
      raise exception 'Sjekklisten er signert. Be leder, prosjektleder eller faglig leder åpne den igjen.' using errcode = 'P0001';
    end if;
    if not planlegger then new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist; end if;
  end if;

  -- Hvem svarte og når, og avvik til avviksregisteret
  for p, i in select x, n - 1 from jsonb_array_elements(new.punkter) with ordinality as t(x, n) loop
    gml := case when tg_op = 'UPDATE' then old.punkter -> i else null end;
    if coalesce(p ->> 'svar', '') is distinct from coalesce(gml ->> 'svar', '')
       or coalesce(p ->> 'verdi', '') is distinct from coalesce(gml ->> 'verdi', '') then
      if coalesce(p ->> 'svar', '') <> '' or coalesce(p ->> 'verdi', '') <> '' then
        p := p || jsonb_build_object('av', meg, 'tid', now());
        endret_svar := true;
      end if;
    end if;
    if p ->> 'svar' = 'avvik' and coalesce(p ->> 'avvik_id', '') = '' and meg is not null
       and (tg_op = 'INSERT' or old.status <> 'signert') then
      insert into public.avvik (prosjekt_id, type, tittel, beskrivelse, sjekkliste_id, sjekkliste_punkt)
      values (new.prosjekt_id, 'avvik', left('Egenkontroll – ' || new.navn || ': ' || coalesce(p ->> 'tekst', ''), 200),
              coalesce(nullif(trim(p ->> 'kommentar'), ''), 'Avvik registrert i sjekklisten.'), new.id, i)
      returning id into avvik_id;
      p := p || jsonb_build_object('avvik_id', avvik_id);
    end if;
    ut := ut || jsonb_build_array(p);
  end loop;
  new.punkter := ut;

  -- Planlagt kontroll blir påbegynt når noen svarer
  if new.status = 'planlagt' and endret_svar then new.status := 'pagaar'; end if;
  if new.status = 'planlagt' and not planlegger and tg_op = 'UPDATE' and old.status <> 'planlagt' then new.status := old.status; end if;

  if new.status = 'signert' and (tg_op = 'INSERT' or old.status <> 'signert') then
    for p in select * from jsonb_array_elements(new.punkter) loop
      if coalesce(p ->> 'svar', '') not in ('ok', 'avvik', 'na') then
        raise exception 'Alle punktene må besvares før sjekklisten kan signeres.' using errcode = 'P0001';
      end if;
    end loop;
    new.signert_av := meg;
    new.signert_tid := now();
  elsif new.status <> 'signert' then
    new.signert_av := null; new.signert_tid := null;
  elsif tg_op = 'UPDATE' then
    new.signert_av := old.signert_av; new.signert_tid := old.signert_tid;
  end if;

  -- Kontroll og godkjenning (faglig leder)
  if new.status <> 'signert' or tg_op = 'INSERT' then
    new.godkjent_av := null; new.godkjent_tid := null;
  elsif new.godkjent_av is not null and old.godkjent_av is null then
    if not kontrollor then
      raise exception 'Bare faglig leder, leder eller prosjektleder kan godkjenne egenkontrollen.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.avvik a where a.sjekkliste_id = new.id and a.status <> 'lukket') then
      raise exception 'Alle avvik fra sjekklisten må være lukket før den kan godkjennes.' using errcode = 'P0001';
    end if;
    new.godkjent_av := meg; new.godkjent_tid := now();
  elsif new.godkjent_av is null and old.godkjent_av is not null then
    if not kontrollor then new.godkjent_av := old.godkjent_av; new.godkjent_tid := old.godkjent_tid;
    else new.godkjent_tid := null; end if;
  else
    new.godkjent_av := old.godkjent_av; new.godkjent_tid := old.godkjent_tid;
  end if;

  new.endret := now();
  if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
    raise exception 'Ukjent prosjekt.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Avvik må kunne lages før sjekklisten finnes (ved insert): utsett fremmednøkkelen til slutten av transaksjonen
alter table public.avvik drop constraint if exists avvik_sjekkliste_id_fkey;
alter table public.avvik add constraint avvik_sjekkliste_id_fkey foreign key (sjekkliste_id)
  references public.sjekklister(id) on delete set null deferrable initially deferred;

-- Sletting: planlagte kontroller kan slettes av planlegger; ellers som før
drop policy if exists sjekklister_slett on public.sjekklister;
create policy sjekklister_slett on public.sjekklister for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_planlegger() or (opprettet_av = public.mitt_ansatt_id() and status = 'pagaar' and godkjent_av is null)));

-- Faglig leder settes av leder (som andre roller i ansattregisteret)
create or replace function public.faglig_leder_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.faglig_leder is distinct from old.faglig_leder and not public.er_leder() then
    new.faglig_leder := old.faglig_leder;
  end if;
  return new;
end $$;
drop trigger if exists faglig_leder_vakt on public.ansatte;
create trigger faglig_leder_vakt before update of faglig_leder on public.ansatte
  for each row execute function public.faglig_leder_vakt();
