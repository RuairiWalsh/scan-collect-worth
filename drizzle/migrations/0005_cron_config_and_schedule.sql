CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_config (key, value)
VALUES ('cron_secret', gen_random_uuid()::text);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'daily-price-refresh',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--3b86c07a-ed41-4558-abc2-55d41bf72b62.lovable.app/api/public/cron/daily-prices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);