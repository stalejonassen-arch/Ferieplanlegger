-- Henter kunder og prosjekter fra Visma Business NXT hvert kvarter, kl. 06–22.
select cron.schedule(
  'visma-sync',
  '*/15 4-20 * * *',
  $$ select net.http_post(
       url := 'https://xsetojjfpxyatmeozrzh.supabase.co/functions/v1/visma-sync',
       body := '{}'::jsonb,
       headers := '{"Content-Type": "application/json"}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
