-- Fakturerte timer: ordrelinjer i Visma med produktet «Arbeid» (salgsordrer, ikke tilbud).
-- «fakturert» er ferdigmeldt antall, «ikke_fakturert» ligger på ordren men er ikke fakturert ennå.
-- Fastprisjobber har ofte ingen Arbeid-linje, så de telles ikke her.

alter table public.bedrifter add column if not exists arbeid_varenr text[] not null default '{21505}';

create table public.fakturerte_timer (
  bedrift_id      smallint not null default 1 references public.bedrifter(id),
  visma_ordrenr   integer not null,
  linjenr         integer not null,
  ordredato       date,
  fakturadato     date,
  fakturanr       text not null default '',
  kunde_id        uuid references public.kunder(id) on delete set null,
  prosjekt_id     uuid references public.prosjekter(id) on delete set null,
  varenr          text not null default '',
  antall          numeric(12,2) not null default 0,
  fakturert       numeric(12,2) not null default 0,
  ikke_fakturert  numeric(12,2) not null default 0,
  pris            numeric(12,2) not null default 0,
  oppdatert       timestamptz not null default now(),
  primary key (bedrift_id, visma_ordrenr, linjenr)
);
create index fakturerte_timer_dato on public.fakturerte_timer (bedrift_id, fakturadato);
create index fakturerte_timer_prosjekt on public.fakturerte_timer (prosjekt_id);

alter table public.fakturerte_timer enable row level security;
create policy fakturerte_timer_les on public.fakturerte_timer for select to authenticated
  using (public.er_leder() and bedrift_id = public.min_bedrift());
revoke all on public.fakturerte_timer from anon, authenticated;
grant select on public.fakturerte_timer to authenticated;
