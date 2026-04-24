-- Ensure pg_cron invokes sync-updated-bills with the shared secret header.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(endpoint TEXT, job_name TEXT DEFAULT 'daily-bill-sync')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  status_code  INT;
  anon_key     TEXT;
  base_url     TEXT;
  sync_secret  TEXT;
  req_headers  JSONB;
BEGIN
  -- prefer Vault, then app_config
  base_url := COALESCE(
    vault.get_secret('functions_base_url'),
    (SELECT value FROM public.app_config WHERE key = 'functions_base_url' LIMIT 1)
  );

  IF base_url IS NULL OR base_url = '' THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: missing functions_base_url (Vault and app_config empty)');
    RETURN;
  END IF;

  anon_key := vault.get_secret('supabase_anon_key');
  IF anon_key IS NULL OR anon_key = '' THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: missing supabase_anon_key');
    RETURN;
  END IF;

  req_headers := jsonb_build_object('Content-Type','application/json','apikey', anon_key);

  IF endpoint = 'sync-updated-bills' THEN
    sync_secret := COALESCE(
      vault.get_secret('sync_secret'),
      (SELECT value FROM public.app_config WHERE key = 'sync_secret' LIMIT 1)
    );

    IF sync_secret IS NULL OR sync_secret = '' THEN
      INSERT INTO public.cron_job_errors(job_name, error_message)
      VALUES (job_name, 'Invoke Error: missing sync_secret for sync-updated-bills');
      RETURN;
    END IF;

    req_headers := req_headers || jsonb_build_object('authorization', 'Bearer ' || sync_secret);
  END IF;

  -- normalize final URL
  base_url := rtrim(base_url, '/');

  SELECT status INTO status_code
  FROM net.http_post(
    url     := base_url || '/' || endpoint,
    headers := req_headers::text
  );

  IF status_code <> 200 THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: ' || endpoint || ' returned status ' || status_code);
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: ' || endpoint || ' failed: ' || SQLERRM);
END;
$$;
