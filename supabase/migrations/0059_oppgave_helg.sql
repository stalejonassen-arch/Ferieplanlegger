-- Arbeid i planen gjelder bare hverdager (ikke lørdag, søndag og helligdager), med mindre det er krysset av for helg.
alter table public.oppgaver add column if not exists helg boolean not null default false;
