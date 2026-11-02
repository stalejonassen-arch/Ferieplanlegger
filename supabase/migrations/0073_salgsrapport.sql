-- Salg i den personlige rapporten for flere enn butikk/prosjektleder og daglig leder,
-- f.eks. en snekker som ofte står i butikken. Tom (null) = som før: leder og prosjektleder får salg.
alter table public.ansatte add column if not exists i_salgsrapport boolean;
