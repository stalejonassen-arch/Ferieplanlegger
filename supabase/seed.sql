-- Startdata for N L Austnes AS. Kjøres én gang etter 0001_init.sql.
-- Ansatte uten e-post vises i kalenderen, men kan ikke logge inn før leder
-- legger inn e-postadressen under «Oppsett» i appen.

insert into public.avdelinger (navn, maks_borte, rekkefolge) values
  ('Butikk', 1, 1),
  ('Snekker', 2, 2),
  ('Kjøkken og Interiør', 1, 3),
  ('Allround / lager', 1, 4);

insert into public.ansatte (navn, epost, avdeling_id, rolle, rekkefolge)
select v.navn, v.epost, a.id, v.rolle, v.rekkefolge
from (values
  ('Ståle',            'stale.jonassen@austnes.no', 'Butikk',              'leder',  1),
  ('Butikk 2 (navn)',  null,                        'Butikk',              'ansatt', 2),
  ('Karianne',         null,                        'Kjøkken og Interiør', 'ansatt', 1),
  ('Mads Kjerstad',    null,                        'Snekker',             'ansatt', 1),
  ('Snekker 2 (navn)', null,                        'Snekker',             'ansatt', 2),
  ('Snekker 3 (navn)', null,                        'Snekker',             'ansatt', 3),
  ('Snekker 4 (navn)', null,                        'Snekker',             'ansatt', 4),
  ('Snekker 5 (navn)', null,                        'Snekker',             'ansatt', 5),
  ('Jim Kato',         null,                        'Allround / lager',    'ansatt', 1)
) as v(navn, epost, avdeling, rolle, rekkefolge)
join public.avdelinger a on a.navn = v.avdeling;
