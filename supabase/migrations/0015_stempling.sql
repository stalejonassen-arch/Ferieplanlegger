-- Stempling: logg inn når arbeidet begynner, bytt når du flytter deg, logg ut når prosjektet eller dagen er ferdig.
-- Pågående stempling ligger på serveren (virker på alle enheter, og leder ser hvem som er inne).
-- Hver timeføring får en kilde: stempel (i sanntid), manuell (ført i etterkant) eller endret (stempel som er rettet).

alter table public.timer add column kilde text not null default 'manuell' check (kilde in ('stempel', 'manuell', 'endret'));

create table public.stempling (
  ansatt_id    uuid primary key references public.ansatte(id) on delete cascade,
  bedrift_id   smallint not null default 1 references public.bedrifter(id),
  prosjekt_id  uuid references public.prosjekter(id) on delete set null,
  dato         date not null,
  fra          time not null,
  startet      timestamptz not null default now()
);

alter table public.stempling enable row level security;
create policy stempling_les on public.stempling for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()));
revoke all on public.stempling from anon, authenticated;
grant select on public.stempling to authenticated;

-- Kilden settes av databasen, ikke av appen
create or replace function public.timer_kilde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.kilde := case when current_setting('bygglogg.stempel', true) = '1' then 'stempel' else 'manuell' end;
  elsif old.kilde = 'stempel' and (new.fra, new.til, new.dato) is distinct from (old.fra, old.til, old.dato) then
    new.kilde := 'endret';
  else
    new.kilde := old.kilde;
  end if;
  return new;
end $$;
create trigger timer_kilde before insert or update on public.timer
  for each row execute function public.timer_kilde();

/** Norsk klokke rundet til nærmeste kvarter */
create or replace function public.kvarter_naa() returns timestamp
language sql stable as $$
  select to_timestamp(round(extract(epoch from now()) / 900) * 900) at time zone 'Europe/Oslo'
$$;

-- handling: 'inn' | 'bytt' | 'ut'. til: sluttid når man glemte å stemple ut en tidligere dag.
create or replace function public.stemple(handling text, prosjekt uuid default null, beskrivelse text default '', lunsj integer default 0, til time default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  s public.stempling;
  naa timestamp := public.kvarter_naa();
  slutt time;
begin
  if meg is null then raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = 'P0001'; end if;
  if handling not in ('inn', 'bytt', 'ut') then raise exception 'Ukjent handling.' using errcode = 'P0001'; end if;
  if prosjekt is not null and not exists (select 1 from public.prosjekter where id = prosjekt and bedrift_id = public.min_bedrift()) then
    raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
  end if;
  select * into s from public.stempling where ansatt_id = meg for update;

  if handling = 'inn' and s.ansatt_id is not null then
    raise exception 'Du er allerede logget inn. Bytt prosjekt eller logg ut først.' using errcode = 'P0001';
  end if;
  if handling in ('bytt', 'ut') then
    if s.ansatt_id is null then raise exception 'Du er ikke logget inn.' using errcode = 'P0001'; end if;
    slutt := case when s.dato = naa::date then naa::time else coalesce(til, null) end;
    if slutt is null then raise exception 'Du ble ikke logget ut %. Skriv inn når du sluttet.', to_char(s.dato, 'DD.MM.') using errcode = 'P0001'; end if;
    if slutt > s.fra then
      perform set_config('bygglogg.stempel', '1', true);
      insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, lunsj_min, beskrivelse, fakturerbar)
      values (meg, s.prosjekt_id, s.dato, s.fra, slutt, greatest(0, least(coalesce(lunsj, 0), 120)), coalesce(trim(beskrivelse), ''), s.prosjekt_id is not null);
      perform set_config('bygglogg.stempel', '0', true);
    end if;
    delete from public.stempling where ansatt_id = meg;
  end if;
  if handling in ('inn', 'bytt') then
    insert into public.stempling (ansatt_id, bedrift_id, prosjekt_id, dato, fra)
    values (meg, public.min_bedrift(), prosjekt, naa::date, case when handling = 'bytt' and slutt is not null and s.dato = naa::date then slutt else naa::time end);
  end if;
end $$;
revoke all on function public.stemple(text, uuid, text, integer, time) from public, anon;
grant execute on function public.stemple(text, uuid, text, integer, time) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stempling;
  end if;
end $$;
