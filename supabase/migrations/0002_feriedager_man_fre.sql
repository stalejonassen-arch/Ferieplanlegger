-- Feriedager telles mandag–fredag. Antall per år: 25 (5 uker) eller 21 (lovens minimum).
alter table public.ansatte drop constraint if exists ansatte_dager_check;
update public.ansatte set dager = 25 where dager not in (21, 25);
alter table public.ansatte add constraint ansatte_dager_check check (dager in (21, 25));
alter table public.ansatte alter column dager set default 25;
