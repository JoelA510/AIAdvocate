-- Adds bill status metadata columns and refresh automation helpers.
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS status_text TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS status_date DATE;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS progress JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS calendar JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS history JSONB;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(endpoint TEXT, job_name TEXT DEFAULT 'daily-bill-sync')
RETURNS VOID AS $$
DECLARE
  status_code INT;
  anon_key TEXT;
BEGIN
  anon_key := vault.get_secret('supabase_anon_key');
  SELECT status INTO status_code
  FROM net.http_post(
    url := 'https://klpwiiszmzzfvlbfsjrd.supabase.co/functions/v1/' || endpoint,
    headers := '{"Content-Type": "application/json", "apikey": "' || anon_key || '"}'
  );
  IF status_code != 200 THEN
    INSERT INTO public.cron_job_errors (job_name, error_message)
    VALUES (job_name, 'Invoke Error: Edge Function ' || endpoint || ' returned status ' || status_code);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.invoke_sync_updated_bills() RETURNS VOID AS $$
BEGIN
  PERFORM public.invoke_edge_function('sync-updated-bills', 'daily-bill-sync');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.invoke_full_legislative_refresh() RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  PERFORM public.invoke_edge_function('bulk-import-dataset', 'daily-bill-sync');
  FOR i IN 1..5 LOOP
    PERFORM public.invoke_edge_function('sync-updated-bills', 'daily-bill-sync');
  END LOOP;
  PERFORM public.invoke_edge_function('sync-legislators-and-votes', 'daily-bill-sync');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-bill-sync');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

SELECT cron.schedule('daily-bill-sync', '0 10 * * *', 'SELECT public.invoke_full_legislative_refresh()');

SELECT cron.schedule('cleanup-cron-job-errors', '0 0 * * 0', 'SELECT public.cleanup_old_cron_job_errors()')
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-cron-job-errors'
);
