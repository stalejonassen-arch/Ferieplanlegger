-- Tilleggsarbeid som underprosjekt: timer kan føres på et tillegg (f.eks. «Råteskade tak»)
-- på samme prosjekt. Timene står fortsatt på prosjektnummeret i Visma, merket med tillegget,
-- så faktiske timer kan sammenlignes med anslaget og tillegget faktureres for seg.
alter table public.timer add column if not exists tillegg_id uuid references public.tillegg(id) on delete set null;
create index if not exists timer_tillegg on public.timer (tillegg_id) where tillegg_id is not null;
alter table public.stempling add column if not exists tillegg_id uuid references public.tillegg(id) on delete set null;

create or replace function public.timer_tillegg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t public.tillegg;
begin
  -- Innlogget med stempling: tillegget følger med fra stemplingen
  if tg_op = 'INSERT' and new.tillegg_id is null and current_setting('bygglogg.stempel', true) = '1' then
    select s.tillegg_id into new.tillegg_id from public.stempling s
      join public.tillegg x on x.id = s.tillegg_id and x.prosjekt_id = new.prosjekt_id
     where s.ansatt_id = new.ansatt_id;
  end if;
  if new.tillegg_id is null then return new; end if;
  if new.reklamasjon_id is not null then
    raise exception 'Timer kan ikke gjelde både reklamasjon og tilleggsarbeid.' using errcode = 'P0001';
  end if;
  select * into t from public.tillegg where id = new.tillegg_id;
  if t.id is null or t.prosjekt_id is distinct from new.prosjekt_id then
    raise exception 'Tilleggsarbeidet hører ikke til dette prosjektet.' using errcode = 'P0001';
  end if;
  if t.status = 'avvist' and (tg_op = 'INSERT' or new.tillegg_id is distinct from old.tillegg_id) then
    raise exception 'Tilleggsarbeidet er avvist. Før timene på hovedjobben.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists timer_tillegg on public.timer;
create trigger timer_tillegg before insert or update on public.timer
  for each row execute function public.timer_tillegg();

/** Velg hvilket tilleggsarbeid du jobber med mens du er logget inn (null = hovedjobben) */
create or replace function public.stemple_tillegg(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.stempling;
begin
  select * into s from public.stempling where ansatt_id = public.mitt_ansatt_id();
  if s.ansatt_id is null then raise exception 'Du er ikke logget inn.' using errcode = 'P0001'; end if;
  if t is not null and not exists (select 1 from public.tillegg x where x.id = t and x.prosjekt_id = s.prosjekt_id and x.status <> 'avvist') then
    raise exception 'Tilleggsarbeidet hører ikke til prosjektet du er logget inn på.' using errcode = 'P0001';
  end if;
  update public.stempling set tillegg_id = t where ansatt_id = s.ansatt_id;
end $$;
revoke all on function public.stemple_tillegg(uuid) from public, anon;
grant execute on function public.stemple_tillegg(uuid) to authenticated;

-- Bytter du prosjekt mens du er logget inn, gjelder ikke tillegget lenger
create or replace function public.stempling_tillegg_nullstill() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.prosjekt_id is distinct from old.prosjekt_id then new.tillegg_id := null; end if;
  return new;
end $$;
drop trigger if exists stempling_tillegg_nullstill on public.stempling;
create trigger stempling_tillegg_nullstill before update on public.stempling
  for each row execute function public.stempling_tillegg_nullstill();
