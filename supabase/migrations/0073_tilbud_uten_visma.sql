-- Tilbud uten Visma: tilbud kan registreres rett i ByggLogg (for bedrifter uten Visma, eller tilbud som
-- ikke ligger der). De følges opp på samme måte, og selgeren merker selv at kunden takket ja (vunnet).
alter table public.tilbud alter column visma_ordrenr drop not null;
alter table public.tilbud add column if not exists manuell boolean not null default false;
alter table public.tilbud add column if not exists telefon text not null default '';
alter table public.tilbud add column if not exists beskrivelse text not null default '';
alter table public.tilbud add column if not exists opprettet_av uuid references public.ansatte(id) on delete set null;

/** Lag eller endre et tilbud registrert i ByggLogg. Andre enn leder/prosjektleder blir selv selger. */
create or replace function public.lagre_tilbud(t uuid, kunde text, telefon text, referanse text, beskrivelse text,
  belop numeric, dato date, selger text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  r public.tilbud;
  s text := trim(coalesce(selger, ''));
  id_ uuid;
begin
  if meg is null then raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(kunde, ''))) = 0 then raise exception 'Skriv inn kunden.' using errcode = 'P0001'; end if;
  if coalesce(belop, 0) < 0 or coalesce(belop, 0) > 1e9 then raise exception 'Ugyldig beløp.' using errcode = 'P0001'; end if;
  if not public.er_planlegger() or s = '' then s := (select navn from public.ansatte where id = meg); end if;
  if t is null then
    insert into public.tilbud (bedrift_id, visma_ordrenr, dato, kunde, telefon, referanse, beskrivelse, belop, selger_navn, status, manuell, opprettet_av, logg)
    values (public.min_bedrift(), null, coalesce(dato, (now() at time zone 'Europe/Oslo')::date), left(trim(kunde), 200), left(trim(coalesce(telefon, '')), 40),
            left(trim(coalesce(referanse, '')), 200), left(trim(coalesce(beskrivelse, '')), 2000), coalesce(belop, 0), s, 'apen', true, meg, '[]'::jsonb)
    returning id into id_;
    return id_;
  end if;
  select * into r from public.tilbud where id = t;
  if r.id is null or not r.manuell or not public.kan_se_tilbud(r.bedrift_id, r.selger_navn) then
    raise exception 'Fant ikke tilbudet.' using errcode = 'P0001';
  end if;
  update public.tilbud set kunde = left(trim(lagre_tilbud.kunde), 200), telefon = left(trim(coalesce(lagre_tilbud.telefon, '')), 40),
    referanse = left(trim(coalesce(lagre_tilbud.referanse, '')), 200), beskrivelse = left(trim(coalesce(lagre_tilbud.beskrivelse, '')), 2000),
    belop = coalesce(lagre_tilbud.belop, 0), dato = coalesce(lagre_tilbud.dato, tilbud.dato), selger_navn = s, oppdatert = now()
  where id = t;
  return t;
end $$;
revoke all on function public.lagre_tilbud(uuid, text, text, text, text, numeric, date, text) from public, anon;
grant execute on function public.lagre_tilbud(uuid, text, text, text, text, numeric, date, text) to authenticated;

/** Slett et tilbud registrert i ByggLogg (den som laget det, eller leder/prosjektleder) */
create or replace function public.slett_tilbud(t uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.tilbud where id = t and manuell and bedrift_id = public.min_bedrift()
    and (public.er_planlegger() or opprettet_av = public.mitt_ansatt_id());
  if not found then raise exception 'Fant ikke tilbudet.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.slett_tilbud(uuid) from public, anon;
grant execute on function public.slett_tilbud(uuid) to authenticated;

/** Oppfølging, nå også «vunnet» for tilbud registrert i ByggLogg (tilbud fra Visma blir vunnet når de blir ordre) */
create or replace function public.folg_opp_tilbud(t uuid, handling text, notat text default '', neste date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.tilbud;
  idag date := (now() at time zone 'Europe/Oslo')::date;
  meg uuid := public.mitt_ansatt_id();
begin
  select * into r from public.tilbud where id = t;
  if r.id is null or not public.kan_se_tilbud(r.bedrift_id, r.selger_navn) then
    raise exception 'Fant ikke tilbudet.' using errcode = 'P0001';
  end if;
  if handling not in ('ringt', 'utsett', 'tapt', 'ikke_aktuelt', 'gjenapne', 'notat', 'vunnet') then
    raise exception 'Ukjent handling.' using errcode = 'P0001';
  end if;
  if handling = 'vunnet' and not r.manuell then
    raise exception 'Tilbud fra Visma blir vunnet når de gjøres om til ordre i Visma.' using errcode = 'P0001';
  end if;
  if neste is not null and (neste < idag or neste > idag + 365) then
    raise exception 'Ugyldig dato for neste kontakt.' using errcode = 'P0001';
  end if;
  update public.tilbud set
    status = case when handling = 'vunnet' then 'vunnet' when handling = 'gjenapne' and r.manuell then 'apen' else status end,
    status_dato = case when handling = 'vunnet' or (handling = 'gjenapne' and r.manuell) then idag else status_dato end,
    utfall = case handling when 'tapt' then 'tapt' when 'ikke_aktuelt' then 'ikke_aktuelt' when 'gjenapne' then null when 'vunnet' then null else utfall end,
    sist_kontakt = case when handling in ('ringt', 'vunnet') then idag else sist_kontakt end,
    neste_kontakt = case
      when handling in ('tapt', 'ikke_aktuelt', 'vunnet') then null
      when handling in ('ringt', 'utsett', 'gjenapne') then coalesce(neste, idag + 7)
      else neste_kontakt end,
    notat = case when length(trim(coalesce(folg_opp_tilbud.notat, ''))) > 0 then left(trim(folg_opp_tilbud.notat), 2000) else tilbud.notat end,
    logg = (tilbud.logg || jsonb_build_array(jsonb_build_object(
      'dato', idag, 'av', meg, 'hva', handling, 'notat', left(trim(coalesce(folg_opp_tilbud.notat, '')), 2000))))
  where id = t;
end $$;
