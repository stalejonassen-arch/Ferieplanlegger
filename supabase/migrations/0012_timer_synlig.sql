-- Alle ansatte ser timene som er ført på prosjekter i egen bedrift (forbruk og hvem som har vært der).
-- Interntid (uten prosjekt) ser fortsatt bare den ansatte selv og leder.
drop policy if exists timer_les on public.timer;
create policy timer_les on public.timer for select to authenticated
  using (
    ansatt_id = public.mitt_ansatt_id()
    or (public.er_leder() and bedrift_id = public.min_bedrift())
    or (prosjekt_id is not null and bedrift_id = public.min_bedrift() and public.er_ansatt())
  );
