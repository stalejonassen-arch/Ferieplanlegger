-- Eiendomsdata til Boligmappa: dokumentasjon knyttes til en eiendom (matrikkel) og evt. bruksenhet,
-- og merkes med fag. Hentes fra Kartverket ut fra adressen, kan rettes for hånd.
alter table public.prosjekter
  add column if not exists kommunenr text not null default '',
  add column if not exists kommune text not null default '',
  add column if not exists gnr integer,
  add column if not exists bnr integer,
  add column if not exists fnr integer,
  add column if not exists snr integer,
  add column if not exists bruksenhet text not null default '',
  add column if not exists boligmappe_nr text not null default '',
  add column if not exists fag text not null default 'Tømrer';
