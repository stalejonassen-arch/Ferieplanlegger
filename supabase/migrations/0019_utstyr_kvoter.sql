-- Utstyr del 2: kvoter på antall per plaggtype, verneutstyr som egen kategori (uten tak – arbeidsgiver skal
-- gi personlig verneutstyr etter behov), og «nytt mot gammelt» for håndverktøy.

alter table public.utstyr drop constraint if exists utstyr_kategori_check;
alter table public.utstyr add constraint utstyr_kategori_check check (kategori in ('verktoy', 'arbeidstoy', 'verneutstyr', 'forbruk'));
-- Ny vare av samme slag som noe den ansatte har fra før: avklart (gammel levert inn eller beholdes)
alter table public.utstyr add column bytte_avklart boolean not null default false;

create or replace function public.utstyr_kategori(beskrivelse text) returns text
language sql immutable as $$
  select case
    when b ~ '(BLAD|BOR[ ,X0-9]|BOR$|BITS|SKIVE|REFILL|POSE|SEKK[^H]|SEKK$|STIFT|SKRUE|TAPE|BATTERIER|LIM|SKUM|PRIMER|SMØREMIDDEL|AVFETTER|KABELSTRIPS|SNOR|PLUGG|LEKT|MATTE)'
      then 'forbruk'
    when b ~ '(HANSKE|VERNESKO|SKO[ $]|SKO$|STØVLE|HJELM|BRILLE|HØRSELVERN|KNEBESK|KNEPUTE|MASKE|FALLSIKR|SELE |REFLEKS)'
      then 'verneutstyr'
    when b ~ '(BUKSE|JAKKE|GENSER|SKJORTE|T-SKJ|VEST|LUE|CAPS|REGN|KLÆR|KLE$|BELTE|SOKK|DRESS|SHORTS|FLEECE|SOFTSHELL|ANORAKK|PARKAS|HETTE|ARBEIDSTØY)'
      then 'arbeidstoy'
    when b ~ '(KM|HSC|BATTERI |MASKIN|SAG|HAMMER|VATER|MÅLEBÅND|TOMMESTOKK|METERSTOKK|KNIV|MEISEL|TVINGE|BUKK|LYSSLYNGE|LYKT|SKJØTEKONT|GRENUTTAK|BLÅSE|HØVEL|SKRUTREKKER|DRILL|SLIPER|LASER|STIGE|KILE|SPARKEL|FUGESETT|HOLDER|TANG|NØKKEL|SKRUJERN|BOKS|KOFFERT|HUGGJERN|SAKS|KOBEN|BREKKJERN|ADAPTER|LADER)'
      then 'verktoy'
    else 'forbruk' end
  from (select upper(coalesce(beskrivelse, '')) as b) x
$$;

-- Sorter det som allerede er hentet på nytt (ikke det leder har rettet)
update public.utstyr set kategori = public.utstyr_kategori(beskrivelse) where not kategori_manuell;

-- Kvoter per ansatt: antall per plaggtype og over hvor mange år (1 = siste 12 mnd, 2 = siste 24 mnd)
alter table public.bedrifter add column utstyr_kvoter jsonb not null default '{
  "bukse": {"antall": 2, "aar": 1}, "jakke": {"antall": 1, "aar": 1}, "vinter": {"antall": 2, "aar": 2},
  "tskjorte": {"antall": 5, "aar": 1}, "genser": {"antall": 2, "aar": 1}, "regntoy": {"antall": 2, "aar": 2},
  "vernesko": {"antall": 1, "aar": 1}
}'::jsonb;

create or replace function public.sett_utstyr_kvoter(kvoter jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if not public.er_leder() then
    raise exception 'Bare leder kan endre kvotene.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(kvoter) <> 'object' then raise exception 'Ugyldige kvoter.' using errcode = 'P0001'; end if;
  for k, v in select * from jsonb_each(kvoter) loop
    if k !~ '^[a-z]{2,20}$' or jsonb_typeof(v -> 'antall') <> 'number' or (v ->> 'antall')::numeric < 0 or (v ->> 'antall')::numeric > 100
       or (v ->> 'aar')::int not in (1, 2, 3) then
      raise exception 'Ugyldig kvote for %.', k using errcode = 'P0001';
    end if;
  end loop;
  update public.bedrifter set utstyr_kvoter = kvoter where id = public.min_bedrift();
end $$;
revoke all on function public.sett_utstyr_kvoter(jsonb) from public, anon;
grant execute on function public.sett_utstyr_kvoter(jsonb) to authenticated;
