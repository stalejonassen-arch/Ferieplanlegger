-- Leder kan slå av deler av appen bedriften ikke bruker. Ingenting slettes; det skjules bare.
alter table public.bedrifter add column if not exists moduler_av text[] not null default '{}';

create or replace function public.lagre_moduler(av text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.er_leder() then raise exception 'Bare leder kan endre hvilke deler av appen som brukes.' using errcode = 'P0001'; end if;
  update public.bedrifter
     set moduler_av = coalesce((select array_agg(distinct m order by m) from unnest(av) m
                                where m ~ '^[a-z]{2,20}$'), '{}')
   where id = public.min_bedrift();
end $$;
revoke all on function public.lagre_moduler(text[]) from public, anon;
grant execute on function public.lagre_moduler(text[]) to authenticated;
