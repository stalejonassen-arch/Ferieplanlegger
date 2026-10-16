-- Push-varsel til den ansatte når hen får nytt arbeid i planen (ny oppgave, eller lagt til på en oppgave).
-- Edge-funksjonen push sender bare til dem som ikke har fått varsel om oppgaven før.
drop trigger if exists oppgave_push on public.oppgaver;
create trigger oppgave_push after insert or update of ansatte on public.oppgaver
  for each row when (cardinality(new.ansatte) > 0)
  execute function public.push_varsel('oppgave');
