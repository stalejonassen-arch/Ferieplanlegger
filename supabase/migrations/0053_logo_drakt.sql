-- Bedriftens egen logo og firmafarger («drakt»). ByggLogg-merket står fortsatt i appen;
-- firmalogoen vises ved siden av, og fargene hentes fra logoen.
--   logo       : logoen slik den ble lastet opp (nedskalert bilde, data-URL)
--   logo_mork  : samme logo med bakgrunnen fjernet, for mørk bakgrunn (toppfeltet). Kan mangle.
--   drakt      : {"hoved": "#RRGGBB", "aksent": "#RRGGBB"}
alter table public.bedrifter add column if not exists logo text;
alter table public.bedrifter add column if not exists logo_mork text;
alter table public.bedrifter add column if not exists drakt jsonb;

alter table public.bedrifter drop constraint if exists bedrifter_logo_check;
alter table public.bedrifter add constraint bedrifter_logo_check check (
  (logo is null or (logo ~ '^data:image/(png|webp|jpeg);base64,' and length(logo) <= 400000)) and
  (logo_mork is null or (logo_mork ~ '^data:image/(png|webp);base64,' and length(logo_mork) <= 400000)));

-- Eget fargevalg «egen» = firmafargene
alter table public.ansatte drop constraint if exists ansatte_tema_check;
alter table public.ansatte add constraint ansatte_tema_check check (tema in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'egen'));

create or replace function public.sett_mitt_tema(tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if tema not in ('standard', 'byggfag', 'bfportal', 'fargerik', 'mork', 'egen') then raise exception 'Ukjent tema.' using errcode = 'P0001'; end if;
  update public.ansatte set tema = sett_mitt_tema.tema where id = public.mitt_ansatt_id();
end $$;

-- Leder lagrer logo og farger. Uten logo og farger fjernes drakten; de som brukte den, får ByggLogg-blå.
-- for_alle = true setter firmafargene på alle ansatte i bedriften (de kan bytte selv etterpå).
create or replace function public.lagre_drakt(logo text, logo_mork text, drakt jsonb, for_alle boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  farge constant text := '^#[0-9A-Fa-f]{6}$';
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre logo og farger.' using errcode = 'P0001'; end if;
  if drakt is not null and not (coalesce(drakt->>'hoved', '') ~ farge and coalesce(drakt->>'aksent', '') ~ farge) then
    raise exception 'Fargene må være på formen #RRGGBB.' using errcode = 'P0001';
  end if;
  update public.bedrifter b
     set logo = lagre_drakt.logo, logo_mork = lagre_drakt.logo_mork,
         drakt = case when lagre_drakt.drakt is null then null
                      else jsonb_build_object('hoved', upper(lagre_drakt.drakt->>'hoved'), 'aksent', upper(lagre_drakt.drakt->>'aksent')) end
   where b.id = public.min_bedrift();
  if lagre_drakt.drakt is null then
    update public.ansatte set tema = 'byggfag' where bedrift_id = public.min_bedrift() and tema = 'egen';
  elsif for_alle then
    update public.ansatte set tema = 'egen' where bedrift_id = public.min_bedrift();
  end if;
end $$;
revoke all on function public.lagre_drakt(text, text, jsonb, boolean) from public, anon;
grant execute on function public.lagre_drakt(text, text, jsonb, boolean) to authenticated;
