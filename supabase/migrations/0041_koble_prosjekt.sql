-- Koble et prosjekt som er laget i appen til prosjektet fra Visma når det dukker opp der.
-- Alt som hører til app-prosjektet (timer, stempling, dagbok, bilder, avvik, tillegg, rapporter, FDV, chat …)
-- flyttes til Visma-prosjektet, opplysninger som bare finnes i app-prosjektet tas med, og app-prosjektet slettes.

-- Chat-meldinger kan ellers bare få endret teksten. Under sammenslåing flyttes bare kanalen.
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
  elsif current_setting('bygglogg.flytt_prosjekt', true) = '1' then
    -- sammenslåing av prosjekter: bare kanalen flyttes, ingenting annet endres
    new.bedrift_id := old.bedrift_id; new.ansatt_id := old.ansatt_id; new.tekst := old.tekst;
    new.opprettet := old.opprettet; new.bilde_sti := old.bilde_sti; new.endret := old.endret;
  else
    -- bare teksten kan rettes
    new.bedrift_id := old.bedrift_id; new.ansatt_id := old.ansatt_id; new.kanal := old.kanal;
    new.opprettet := old.opprettet; new.bilde_sti := old.bilde_sti; new.endret := now();
  end if;
  return new;
end $$;

create or replace function public.koble_prosjekt(fra uuid, til uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  a public.prosjekter;
  b public.prosjekter;
  r record;
  n integer := 0;
  m integer;
begin
  if not public.er_leder() then raise exception 'Bare leder kan koble prosjekter.' using errcode = 'P0001'; end if;
  select * into a from public.prosjekter where id = fra and bedrift_id = public.min_bedrift() for update;
  select * into b from public.prosjekter where id = til and bedrift_id = public.min_bedrift() for update;
  if a.id is null or b.id is null then raise exception 'Fant ikke prosjektet.' using errcode = 'P0001'; end if;
  if a.id = b.id then raise exception 'Velg et annet prosjekt.' using errcode = 'P0001'; end if;
  if a.visma_nr is not null then raise exception 'Prosjektet kommer allerede fra Visma.' using errcode = 'P0001'; end if;
  if b.visma_nr is null then raise exception 'Velg et prosjekt som kommer fra Visma.' using errcode = 'P0001'; end if;

  -- Produkter som står på begge: behold Visma-prosjektets
  delete from public.prosjekt_vare v where v.prosjekt_id = fra
    and exists (select 1 from public.prosjekt_vare w where w.prosjekt_id = til and w.varenr = v.varenr);

  -- Alt som peker på prosjektet flyttes (finner tabellene selv, så nye tabeller kommer med)
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
  perform set_config('bygglogg.flytt_prosjekt', '1', true);
  update public.meldinger set kanal = 'p:' || til where kanal = 'p:' || fra;
  get diagnostics m = row_count;
  n := n + m;
  perform set_config('bygglogg.flytt_prosjekt', '0', true);
  insert into public.kanal_lest (ansatt_id, kanal, lest)
    select ansatt_id, 'p:' || til, lest from public.kanal_lest where kanal = 'p:' || fra
  on conflict (ansatt_id, kanal) do update set lest = greatest(public.kanal_lest.lest, excluded.lest);
  delete from public.kanal_lest where kanal = 'p:' || fra;

  -- Opplysninger som bare er fylt ut i app-prosjektet (adresse, estimat, notat, eiendom …) tas med
  for r in
    select column_name, data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'prosjekter' and data_type <> 'boolean'
      and column_name not in ('id', 'bedrift_id', 'visma_nr', 'navn', 'oppdatert')
  loop
    if r.data_type = 'text' then
      execute format('update public.prosjekter t set %1$I = s.%1$I from public.prosjekter s where t.id = $1 and s.id = $2 and coalesce(t.%1$I, '''') = '''' and coalesce(s.%1$I, '''') <> ''''', r.column_name) using til, fra;
    else
      execute format('update public.prosjekter t set %1$I = s.%1$I from public.prosjekter s where t.id = $1 and s.id = $2 and t.%1$I is null and s.%1$I is not null', r.column_name) using til, fra;
    end if;
  end loop;

  delete from public.prosjekter where id = fra;
  return n;
end $$;
revoke all on function public.koble_prosjekt(uuid, uuid) from public, anon;
grant execute on function public.koble_prosjekt(uuid, uuid) to authenticated;
