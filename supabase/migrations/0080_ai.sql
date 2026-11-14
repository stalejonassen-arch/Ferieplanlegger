-- KI-hjelp i ByggLogg (dagbok fra tale, befaring fra bilder og tale).
-- Edge-funksjonen «ai» logger hver bruk her, og stopper når en ansatt har brukt den mye samme dag.
-- Bare tjenestenøkkelen (edge-funksjonen) leser og skriver tabellen.
create table if not exists public.ai_bruk (
  id          bigint generated always as identity primary key,
  bedrift_id  smallint not null references public.bedrifter(id),
  ansatt_id   uuid not null references public.ansatte(id) on delete cascade,
  oppgave     text not null check (length(oppgave) <= 40),
  inn_tokens  integer not null default 0,
  ut_tokens   integer not null default 0,
  tid         timestamptz not null default now()
);
create index if not exists ai_bruk_ansatt on public.ai_bruk (ansatt_id, tid desc);
alter table public.ai_bruk enable row level security;
revoke all on public.ai_bruk from anon, authenticated;
