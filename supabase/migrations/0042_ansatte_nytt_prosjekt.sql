-- Alle ansatte kan opprette prosjekt (og ny kunde) i appen. Bare prosjekter som ikke kommer fra Visma,
-- og bare i egen bedrift. Endre, avslutte, slette og koble til Visma er fortsatt bare for leder.
create policy prosjekter_ansatt_ny on public.prosjekter for insert to authenticated
  with check (public.er_ansatt() and bedrift_id = public.min_bedrift() and visma_nr is null
    and not fastpris and not fakturert_full and aktiv);
create policy kunder_ansatt_ny on public.kunder for insert to authenticated
  with check (public.er_ansatt() and bedrift_id = public.min_bedrift() and visma_nr is null);
