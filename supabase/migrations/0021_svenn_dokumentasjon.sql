-- Dokumentasjon fra Svenn: bilder og PDF-er per prosjekt. Leder laster opp et arkiv (zip) under Oppsett.
-- svenn_id hindrer at samme fil blir lagt inn to ganger hvis arkivet importeres på nytt.

alter table public.bilder add column svenn_id bigint;
alter table public.fdv_dok add column svenn_id bigint;
create unique index bilder_svenn on public.bilder (bedrift_id, svenn_id) where svenn_id is not null;
create unique index fdv_dok_svenn on public.fdv_dok (bedrift_id, svenn_id) where svenn_id is not null;

/**
 * Koble Svenn-prosjekter til prosjekter i ByggLogg (oppretter nye ved behov) og husk valget.
 * koblinger: [{nokkel, prosjekt_id | null, ny_navn | null}] -> {nokkel: prosjekt_id}
 */
create or replace function public.svenn_prosjekter(koblinger jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b smallint := public.min_bedrift();
  k jsonb; pid uuid; ut jsonb := '{}'::jsonb;
begin
  if not public.er_leder() then
    raise exception 'Bare leder kan importere fra Svenn.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(koblinger) <> 'array' then raise exception 'Ugyldige koblinger.' using errcode = 'P0001'; end if;
  for k in select * from jsonb_array_elements(koblinger) loop
    pid := null;
    if nullif(k ->> 'prosjekt_id', '') is not null then
      select id into pid from public.prosjekter where id = (k ->> 'prosjekt_id')::uuid and bedrift_id = b;
      if pid is null then raise exception 'Ukjent prosjekt for %.', k ->> 'nokkel' using errcode = 'P0001'; end if;
    elsif length(trim(coalesce(k ->> 'ny_navn', ''))) > 0 then
      select id into pid from public.prosjekter where bedrift_id = b and fra_svenn and navn = trim(k ->> 'ny_navn') limit 1;
      if pid is null then
        insert into public.prosjekter (bedrift_id, navn, aktiv, fra_svenn) values (b, left(trim(k ->> 'ny_navn'), 200), false, true)
          returning id into pid;
      end if;
    end if;
    if pid is not null then
      insert into public.svenn_kobling (bedrift_id, nokkel, prosjekt_id, fakturerbar)
        values (b, left(k ->> 'nokkel', 400), pid, true)
        on conflict (bedrift_id, nokkel) do update set prosjekt_id = excluded.prosjekt_id;
      ut := ut || jsonb_build_object(k ->> 'nokkel', pid);
    end if;
  end loop;
  return ut;
end $$;
revoke all on function public.svenn_prosjekter(jsonb) from public, anon;
grant execute on function public.svenn_prosjekter(jsonb) to authenticated;
