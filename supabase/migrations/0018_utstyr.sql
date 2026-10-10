-- Utstyr: verktøy, arbeidstøy og forbruk hver ansatt har tatt ut.
-- Hver ansatt har en egen «utstyrskonto» (et prosjekt i Visma, f.eks. 188 «Jim Kato – utstyr, arbeidsklær»).
-- Ordrelinjene på kontoen hentes fra Visma med dato og pris. Leder kan sette grenser for hvor mye og hvor ofte.

alter table public.ansatte add column utstyr_prosjekt_id uuid references public.prosjekter(id) on delete set null;
create unique index ansatte_utstyr_prosjekt on public.ansatte (utstyr_prosjekt_id) where utstyr_prosjekt_id is not null;

alter table public.bedrifter add column utstyr_grense_arbeidstoy numeric(10,0);  -- kr per ansatt per år (null = ingen grense)
alter table public.bedrifter add column utstyr_grense_verktoy numeric(10,0);     -- kr per ansatt per år
alter table public.bedrifter add column utstyr_samme_mnd smallint not null default 6; -- samme vare igjen innen så mange måneder varsles

/** Sorterer en vare ut fra beskrivelsen. Leder kan rette den enkelte linjen. */
create or replace function public.utstyr_kategori(beskrivelse text) returns text
language sql immutable as $$
  select case
    when b ~ '(BLAD|BOR[ ,X0-9]|BOR$|BITS|SKIVE|REFILL|POSE|SEKK[^H]|SEKK$|STIFT|SKRUE|TAPE|BATTERIER|LIM|SKUM|PRIMER|SMØREMIDDEL|AVFETTER|KABELSTRIPS|SNOR|PLUGG|LEKT|MATTE|MASKE)'
      then 'forbruk'
    when b ~ '(HANSKE|BUKSE|JAKKE|GENSER|SKJORTE|T-SKJ|VEST|LUE|CAPS|SKO|STØVLE|REGN|KLÆR|KLE$|BELTE|KNEBESK|VERNEBRILLE|BRILLE|HØRSELVERN|HJELM|SOKK|DRESS|SHORTS|KJELEDRESS|ARBEIDSTØY|FLEECE|SOFTSHELL)'
      then 'arbeidstoy'
    when b ~ '(KM|HSC|BATTERI |MASKIN|SAG|HAMMER|VATER|MÅLEBÅND|TOMMESTOKK|METERSTOKK|KNIV|MEISEL|TVINGE|BUKK|LYSSLYNGE|LYKT|SKJØTEKONT|GRENUTTAK|BLÅSE|HØVEL|SKRUTREKKER|DRILL|SLIPER|LASER|STIGE|KILE|SPARKEL|FUGESETT|HOLDER|TANG|NØKKEL|SKRUJERN|BOKS|KOFFERT|HUGGJERN|SAKS|KOBEN|BREKKJERN|ADAPTER|LADER)'
      then 'verktoy'
    else 'forbruk' end
  from (select upper(coalesce(beskrivelse, '')) as b) x
$$;

create table public.utstyr (
  id                uuid primary key default gen_random_uuid(),
  bedrift_id        smallint not null default 1 references public.bedrifter(id),
  ansatt_id         uuid references public.ansatte(id) on delete set null,
  prosjekt_id       uuid references public.prosjekter(id) on delete set null,
  kilde             text not null default 'manuell' check (kilde in ('visma', 'manuell')),
  visma_ordrenr     integer,
  linjenr           integer,
  dato              date not null default current_date,
  varenr            text not null default '',
  nobb_nr           text not null default '',
  beskrivelse       text not null check (length(trim(beskrivelse)) > 0),
  antall            numeric(12,3) not null default 1,
  enhet             text not null default '',
  pris              numeric(12,2) not null default 0,   -- utsalgspris per enhet eks. mva (verdien som telles mot grensen)
  kategori          text not null default 'forbruk' check (kategori in ('verktoy', 'arbeidstoy', 'forbruk')),
  kategori_manuell  boolean not null default false,
  serienr           text not null default '',
  bilde_sti         text,
  status            text not null default 'i_bruk' check (status in ('i_bruk', 'service', 'levert', 'tapt')),
  merknad           text not null default '',
  registrert_av     uuid references public.ansatte(id) on delete set null,
  opprettet         timestamptz not null default now(),
  oppdatert         timestamptz not null default now()
);
create unique index utstyr_visma_linje on public.utstyr (bedrift_id, visma_ordrenr, linjenr);  -- egne (manuelle) rader har null og kolliderer ikke
create index utstyr_ansatt on public.utstyr (ansatt_id, dato);

