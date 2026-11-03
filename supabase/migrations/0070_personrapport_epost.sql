-- Personlig månedsrapport også på e-post: når leder publiserer, sendes rapporten (pent oppsatt)
-- til den ansattes e-post. Leder kan sende den på nytt fra «Personlige rapporter».
alter table public.personrapporter add column if not exists epost_sendt timestamptz;

create or replace function public.personrapport_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.publisert is not null and (tg_op = 'INSERT' or old.publisert is null)
     and exists (select 1 from pg_namespace where nspname = 'net') then
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/push',
      body := jsonb_build_object('type', 'personrapport', 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/varsle',
      body := jsonb_build_object('hendelse', 'personrapport', 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;

/** Leder: send rapporten på e-post på nytt (f.eks. etter at den er oppdatert) */
create or replace function public.send_personrapport_epost(r uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan sende rapporter.' using errcode = 'P0001'; end if;
  update public.personrapporter set epost_sendt = null
   where id = r and bedrift_id = public.min_bedrift() and publisert is not null;
  if not found then raise exception 'Fant ikke en publisert rapport.' using errcode = 'P0001'; end if;
  if exists (select 1 from pg_namespace where nspname = 'net') then
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/varsle',
      body := jsonb_build_object('hendelse', 'personrapport', 'id', r),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
end $$;
revoke all on function public.send_personrapport_epost(uuid) from public, anon;
grant execute on function public.send_personrapport_epost(uuid) to authenticated;
