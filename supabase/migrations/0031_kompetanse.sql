-- Kurs og kompetansebevis (stillas, arbeid i høyden, lift, truck, varme arbeider, førstehjelp, HMS-kort …).
-- Hver ansatt har sine bevis med kopi (bilde/PDF) i dokument-lageret, og gyldighet som varsles før den går ut.
-- Alle i bedriften kan se hvem som har hvilke kurs (nyttig på byggeplass); egne bevis eller leder kan endre.
create table public.kompetanse (
  id          uuid primary key default gen_random_uuid(),
  bedrift_id  smallint not null default 1 references public.bedrifter(id),
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  type        text not null default 'annet',
  navn        text not null default '',
  utsteder    text not null default '',
  utstedt     date,
  gyldig_til  date,
  sti         text,
  filnavn     text not null default '',
  merknad     text not null default '',
  opprettet   timestamptz not null default now()
);
create index kompetanse_ansatt on public.kompetanse (ansatt_id);
create index kompetanse_gyldig on public.kompetanse (bedrift_id, gyldig_til);

create or replace function public.kompetanse_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.bedrift_id := public.min_bedrift();
    if not public.er_leder() then new.ansatt_id := public.mitt_ansatt_id(); end if;
    if not exists (select 1 from public.ansatte where id = new.ansatt_id and bedrift_id = new.bedrift_id) then
      raise exception 'Ukjent ansatt.' using errcode = 'P0001';
    end if;
  else
    new.bedrift_id := old.bedrift_id; new.ansatt_id := old.ansatt_id; new.opprettet := old.opprettet;
  end if;
  return new;
end $$;
create trigger kompetanse_vakt before insert or update on public.kompetanse
  for each row execute function public.kompetanse_vakt();

alter table public.kompetanse enable row level security;
create policy kompetanse_les on public.kompetanse for select to authenticated using (bedrift_id = public.min_bedrift());
create policy kompetanse_ny on public.kompetanse for insert to authenticated with check (public.er_ansatt());
create policy kompetanse_endre on public.kompetanse for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()))
  with check (bedrift_id = public.min_bedrift());
create policy kompetanse_slett on public.kompetanse for delete to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()));
revoke all on public.kompetanse from anon;
grant select, insert, update, delete on public.kompetanse to authenticated;
