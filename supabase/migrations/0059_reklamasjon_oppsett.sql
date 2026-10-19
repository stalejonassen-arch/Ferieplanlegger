-- Reklamasjon satt opp per bedrift (salgsappen: hver kunde velger selv):
--   rekl_timer       : hvor timene føres – 'prosjekt' (fast reklamasjonsprosjekt), 'jobben' (originaljobben) eller 'intern' (interntid)
--   rekl_ansvar      : hvem som får ansvaret automatisk – 'snekker' eller 'selger' på originaljobben, eller 'ingen'
--   rekl_frist_dager : standard svarfrist i dager etter at kunden meldte fra (0 = ingen frist)
-- Uansett valg merkes timene med reklamasjonen og faktureres aldri. Påminnelse når fristen nærmer seg eller er passert.
alter table public.bedrifter add column if not exists rekl_timer text not null default 'jobben' check (rekl_timer in ('prosjekt', 'jobben', 'intern'));
alter table public.bedrifter add column if not exists rekl_ansvar text not null default 'snekker' check (rekl_ansvar in ('snekker', 'selger', 'ingen'));
alter table public.bedrifter add column if not exists rekl_frist_dager smallint not null default 14 check (rekl_frist_dager between 0 and 365);
-- Bedrifter som allerede har valgt et fast reklamasjonsprosjekt, fortsetter med det
update public.bedrifter set rekl_timer = 'prosjekt' where reklamasjon_prosjekt_id is not null;

