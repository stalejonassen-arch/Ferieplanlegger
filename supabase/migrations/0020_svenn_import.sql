-- Import av timer fra Svenn (timelisteeksport i Excel). Leder laster opp fila under Oppsett, kobler hvert
-- Svenn-prosjekt til et prosjekt i ByggLogg (eller nytt / internt), og timene legges inn som godkjent med kilde «svenn».
-- Koblingene huskes, så neste import går av seg selv. En ny import av samme periode erstatter den forrige.

drop table if exists public.svenn_import;

alter table public.timer drop constraint if exists timer_kilde_check;
alter table public.timer add constraint timer_kilde_check check (kilde in ('stempel', 'manuell', 'endret', 'svenn'));
alter table public.prosjekter add column if not exists fra_svenn boolean not null default false;

-- Svenn-prosjekt (navn#nummer, eller #kunde:<kunde> uten prosjekt) -> prosjekt i ByggLogg (null = internt)
create table public.svenn_kobling (
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  nokkel       text not null,
  prosjekt_id  uuid references public.prosjekter(id) on delete cascade,
  fakturerbar  boolean not null default true,
  primary key (bedrift_id, nokkel)
);
alter table public.svenn_kobling enable row level security;
create policy svenn_kobling_les on public.svenn_kobling for select to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift());
revoke all on public.svenn_kobling from anon, authenticated;
grant select on public.svenn_kobling to authenticated;

-- Kilden «svenn» kan bare settes av importen
create or replace function public.timer_kilde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.kilde := case when current_setting('bygglogg.svenn', true) = '1' then 'svenn'
                      when current_setting('bygglogg.stempel', true) = '1' then 'stempel' else 'manuell' end;
  elsif old.kilde = 'stempel' and (new.fra, new.til, new.dato) is distinct from (old.fra, old.til, old.dato) then
    new.kilde := 'endret';
  else
    new.kilde := old.kilde;
  end if;
  return new;
end $$;

-- Svenn tillot overlappende føringer; de tas inn som de er (ellers stemmer ikke summene med Svenn)
create or replace function public.timer_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bedrift_id := (select bedrift_id from public.ansatte where id = new.ansatt_id);
  if not public.er_leder() then
    if tg_op = 'UPDATE' and old.status = 'godkjent' then
      raise exception 'Timene er godkjent og kan bare endres av leder.' using errcode = 'P0001';
    end if;
    new.status := 'levert';
    new.lunsj_unntak := case when tg_op = 'UPDATE' then old.lunsj_unntak else false end;
  end if;
  if coalesce(current_setting('bygglogg.svenn', true), '') <> '1' and exists (
    select 1 from public.timer t
    where t.ansatt_id = new.ansatt_id and t.dato = new.dato and t.id <> new.id
      and t.fra < new.til and t.til > new.fra
  ) then
    raise exception 'Tiden overlapper med en annen registrering samme dag.' using errcode = 'P0001';
  end if;
  if new.status = 'godkjent' and (tg_op = 'INSERT' or old.status is distinct from 'godkjent') then
    new.godkjent_av := public.mitt_ansatt_id();
    new.godkjent_tid := now();
  elsif new.status <> 'godkjent' then
    new.godkjent_av := null;
    new.godkjent_tid := null;
  end if;
  return new;
end $$;

/**
 * koblinger: [{nokkel, prosjekt_id | null, ny_navn | null, fakturerbar}]  (begge null = internt)
 * rader:     [{d: 'YYYY-MM-DD', a: ansattnr, f: 'HH:MM', t: 'HH:MM', l: lunsj min, k: nokkel, c: kommentar}]
 */
