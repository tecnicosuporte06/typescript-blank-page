-- Cron jobs para automações de aniversário e datas sazonais
-- Executa a cada minuto para verificar se é hora de enviar

-- Remover crons anteriores se existirem (evitar duplicatas)
DO $$
BEGIN
  PERFORM cron.unschedule('check-birthday-automations-every-1min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('check-seasonal-automations-every-1min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Birthday automations cron
SELECT cron.schedule(
  'check-birthday-automations-every-1min',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zldeaozqxjwvzgrblyrh.supabase.co/functions/v1/check-birthday-automations',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM"}'::jsonb,
      body := '{"trigger":"cron"}'::jsonb
    ) AS request_id;
  $$
);

-- Seasonal automations cron
SELECT cron.schedule(
  'check-seasonal-automations-every-1min',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zldeaozqxjwvzgrblyrh.supabase.co/functions/v1/check-seasonal-automations',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM"}'::jsonb,
      body := '{"trigger":"cron"}'::jsonb
    ) AS request_id;
  $$
);