create or replace function public.utstyr_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    -- Hentingen fra Visma (service role): eier og kategori settes her
    if new.kilde = 'visma' then
      new.ansatt_id := coalesce((select id from public.ansatte where utstyr_prosjekt_id = new.prosjekt_id limit 1), new.ansatt_id);
    end if;
    if tg_op = 'INSERT' or (not old.kategori_manuell and new.beskrivelse is distinct from old.beskrivelse) then
      if not coalesce(new.kategori_manuell, false) then new.kategori := public.utstyr_kategori(new.beskrivelse); end if;
    end if;
    new.oppdatert := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.kilde := 'manuell'; new.visma_ordrenr := null; new.linjenr := null; new.prosjekt_id := null;
    new.registrert_av := public.mitt_ansatt_id();
    new.bedrift_id := public.min_bedrift();
    if not public.er_leder() or new.ansatt_id is null then new.ansatt_id := public.mitt_ansatt_id(); end if;
    if new.kategori_manuell is distinct from true then new.kategori := public.utstyr_kategori(new.beskrivelse); end if;
  else
    new.bedrift_id := old.bedrift_id; new.kilde := old.kilde; new.registrert_av := old.registrert_av; new.opprettet := old.opprettet;
    if old.kilde = 'visma' then
      -- Det som kommer fra Visma kan ikke endres i appen
      new.visma_ordrenr := old.visma_ordrenr; new.linjenr := old.linjenr; new.prosjekt_id := old.prosjekt_id;
      new.dato := old.dato; new.varenr := old.varenr; new.beskrivelse := old.beskrivelse; new.antall := old.antall;
      new.enhet := old.enhet; new.pris := old.pris;
    end if;
    if not public.er_leder() then
      new.ansatt_id := old.ansatt_id; new.kategori := old.kategori; new.kategori_manuell := old.kategori_manuell;
      if old.kilde = 'visma' then new.nobb_nr := old.nobb_nr; end if;
    elsif new.kategori is distinct from old.kategori then
      new.kategori_manuell := true;
    end if;
  end if;
  new.oppdatert := now();
  return new;
end $$;
create trigger utstyr_vakt before insert or update on public.utstyr
  for each row execute function public.utstyr_vakt();

-- Når leder kobler en ansatt til en utstyrskonto, flyttes linjene som allerede er hentet
create or replace function public.utstyr_konto_endret() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.utstyr_prosjekt_id is distinct from old.utstyr_prosjekt_id then
    if old.utstyr_prosjekt_id is not null then
      update public.utstyr set ansatt_id = null where kilde = 'visma' and prosjekt_id = old.utstyr_prosjekt_id;
    end if;
    if new.utstyr_prosjekt_id is not null then
      update public.utstyr set ansatt_id = new.id where kilde = 'visma' and prosjekt_id = new.utstyr_prosjekt_id;
    end if;
  end if;
  return new;
end $$;
create trigger utstyr_konto_endret after update of utstyr_prosjekt_id on public.ansatte
  for each row execute function public.utstyr_konto_endret();

alter table public.utstyr enable row level security;
create policy utstyr_les on public.utstyr for select to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()));
create policy utstyr_ny on public.utstyr for insert to authenticated with check (public.er_ansatt());
create policy utstyr_endre on public.utstyr for update to authenticated
  using (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift()))
  with check (public.er_ansatt());
create policy utstyr_slett on public.utstyr for delete to authenticated
  using (kilde = 'manuell' and (ansatt_id = public.mitt_ansatt_id() or (public.er_leder() and bedrift_id = public.min_bedrift())));
revoke all on public.utstyr from anon;
grant select, insert, update, delete on public.utstyr to authenticated;

create or replace function public.sett_utstyr_grenser(arbeidstoy numeric, verktoy numeric, samme_mnd integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then
    raise exception 'Bare leder kan endre grensene.' using errcode = 'P0001';
  end if;
  if coalesce(arbeidstoy, 0) < 0 or coalesce(verktoy, 0) < 0 or samme_mnd is null or samme_mnd < 0 or samme_mnd > 60 then
    raise exception 'Ugyldige grenser.' using errcode = 'P0001';
  end if;
  update public.bedrifter set utstyr_grense_arbeidstoy = nullif(arbeidstoy, 0), utstyr_grense_verktoy = nullif(verktoy, 0),
    utstyr_samme_mnd = samme_mnd where id = public.min_bedrift();
end $$;
revoke all on function public.sett_utstyr_grenser(numeric, numeric, integer) from public, anon;
grant execute on function public.sett_utstyr_grenser(numeric, numeric, integer) to authenticated;

-- N L Austnes: utstyrskontoene i Visma (prosjekt 187–194)
update public.ansatte a set utstyr_prosjekt_id = p.id
from public.prosjekter p
where p.bedrift_id = a.bedrift_id and a.utstyr_prosjekt_id is null and (
  (p.visma_nr = 187 and a.navn ilike 'Svein Erik%') or
  (p.visma_nr = 188 and a.navn ilike 'Jim%') or
  (p.visma_nr = 189 and a.navn ilike 'Harald%') or
  (p.visma_nr = 190 and a.navn ilike 'Mieczys%') or
  (p.visma_nr = 191 and a.navn ilike 'Dawid%') or
  (p.visma_nr = 192 and a.navn ilike 'Stanis%') or
  (p.visma_nr = 193 and a.navn ilike 'Ståle%') or
  (p.visma_nr = 194 and a.navn ilike 'Karianne%'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.utstyr;
  end if;
end $$;