create or replace function public.lagre_reklamasjon_oppsett(timer text, ansvar text, frist_dager integer, prosjekt uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre oppsettet for reklamasjon.' using errcode = 'P0001'; end if;
  if timer not in ('prosjekt', 'jobben', 'intern') or ansvar not in ('snekker', 'selger', 'ingen') or frist_dager is null or frist_dager not between 0 and 365 then
    raise exception 'Ugyldig valg.' using errcode = 'P0001';
  end if;
  if timer = 'prosjekt' and (prosjekt is null or not exists (select 1 from public.prosjekter where id = prosjekt and bedrift_id = public.min_bedrift())) then
    raise exception 'Velg reklamasjonsprosjektet.' using errcode = 'P0001';
  end if;
  update public.bedrifter
     set rekl_timer = timer, rekl_ansvar = ansvar, rekl_frist_dager = frist_dager,
         reklamasjon_prosjekt_id = case when timer = 'prosjekt' then prosjekt else reklamasjon_prosjekt_id end
   where id = public.min_bedrift();
  -- Timer som allerede står på reklamasjonsprosjektet faktureres ikke
  if timer = 'prosjekt' then
    update public.timer set fakturerbar = false where prosjekt_id = prosjekt and fakturerbar;
  end if;
end $$;
revoke all on function public.lagre_reklamasjon_oppsett(text, text, integer, uuid) from public, anon;
grant execute on function public.lagre_reklamasjon_oppsett(text, text, integer, uuid) to authenticated;

-- Eldre valg av bare prosjektet: velger også «fast reklamasjonsprosjekt» (eller originaljobben når det fjernes)
create or replace function public.lagre_reklamasjonsprosjekt(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan velge reklamasjonsprosjekt.' using errcode = 'P0001'; end if;
  if p is not null and not exists (select 1 from public.prosjekter where id = p and bedrift_id = public.min_bedrift()) then
    raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
  end if;
  update public.bedrifter set reklamasjon_prosjekt_id = p, rekl_timer = case when p is null then 'jobben' else 'prosjekt' end where id = public.min_bedrift();
  if p is not null then
    update public.timer set fakturerbar = false where prosjekt_id = p and fakturerbar;
  end if;
end $$;

create or replace function public.reklamasjon_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meg uuid := public.mitt_ansatt_id();
  planlegger boolean := public.er_planlegger();
  b public.bedrifter;
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    new.meldt_av := meg;
    if not exists (select 1 from public.prosjekter where id = new.prosjekt_id and bedrift_id = new.bedrift_id) then
      raise exception 'Prosjektet finnes ikke.' using errcode = 'P0001';
    end if;
    if not planlegger then
      new.status := 'ny'; new.vurdering := ''; new.ansvarlig_id := null; new.frist := null; new.materiell_kost := null;
    end if;
    new.signert_navn := ''; new.signatur := ''; new.signert_tid := null;
    -- Bedriftens oppsett: ansvarlig og frist settes med en gang hvis de ikke er gitt
    select * into b from public.bedrifter where id = new.bedrift_id;
    if new.ansvarlig_id is null and b.rekl_ansvar in ('snekker', 'selger') then
      select case when b.rekl_ansvar = 'snekker' then p.snekker_id else coalesce(p.selger_id, p.snekker_id) end into new.ansvarlig_id
        from public.prosjekter p where p.id = new.prosjekt_id;
      if new.ansvarlig_id is not null and not exists (select 1 from public.ansatte where id = new.ansvarlig_id and aktiv) then new.ansvarlig_id := null; end if;
    end if;
    if new.frist is null and coalesce(b.rekl_frist_dager, 0) > 0 then
      new.frist := greatest(new.meldt_dato + b.rekl_frist_dager, current_date);
    end if;
  else
    new.bedrift_id := old.bedrift_id;
    new.meldt_av := old.meldt_av;
    new.opprettet := old.opprettet;
    if new.prosjekt_id is distinct from old.prosjekt_id and current_setting('bygglogg.flytt_prosjekt', true) is distinct from '1' and not planlegger then
      new.prosjekt_id := old.prosjekt_id;
    end if;
    if not planlegger then
      if meg is not distinct from old.ansvarlig_id then
        -- Ansvarlig: kan melde utbedret og få kunden til å kvittere, men ikke endre vurderingen
        if new.status not in (old.status, 'utbedret') or old.status = 'avvist' then new.status := old.status; end if;
        new.vurdering := old.vurdering; new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist; new.materiell_kost := old.materiell_kost;
        new.tittel := old.tittel; new.beskrivelse := old.beskrivelse; new.kontakt := old.kontakt; new.meldt_dato := old.meldt_dato;
      elsif meg is not distinct from old.meldt_av and old.status = 'ny' then
        -- Den som registrerte: kan rette teksten mens den ikke er vurdert
        new.status := old.status; new.vurdering := old.vurdering; new.ansvarlig_id := old.ansvarlig_id; new.frist := old.frist;
        new.materiell_kost := old.materiell_kost; new.signert_navn := old.signert_navn; new.signatur := old.signatur;
      else
        raise exception 'Bare leder eller prosjektleder kan behandle reklamasjonen.' using errcode = 'P0001';
      end if;
    end if;
    if new.status is distinct from old.status and new.status in ('godkjent', 'avvist') then new.behandlet_av := meg; end if;
  end if;
  -- Utbedret: hvem og når
  if new.status = 'utbedret' and (tg_op = 'INSERT' or old.status <> 'utbedret') then
    new.utbedret_av := meg; new.utbedret_tid := now();
  elsif new.status <> 'utbedret' then
    new.utbedret_av := null; new.utbedret_tid := null;
  end if;
  -- Kundens kvittering kan bare gis når den er utbedret, og settes med tidspunkt
  if tg_op = 'UPDATE' then
    if new.signatur <> '' and new.signatur is distinct from old.signatur then
      if new.status <> 'utbedret' then raise exception 'Kunden kan kvittere når reklamasjonen er utbedret.' using errcode = 'P0001'; end if;
      if trim(new.signert_navn) = '' then raise exception 'Skriv kundens navn.' using errcode = 'P0001'; end if;
      new.signert_tid := now();
    elsif new.signatur = '' then
      new.signert_navn := ''; new.signert_tid := null;
    else
      new.signert_navn := old.signert_navn; new.signert_tid := old.signert_tid;
    end if;
  end if;
  new.endret := now();
  return new;
end $$;

-- Timer på reklamasjon: føres der bedriften har valgt
create or replace function public.timer_reklamasjon() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b public.bedrifter;
  rp uuid;
  r public.reklamasjoner;
begin
  select bf.* into b from public.bedrifter bf join public.ansatte a on a.bedrift_id = bf.id where a.id = new.ansatt_id;
  -- Innlogget med stempling: reklamasjonen følger med fra stemplingen
  if tg_op = 'INSERT' and new.reklamasjon_id is null and current_setting('bygglogg.stempel', true) = '1' then
    select s.reklamasjon_id into new.reklamasjon_id from public.stempling s
     where s.ansatt_id = new.ansatt_id and s.prosjekt_id is not distinct from new.prosjekt_id;
  end if;
  rp := case when b.rekl_timer = 'prosjekt' then b.reklamasjon_prosjekt_id end;
  if new.reklamasjon_id is not null then
    select * into r from public.reklamasjoner where id = new.reklamasjon_id and bedrift_id = b.id;
    if r.id is null then raise exception 'Fant ikke reklamasjonen.' using errcode = 'P0001'; end if;
    if rp is not null then new.prosjekt_id := rp;
    elsif b.rekl_timer = 'intern' then new.prosjekt_id := null;
    else new.prosjekt_id := r.prosjekt_id;
    end if;
  end if;
  if new.reklamasjon_id is not null or (rp is not null and new.prosjekt_id = rp) then
    new.fakturerbar := false;
  end if;
  return new;
end $$;

-- Påminnelse: to dager før fristen og dagen etter at den er passert (kjøres hver morgen kl. 07)
create or replace function public.reklamasjon_frist_varsle() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then return; end if;
  for r in select id from public.reklamasjoner
            where status in ('ny', 'godkjent') and frist is not null
              and (frist = current_date + 2 or frist = current_date - 1) loop
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/push',
      body := jsonb_build_object('type', 'reklamasjon', 'id', r.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;
end $$;
revoke all on function public.reklamasjon_frist_varsle() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'reklamasjon-frist') then perform cron.unschedule('reklamasjon-frist'); end if;
    perform cron.schedule('reklamasjon-frist', '0 5 * * *', 'select public.reklamasjon_frist_varsle()');
  end if;
end $$;
