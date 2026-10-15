-- Adresse lagt inn i appen skal ikke overskrives av Visma-synken (som oppdaterer prosjektene hvert kvarter).
alter table public.prosjekter add column if not exists adresse_manuell boolean not null default false;

create or replace function public.prosjekt_adresse_vakt() returns trigger
language plpgsql as $$
begin
  -- Synken kjører som service_role: behold adressen leder har satt i appen
  if old.adresse_manuell and current_user = 'service_role' then
    new.adresse := old.adresse;
    new.adresse_manuell := true;
  end if;
  return new;
end $$;

drop trigger if exists prosjekt_adresse_vakt on public.prosjekter;
create trigger prosjekt_adresse_vakt before update on public.prosjekter
  for each row execute function public.prosjekt_adresse_vakt();
