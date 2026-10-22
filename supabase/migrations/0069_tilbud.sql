-- Tilbudsoppfølging: åpne tilbud fra Visma Business NXT som bør følges opp med en telefon.
-- Et tilbud i Business NXT er en ordre med ordretype 5. Når kunden takker ja, endres typen til ordre
-- på samme ordrenummer. visma-sync henter tilbudene og merker dem «vunnet» når typen er endret,
-- «avsluttet» når de er avsluttet uten å bli ordre, og «borte» når de er slettet.
-- I ByggLogg registrerer selgeren at kunden er ringt, når neste kontakt skal være, og om tilbudet er tapt.
create table if not exists public.tilbud (
  id             uuid primary key default gen_random_uuid(),
  bedrift_id     smallint not null references public.bedrifter(id),
  visma_ordrenr  integer not null,
  tilbudsnr      integer,
  dato           date,
  kunde          text not null default '',
  kunde_nr       integer,
  referanse      text not null default '',     -- «Deres ref.» på tilbudet
  belop          numeric(14,2) not null default 0,  -- netto eks. mva
  selger_nr      integer,
  selger_navn    text not null default '',
  avdeling_nr    smallint,
  status         text not null default 'apen' check (status in ('apen', 'vunnet', 'avsluttet', 'borte')),
  status_dato    date,                          -- når status sist endret seg i Visma
  -- Oppfølging i ByggLogg
  utfall         text check (utfall in ('tapt', 'ikke_aktuelt')),
  sist_kontakt   date,
  neste_kontakt  date,
  notat          text not null default '',
  logg           jsonb not null default '[]'::jsonb,   -- [{ dato, av, hva, notat }]
  oppdatert      timestamptz not null default now(),
  unique (bedrift_id, visma_ordrenr)
);
create index if not exists tilbud_apne on public.tilbud (bedrift_id, status, dato);

/** Leder og prosjektleder ser alle tilbud. Andre ser tilbudene der de selv er selger i Visma (samme navn). */
create or replace function public.kan_se_tilbud(b smallint, selger text) returns boolean
language sql stable security definer set search_path = public as $$
  select b = public.min_bedrift() and (public.er_planlegger() or exists (
    select 1 from public.ansatte a
     where a.id = public.mitt_ansatt_id() and a.bedrift_id = b
       and lower(trim(a.navn)) <> '' and lower(trim(a.navn)) = lower(trim(coalesce(selger, '')))))
$$;
revoke all on function public.kan_se_tilbud(smallint, text) from public, anon;
grant execute on function public.kan_se_tilbud(smallint, text) to authenticated;

alter table public.tilbud enable row level security;
drop policy if exists tilbud_les on public.tilbud;
create policy tilbud_les on public.tilbud for select to authenticated using (public.kan_se_tilbud(bedrift_id, selger_navn));
revoke all on public.tilbud from anon;
grant select on public.tilbud to authenticated;

/** Registrer oppfølging: «ringt» (med neste kontakt), «utsett», «tapt», «ikke_aktuelt» eller «gjenapne» */
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
  if handling not in ('ringt', 'utsett', 'tapt', 'ikke_aktuelt', 'gjenapne', 'notat') then
    raise exception 'Ukjent handling.' using errcode = 'P0001';
  end if;
  if neste is not null and (neste < idag or neste > idag + 365) then
    raise exception 'Ugyldig dato for neste kontakt.' using errcode = 'P0001';
  end if;
  update public.tilbud set
    utfall = case handling when 'tapt' then 'tapt' when 'ikke_aktuelt' then 'ikke_aktuelt' when 'gjenapne' then null else utfall end,
    sist_kontakt = case when handling = 'ringt' then idag else sist_kontakt end,
    neste_kontakt = case
      when handling in ('tapt', 'ikke_aktuelt') then null
      when handling in ('ringt', 'utsett', 'gjenapne') then coalesce(neste, idag + 7)
      else neste_kontakt end,
    notat = case when length(trim(coalesce(folg_opp_tilbud.notat, ''))) > 0 then left(trim(folg_opp_tilbud.notat), 2000) else tilbud.notat end,
    logg = (tilbud.logg || jsonb_build_array(jsonb_build_object(
      'dato', idag, 'av', meg, 'hva', handling, 'notat', left(trim(coalesce(folg_opp_tilbud.notat, '')), 2000))))
  where id = t;
end $$;
revoke all on function public.folg_opp_tilbud(uuid, text, text, date) from public, anon;
grant execute on function public.folg_opp_tilbud(uuid, text, text, date) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tilbud') then
    execute 'alter publication supabase_realtime add table public.tilbud';
  end if;
end $$;
