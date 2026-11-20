-- Befaring rom for rom: hvert rom med navn, lengde, bredde, takhøyde, dører og vinduer (meter) og notat.
-- Mengdene (gulv, list, veggflate, tak, listverk) regnes ut i appen og går videre til tilbudet og rapporten.
alter table public.befaringer add column if not exists rom jsonb not null default '[]'::jsonb;
alter table public.befaringer drop constraint if exists befaringer_rom_check;
alter table public.befaringer add constraint befaringer_rom_check
  check (jsonb_typeof(rom) = 'array' and jsonb_array_length(rom) <= 60 and length(rom::text) <= 100000);
