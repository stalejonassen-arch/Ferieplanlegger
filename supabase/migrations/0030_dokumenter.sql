-- Prosjektdokumenter: alle filer på et prosjekt (FDV, sjekklister, tegninger, tilbud/kontrakt, annet).
-- Kategori styrer hva som følger med sluttdokumentasjonen til kunden (FDV, sjekklister og tegninger).
alter table public.fdv_dok add column if not exists kategori text not null default 'fdv'
  check (kategori in ('fdv', 'sjekkliste', 'tegning', 'kontrakt', 'annet'));
update public.fdv_dok set kategori = 'sjekkliste'
  where kategori = 'fdv' and navn ~* '(sjekkliste|egenkontroll|samsvar|kontrolliste|checklist)';
-- Word og Excel i tillegg til PDF og bilder
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets set allowed_mime_types = array[
      'application/pdf', 'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'
    ] where id = 'dokumenter';
  end if;
end $$;

-- Kategori kan endres av leder eller den som lastet opp
create policy fdv_endre on public.fdv_dok for update to authenticated
  using (bedrift_id = public.min_bedrift() and (public.er_leder() or ansatt_id = public.mitt_ansatt_id()))
  with check (bedrift_id = public.min_bedrift());
grant update (kategori) on public.fdv_dok to authenticated;
