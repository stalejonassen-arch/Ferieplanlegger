-- E-postvarsler og påminnelser. Krever utvidelsene pg_net og pg_cron (finnes i Supabase).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Logg over sendte varsler, så ingenting sendes to ganger
create table public.varsel_logg (
  soknad_id  uuid not null references public.soknader(id) on delete cascade,
  hendelse   text not null,
  sendt      timestamptz not null default now(),
  primary key (soknad_id, hendelse)
);
create table public.paaminnelse_logg (
  runde  text primary key,            -- f.eks. 2027-03
  sendt  timestamptz not null default now()
);
alter table public.varsel_logg enable row level security;
alter table public.paaminnelse_logg enable row level security;
revoke all on public.varsel_logg, public.paaminnelse_logg from anon, authenticated;

-- Kaller varslingsfunksjonen når en ansatt søker, og når leder godkjenner eller avslår
create or replace function public.soknad_varsel() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hendelse text;
begin
  if tg_op = 'INSERT' and new.status = 'venter' and not public.er_leder() then
    hendelse := 'ny';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('godkjent', 'avslatt') then
    hendelse := 'behandlet';
  end if;
  if hendelse is not null then
    perform net.http_post(
      url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/varsle',
      body := jsonb_build_object('id', new.id, 'hendelse', hendelse),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end $$;

drop trigger if exists soknad_varsel on public.soknader;
create trigger soknad_varsel
  after insert or update on public.soknader
  for each row execute function public.soknad_varsel();

-- Påminnelse om hovedferie kl. 08:00 norsk tid 1. mars, 1. april og 1. mai
select cron.schedule(
  'paaminnelse-hovedferie',
  '0 7 1 3,4,5 *',
  $$ select net.http_post(
       url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/paaminnelse',
       body := '{}'::jsonb,
       headers := '{"Content-Type": "application/json"}'::jsonb
     ) $$
);
