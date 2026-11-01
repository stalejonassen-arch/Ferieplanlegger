-- Salg per selger: de personlige rapportene til butikk/prosjektleder viser selgerens eget salg
-- (alt salg i måneden, pluss vinduer, dører og takplater) i stedet for hele bedriftens.
-- Selger er «Selger» på ordren i Visma (ansattnummer), med navnet fra Visma.
-- Kategorien «*» er alt fakturert salg for selgeren, uansett kategori.
alter table public.salg_kategori_mnd add column if not exists selger_nr integer not null default 0;
alter table public.salg_kategori_mnd add column if not exists selger_navn text not null default '';
alter table public.salg_kategori_mnd drop constraint if exists salg_kategori_mnd_pkey;
alter table public.salg_kategori_mnd add primary key (bedrift_id, aar, mnd, kategori, selger_nr);

-- Ny kategori «Dører», rett etter vinduer (så skyvedører fortsatt telles som vinduer)
update public.bedrifter b
   set dg_kategorier = (
     select jsonb_agg(e order by i) from (
       select e, i::numeric i from jsonb_array_elements(b.dg_kategorier) with ordinality t(e, i)
       union all
       select '{"id": "dorer", "navn": "Dører",
         "med":  ["dør", "ytterdør", "innerdør", "balkongdør", "terrassedør", "garasjeport", "boddør", "branndør"],
         "uten": ["vrider", "håndtak", "stopper", "lås", "pumpe", "dørlist", "terskel", "beslag", "hengsel", "hengsle", "karmlist", "frakt", "deponer", "maling", "pensel", "dørfjær", "dørskilt", "dørmatte"]}'::jsonb,
         coalesce((select i from jsonb_array_elements(b.dg_kategorier) with ordinality t(e, i) where e->>'id' = 'vinduer'), 0) + 0.5
     ) z)
 where not exists (select 1 from jsonb_array_elements(b.dg_kategorier) x where x->>'id' = 'dorer');

-- Tallene hentes på nytt (fra og med i fjor) med selger ved neste synk
delete from public.salg_kategori_mnd;
