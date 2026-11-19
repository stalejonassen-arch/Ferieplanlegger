-- Utlogging stoppet med «Tiden overlapper med en annen registrering samme dag» når den ansatte
-- (eller leder) allerede hadde ført timer i samme tidsrom. Nå lagres bare tiden som ikke er ført fra før.
create or replace function public.stemple(handling text, prosjekt uuid default null, beskrivelse text default '', lunsj integer default 0, til time default null, tid timestamptz default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  s public.stempling;
  naa timestamp;
  slutt time;
  ledig time;
  rest_lunsj integer;
  opptatt record;
begin
  if meg is null then raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = 'P0001'; end if;
  if handling not in ('inn', 'bytt', 'ut') then raise exception 'Ukjent handling.' using errcode = 'P0001'; end if;
  if tid is not null and (tid > now() + interval '10 minutes' or tid < now() - interval '3 days') then
    raise exception 'Stemplingen er for gammel til å sendes automatisk. Før timene manuelt.' using errcode = 'P0001';
  end if;
  naa := case when tid is null then public.kvarter_naa()
              else to_timestamp(round(extract(epoch from tid) / 900) * 900) at time zone 'Europe/Oslo' end;
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
      -- Tiden som allerede er ført samme dag (manuelt, av leder eller fra Svenn) hoppes over,
      -- så utloggingen aldri stopper på «overlapper». Bare hullene mellom føringene blir lagret.
      perform set_config('bygglogg.stempel', '1', true);
      ledig := s.fra;
      rest_lunsj := greatest(0, least(coalesce(lunsj, 0), 120));
      for opptatt in
        select t.fra, t.til from public.timer t
         where t.ansatt_id = meg and t.dato = s.dato and t.fra < slutt and t.til > s.fra
         order by t.fra
      loop
        if opptatt.fra > ledig then
          insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, lunsj_min, beskrivelse, fakturerbar)
          values (meg, s.prosjekt_id, s.dato, ledig, opptatt.fra,
                  least(rest_lunsj, (extract(epoch from opptatt.fra - ledig) / 60)::int / 2),
                  coalesce(trim(beskrivelse), ''), s.prosjekt_id is not null);
          rest_lunsj := rest_lunsj - least(rest_lunsj, (extract(epoch from opptatt.fra - ledig) / 60)::int / 2);
        end if;
        ledig := greatest(ledig, opptatt.til);
      end loop;
      if slutt > ledig then
        insert into public.timer (ansatt_id, prosjekt_id, dato, fra, til, lunsj_min, beskrivelse, fakturerbar)
        values (meg, s.prosjekt_id, s.dato, ledig, slutt,
                least(rest_lunsj, (extract(epoch from slutt - ledig) / 60)::int / 2),
                coalesce(trim(beskrivelse), ''), s.prosjekt_id is not null);
      end if;
      perform set_config('bygglogg.stempel', '0', true);
    end if;
    delete from public.stempling where ansatt_id = meg;
  end if;
  if handling in ('inn', 'bytt') then
    insert into public.stempling (ansatt_id, bedrift_id, prosjekt_id, dato, fra, startet)
    values (meg, public.min_bedrift(), prosjekt, naa::date, case when handling = 'bytt' and slutt is not null and s.dato = naa::date then slutt else naa::time end, coalesce(tid, now()));
  end if;
end $$;
revoke all on function public.stemple(text, uuid, text, integer, time, timestamptz) from public, anon;
grant execute on function public.stemple(text, uuid, text, integer, time, timestamptz) to authenticated;
