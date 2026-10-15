-- Slå sammen to prosjekter som egentlig er samme jobb (samme kunde og sted).
-- Alt på prosjektet som slås inn (timer, stempling, dagbok, bilder, avvik, tillegg, dokumenter, chat …)
-- flyttes til prosjektet som beholdes, og opplysninger som bare finnes på det ene tas med.
--  * Laget i appen: prosjektet slettes etterpå.
--  * Fra Visma: prosjektet blir liggende skjult (slatt_sammen_med), fordi Visma-hentingen ellers lager det på nytt.
--    Hentingen fører da ordre, varer og fakturerte timer fra Visma-prosjektet over på prosjektet som beholdes.

alter table public.prosjekter
  add column if not exists slatt_sammen_med uuid references public.prosjekter(id) on delete set null;
create index if not exists prosjekter_slatt_sammen on public.prosjekter (slatt_sammen_med) where slatt_sammen_med is not null;

-- Et sammenslått prosjekt forblir skjult og inaktivt, også når Visma-hentingen oppdaterer det
create or replace function public.prosjekt_sammenslatt_vakt() returns trigger
language plpgsql as $$
begin
  if old.slatt_sammen_med is not null then
    if current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' or new.slatt_sammen_med is null then
      new.slatt_sammen_med := old.slatt_sammen_med;
    end if;
    new.aktiv := false;
  elsif new.slatt_sammen_med is not null and current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' then
    new.slatt_sammen_med := null;
  end if;
  return new;
end $$;
drop trigger if exists prosjekt_sammenslatt_vakt on public.prosjekter;
create trigger prosjekt_sammenslatt_vakt before update on public.prosjekter
  for each row execute function public.prosjekt_sammenslatt_vakt();

create or replace function public.slaa_sammen_prosjekter(fra uuid, til uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  a public.prosjekter;
  b public.prosjekter;
  r record;
  n integer := 0;
  m integer;
begin
  if not public.er_leder() then raise exception 'Bare leder kan slå sammen prosjekter.' using errcode = 'P0001'; end if;
  select * into a from public.prosjekter where id = fra and bedrift_id = public.min_bedrift() for update;
  select * into b from public.prosjekter where id = til and bedrift_id = public.min_bedrift() for update;
  if a.id is null or b.id is null then raise exception 'Fant ikke prosjektet.' using errcode = 'P0001'; end if;
  if a.id = b.id then raise exception 'Velg et annet prosjekt.' using errcode = 'P0001'; end if;
  if a.slatt_sammen_med is not null or b.slatt_sammen_med is not null then
    raise exception 'Prosjektet er allerede slått sammen med et annet.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ansatte where utstyr_prosjekt_id in (fra, til)) then
    raise exception 'Utstyrskontoer kan ikke slås sammen med andre prosjekter.' using errcode = 'P0001';
  end if;

  perform set_config('bygglogg.flytt_prosjekt', '1', true);

  -- Produkter som står på begge: behold det som står på prosjektet som beholdes
  delete from public.prosjekt_vare v where v.prosjekt_id = fra
    and exists (select 1 from public.prosjekt_vare w where w.prosjekt_id = til and w.varenr = v.varenr);

  -- Alt som peker på prosjektet flyttes (finner tabellene selv, så nye tabeller kommer med).
  -- Prosjekter som tidligere er slått inn i «fra» peker etterpå på «til».
  for r in
    select c.conrelid::regclass as tabell, att.attname as kolonne
    from pg_constraint c
    join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.prosjekter'::regclass and array_length(c.conkey, 1) = 1
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tabell, r.kolonne, r.kolonne) using til, fra;
    get diagnostics m = row_count;
    n := n + m;
  end loop;

  -- Chat-tråden og hvem som har lest den
  update public.meldinger set kanal = 'p:' || til where kanal = 'p:' || fra;
  get diagnostics m = row_count;
  n := n + m;
  insert into public.kanal_lest (ansatt_id, kanal, lest)
    select ansatt_id, 'p:' || til, lest from public.kanal_lest where kanal = 'p:' || fra
  on conflict (ansatt_id, kanal) do update set lest = greatest(public.kanal_lest.lest, excluded.lest);
  delete from public.kanal_lest where kanal = 'p:' || fra;

  -- Opplysninger som bare er fylt ut på prosjektet som slås inn (adresse, kunde, estimat, notat, eiendom …) tas med
  for r in
    select column_name, data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'prosjekter' and data_type <> 'boolean'
      and column_name not in ('id', 'bedrift_id', 'visma_nr', 'navn', 'oppdatert', 'slatt_sammen_med')
  loop
    if r.data_type = 'text' then
      execute format('update public.prosjekter t set %1$I = s.%1$I from public.prosjekter s where t.id = $1 and s.id = $2 and coalesce(t.%1$I, '''') = '''' and coalesce(s.%1$I, '''') <> ''''', r.column_name) using til, fra;
    else
      execute format('update public.prosjekter t set %1$I = s.%1$I from public.prosjekter s where t.id = $1 and s.id = $2 and t.%1$I is null and s.%1$I is not null', r.column_name) using til, fra;
    end if;
  end loop;

  -- Er det ene prosjektet fortsatt i gang, er det sammenslåtte det også
  if a.aktiv and not b.aktiv then update public.prosjekter set aktiv = true where id = til; end if;

  if a.visma_nr is null then
    delete from public.prosjekter where id = fra;
  else
    update public.prosjekter set slatt_sammen_med = til, aktiv = false where id = fra;
  end if;
  perform set_config('bygglogg.flytt_prosjekt', '0', true);
  return n;
end $$;
revoke all on function public.slaa_sammen_prosjekter(uuid, uuid) from public, anon;
grant execute on function public.slaa_sammen_prosjekter(uuid, uuid) to authenticated;

-- Den gamle «koble til Visma-prosjekt» bruker samme sammenslåing
create or replace function public.koble_prosjekt(fra uuid, til uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  a public.prosjekter;
  b public.prosjekter;
begin
  if not public.er_leder() then raise exception 'Bare leder kan koble prosjekter.' using errcode = 'P0001'; end if;
  select * into a from public.prosjekter where id = fra and bedrift_id = public.min_bedrift();
  select * into b from public.prosjekter where id = til and bedrift_id = public.min_bedrift();
  if a.id is null or b.id is null then raise exception 'Fant ikke prosjektet.' using errcode = 'P0001'; end if;
  if a.visma_nr is not null then raise exception 'Prosjektet kommer allerede fra Visma.' using errcode = 'P0001'; end if;
  if b.visma_nr is null then raise exception 'Velg et prosjekt som kommer fra Visma.' using errcode = 'P0001'; end if;
  return public.slaa_sammen_prosjekter(fra, til);
end $$;
