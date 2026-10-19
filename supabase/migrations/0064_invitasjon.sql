-- Invitasjon til appen: leder trykker «Send invitasjon» på en ansatt, og den ansatte får en e-post
-- med lenke, hvordan man logger inn med kode, hvordan appen lagres på hjemskjermen (iPhone og Android)
-- og hvordan varsler slås på. Kan sendes på nytt. Leder ser når den sist ble sendt og om den ansatte
-- har logget inn.
create table if not exists public.invitasjoner (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null references public.bedrifter(id),
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  epost       text not null,
  sendt_av    uuid references public.ansatte(id) on delete set null,
  opprettet   timestamptz not null default now(),
  -- Settes av varsle-funksjonen når e-posten faktisk er sendt
  levert      timestamptz
);
create index if not exists invitasjoner_ansatt on public.invitasjoner (ansatt_id, opprettet desc);
alter table public.invitasjoner enable row level security;
drop policy if exists invitasjon_les on public.invitasjoner;
create policy invitasjon_les on public.invitasjoner for select to authenticated
  using (bedrift_id = public.min_bedrift() and public.er_leder());
revoke all on public.invitasjoner from anon, authenticated;
grant select on public.invitasjoner to authenticated;

/** Leder: send (eller send på nytt) invitasjon til en ansatt */
create or replace function public.send_invitasjon(a uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  x public.ansatte;
  ny uuid;
  u text := (select verdi from public.plattform_oppsett where nokkel = 'functions_url');
begin
  if not public.er_leder() then raise exception 'Bare leder kan sende invitasjoner.' using errcode = 'P0001'; end if;
  select * into x from public.ansatte where id = a and bedrift_id = public.min_bedrift();
  if x.id is null then raise exception 'Fant ikke den ansatte.' using errcode = 'P0001'; end if;
  if not x.aktiv then raise exception 'Den ansatte er merket som sluttet.' using errcode = 'P0001'; end if;
  if coalesce(trim(x.epost), '') = '' then raise exception 'Legg inn e-post på den ansatte først.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.invitasjoner where ansatt_id = a and opprettet > now() - interval '1 minute') then
    raise exception 'Invitasjonen ble nettopp sendt. Vent et minutt før du sender på nytt.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.invitasjoner where bedrift_id = x.bedrift_id and opprettet > now() - interval '1 hour') >= 50 then
    raise exception 'For mange invitasjoner siste time. Prøv igjen senere.' using errcode = 'P0001';
  end if;
  insert into public.invitasjoner (bedrift_id, ansatt_id, epost, sendt_av)
    values (x.bedrift_id, x.id, trim(x.epost), public.mitt_ansatt_id()) returning id into ny;
  if u is null then raise exception 'E-post er ikke satt opp for plattformen ennå.' using errcode = 'P0001'; end if;
  perform net.http_post(
    url := u || '/varsle',
    body := jsonb_build_object('id', ny, 'hendelse', 'invitasjon'),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end $$;
revoke all on function public.send_invitasjon(uuid) from public, anon;
grant execute on function public.send_invitasjon(uuid) to authenticated;

/** Leder: for hver ansatt – sist invitert og sist logget inn */
create or replace function public.ansatte_innlogging()
returns table (ansatt_id uuid, invitert timestamptz, innlogget timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.er_leder() then return; end if;
  return query
    select a.id,
           (select max(i.opprettet) from public.invitasjoner i where i.ansatt_id = a.id),
           (select max(u.last_sign_in_at) from auth.users u where a.epost is not null and lower(u.email) = lower(trim(a.epost)))
      from public.ansatte a
     where a.bedrift_id = public.min_bedrift();
end $$;
revoke all on function public.ansatte_innlogging() from public, anon;
grant execute on function public.ansatte_innlogging() to authenticated;