create or replace function public.importer_svenn(koblinger jsonb, rader jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b smallint := public.min_bedrift();
  k jsonb; pid uuid; nye int := 0; fra_d date; til_d date; ut jsonb;
begin
  if not public.er_leder() then
    raise exception 'Bare leder kan importere fra Svenn.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(koblinger) <> 'array' or jsonb_typeof(rader) <> 'array' or jsonb_array_length(rader) = 0 then
    raise exception 'Fila har ingen timer.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(rader) > 20000 then
    raise exception 'For mange rader i én import (maks 20 000).' using errcode = 'P0001';
  end if;

  -- Koblinger: opprett nye prosjekter og husk valget
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
        nye := nye + 1;
      end if;
    end if;
    insert into public.svenn_kobling (bedrift_id, nokkel, prosjekt_id, fakturerbar)
      values (b, left(k ->> 'nokkel', 400), pid, coalesce((k ->> 'fakturerbar')::boolean, pid is not null))
      on conflict (bedrift_id, nokkel) do update set prosjekt_id = excluded.prosjekt_id, fakturerbar = excluded.fakturerbar;
  end loop;

  select min((r ->> 'd')::date), max((r ->> 'd')::date) into fra_d, til_d from jsonb_array_elements(rader) r;

  perform set_config('bygglogg.svenn', '1', true);
  delete from public.timer where bedrift_id = b and kilde = 'svenn' and dato between fra_d and til_d;
  insert into public.timer (bedrift_id, ansatt_id, prosjekt_id, dato, fra, til, lunsj_min, beskrivelse, status, fakturerbar)
  select b, a.id, sk.prosjekt_id, (r ->> 'd')::date, (r ->> 'f')::time, (r ->> 't')::time, coalesce((r ->> 'l')::int, 0),
         left(coalesce(r ->> 'c', ''), 500), 'godkjent', coalesce(sk.fakturerbar and sk.prosjekt_id is not null, false)
  from jsonb_array_elements(rader) r
  join public.ansatte a on a.bedrift_id = b and a.ansattnr = r ->> 'a'
  left join public.svenn_kobling sk on sk.bedrift_id = b and sk.nokkel = r ->> 'k';
  perform set_config('bygglogg.svenn', '', true);

  select jsonb_build_object(
    'importert', count(*),
    'timer', coalesce(round(sum(timer), 2), 0),
    'fakturerbart', coalesce(round(sum(timer) filter (where fakturerbar), 2), 0),
    'internt', coalesce(round(sum(timer) filter (where prosjekt_id is null), 2), 0),
    'fra', fra_d, 'til', til_d, 'nye_prosjekter', nye,
    'ukjente_ansattnr', (select coalesce(jsonb_agg(distinct r ->> 'a'), '[]'::jsonb) from jsonb_array_elements(rader) r
                          where not exists (select 1 from public.ansatte a where a.bedrift_id = b and a.ansattnr = r ->> 'a')))
  into ut
  from public.timer where bedrift_id = b and kilde = 'svenn' and dato between fra_d and til_d;
  return ut;
end $$;
revoke all on function public.importer_svenn(jsonb, jsonb) from public, anon;
grant execute on function public.importer_svenn(jsonb, jsonb) to authenticated;

-- N L Austnes: koblingene fra Svenn til prosjektene i Visma, slik de ble avklart ved første import
insert into public.svenn_kobling (bedrift_id, nokkel, prosjekt_id, fakturerbar)
select p.bedrift_id, v.nokkel, p.id, v.vnr <> 208
from (values
  ('Skulefjellet#5', 179), ('Banuch roof#17', 210), ('Terje Aaseli#7', 199), ('Peter Olav Klokk#13', 203), ('Kyrre Rogne#14', 204),
  ('Karsten Stig Flem#10835', 216), ('Anne K Høgset#10836', 217), ('Lene Ingelsrud#10837', 111), ('Lene Ingelsrud Terrass 2#10851', 111),
  ('Skifte vindu#10856', 226), ('Skifte vindu ++#10862', 225), ('Siri Kjerstad Renovering#6', 186),
  ('Siri Kjerstad Renovering - Inngangsparti#2', 222), ('Siri Kjerstad Renovering - Støyping i kjeller#3', 224),
  ('Siri Kjerstad Renovering - siri extra#1', 198), ('BAD SIRI#10853', 186), ('Skifte bordkledning#10855', 217),
  ('Skifte bordkledning - ekstra#1', 217), ('Skifte vindu på loftet#10861', 217),
  ('Lastebil#10870', 208), ('Interntid NL 2026 - Lastebil#2', 208), ('TRUCK Driving#10860', 208)) v(nokkel, vnr)
join public.prosjekter p on p.visma_nr = v.vnr
on conflict do nothing;
insert into public.svenn_kobling (bedrift_id, nokkel, prosjekt_id, fakturerbar)
select b.id, v.nokkel, null, false
from public.bedrifter b, (values ('Interntid NL 2026#4'), ('Interntid NL 2026 - Mietek,Stan,Dawid i Polenn#1')) v(nokkel)
where exists (select 1 from public.prosjekter p where p.bedrift_id = b.id and p.visma_nr = 179)
on conflict do nothing;
