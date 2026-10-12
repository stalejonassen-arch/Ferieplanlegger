-- Byggfag-blå er standardoppsettet for alle (også Karianne). Andre tema kan fortsatt velges i fargemenyen.
alter table public.ansatte alter column tema set default 'byggfag';
update public.ansatte set tema = 'byggfag';
