-- Ansattnummer som i Svenn/lønnssystemet, så lønnsgrunnlag og rapporter kan kobles direkte.
alter table public.ansatte add column ansattnr text;
create unique index ansatte_ansattnr_unik on public.ansatte (bedrift_id, ansattnr) where ansattnr is not null and ansattnr <> '';
