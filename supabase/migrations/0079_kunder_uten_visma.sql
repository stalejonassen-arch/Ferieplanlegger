-- Kunder uten Visma: leder og prosjektleder kan rette navn, telefon, e-post og adresse på kunder som er
-- laget i ByggLogg (kunder fra Visma oppdateres derfra og endres der).
drop policy if exists kunder_planlegger_endre on public.kunder;
create policy kunder_planlegger_endre on public.kunder for update to authenticated
  using (public.er_planlegger() and bedrift_id = public.min_bedrift() and visma_nr is null)
  with check (public.er_planlegger() and bedrift_id = public.min_bedrift() and visma_nr is null);
