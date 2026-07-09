-- 20260709161000_use_vault_secret_helper.sql
--
-- Refactor invoke_edge_function and notify_upcoming_votes to call
-- public.get_vault_secret(names) (added in 20260709160000) instead of
-- inlining the priority-ordered vault.decrypted_secrets lookup 3x per
-- function. Pure refactor: resolution order and fallback behavior
-- (functions_base_url: Vault then app_config; supabase_anon_key/anon_key;
-- SYNC_SECRET/sync_secret/bill-sync-api-key) is unchanged.
--
-- is_valid_bill_sync_secret is intentionally NOT refactored to use this
-- helper: it validates whether a *presented* secret matches ANY of the
-- named vault rows (EXISTS ... = p_secret), a different semantic from
-- "resolve the single best value" -- collapsing it into get_vault_secret
-- would silently narrow validation to only the top-priority name if more
-- than one of the synonym rows were ever populated with different values.
-- Left as-is to avoid a behavior change in a security-critical auth path.
--
-- Verified live: after applying, invoke_edge_function('sync-updated-bills')
-- returned HTTP 200 via net._http_response with no cron_job_errors, and no
-- function in public/vault still references vault.get_secret/delete_secret.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(endpoint TEXT, job_name TEXT DEFAULT 'daily-bill-sync')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  anon_key      TEXT;
  base_url      TEXT;
  sync_secret   TEXT;
  req_headers   JSONB;
  request_id    BIGINT;
  safe_job_name TEXT := COALESCE(job_name, 'daily-bill-sync');
  allowed_endpoints CONSTANT TEXT[] := ARRAY[
    'bulk-import-dataset',
    'sync-updated-bills',
    'votes-backfill',
    'votes-daily'
  ];
BEGIN
  IF endpoint IS NULL OR NOT (endpoint = ANY (allowed_endpoints)) THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (safe_job_name, 'Invoke Error: endpoint not allowlisted: ' || COALESCE(endpoint, '<null>'));
    RETURN;
  END IF;

  base_url := public.get_vault_secret(ARRAY['functions_base_url']);
  IF NULLIF(base_url, '') IS NULL THEN
    SELECT c.value INTO base_url
    FROM public.app_config AS c
    WHERE c.key = 'functions_base_url' AND NULLIF(c.value, '') IS NOT NULL
    LIMIT 1;
  END IF;
  IF NULLIF(base_url, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (safe_job_name, 'Invoke Error: missing functions_base_url in Vault and app_config');
    RETURN;
  END IF;

  anon_key := public.get_vault_secret(ARRAY['supabase_anon_key', 'anon_key']);
  IF NULLIF(anon_key, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (safe_job_name, 'Invoke Error: missing supabase_anon_key/anon_key');
    RETURN;
  END IF;

  sync_secret := public.get_vault_secret(ARRAY['SYNC_SECRET', 'sync_secret', 'bill-sync-api-key']);
  IF NULLIF(sync_secret, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (safe_job_name, 'Invoke Error: missing SYNC_SECRET/sync_secret/bill-sync-api-key for ' || endpoint);
    RETURN;
  END IF;

  req_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', anon_key,
    'Authorization', 'Bearer ' || sync_secret
  );

  SELECT net.http_post(
    url     := rtrim(base_url, '/') || '/' || endpoint,
    body    := '{}'::jsonb,
    headers := req_headers,
    timeout_milliseconds := 30000
  ) INTO request_id;

  IF request_id IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (safe_job_name, 'Invoke Error: ' || endpoint || ' enqueue returned null request id');
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_errors(job_name, error_message)
  VALUES (safe_job_name, 'Invoke Error: ' || COALESCE(endpoint, '<null>') || ' failed: ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_upcoming_votes(p_window_days INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url    TEXT;
  anon_key    TEXT;
  sync_secret TEXT;
  req_headers JSONB;
  request_id  BIGINT;
  enqueued    INT := 0;
  window_days INT := GREATEST(COALESCE(p_window_days, 1), 0);
  rec         RECORD;
BEGIN
  base_url := public.get_vault_secret(ARRAY['functions_base_url']);
  IF NULLIF(base_url, '') IS NULL THEN
    SELECT c.value INTO base_url
    FROM public.app_config AS c
    WHERE c.key = 'functions_base_url' AND NULLIF(c.value, '') IS NOT NULL
    LIMIT 1;
  END IF;
  IF NULLIF(base_url, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES ('notify-upcoming-votes', 'Invoke Error: missing functions_base_url in Vault and app_config');
    RETURN 0;
  END IF;

  anon_key := public.get_vault_secret(ARRAY['supabase_anon_key', 'anon_key']);
  IF NULLIF(anon_key, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES ('notify-upcoming-votes', 'Invoke Error: missing supabase_anon_key/anon_key');
    RETURN 0;
  END IF;

  sync_secret := public.get_vault_secret(ARRAY['SYNC_SECRET', 'sync_secret', 'bill-sync-api-key']);
  IF NULLIF(sync_secret, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES ('notify-upcoming-votes', 'Invoke Error: missing SYNC_SECRET/sync_secret/bill-sync-api-key');
    RETURN 0;
  END IF;

  base_url := rtrim(base_url, '/');
  req_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', anon_key,
    'Authorization', 'Bearer ' || sync_secret
  );

  FOR rec IN
    SELECT DISTINCT ON (b.id, elem->>'date')
      b.id AS bill_id,
      elem->>'date' AS event_date_str,
      COALESCE(
        NULLIF(btrim(elem->>'type'), ''),
        NULLIF(btrim(elem->>'description'), ''),
        NULLIF(btrim(elem->>'desc'), ''),
        NULLIF(btrim(elem->>'event'), ''),
        'activity'
      ) AS event_label
    FROM public.bills AS b
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(b.calendar) = 'array' THEN b.calendar ELSE '[]'::jsonb END
    ) AS elem
    WHERE elem->>'date' ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
      AND elem->>'date' >= to_char(current_date, 'YYYY-MM-DD')
      AND elem->>'date' <= to_char(current_date + window_days, 'YYYY-MM-DD')
      AND EXISTS (SELECT 1 FROM public.bookmarks AS bm WHERE bm.bill_id = b.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.push_notification_log AS l
        WHERE l.bill_id = b.id AND l.event_date::text = elem->>'date'
      )
    ORDER BY b.id, elem->>'date', event_label
  LOOP
    BEGIN
      SELECT net.http_post(
        url     := base_url || '/send-push-notifications',
        headers := req_headers,
        body    := jsonb_build_object(
          'billId', rec.bill_id,
          'eventDate', rec.event_date_str,
          'eventLabel', rec.event_label
        )
      ) INTO request_id;

      IF request_id IS NULL THEN
        INSERT INTO public.cron_job_errors(job_name, error_message)
        VALUES ('notify-upcoming-votes',
                'Invoke Error: send-push-notifications enqueue returned null for bill ' || rec.bill_id);
        CONTINUE;
      END IF;

      enqueued := enqueued + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_job_errors(job_name, error_message)
      VALUES ('notify-upcoming-votes', 'Invoke Error: bill ' || rec.bill_id || ' failed: ' || SQLERRM);
    END;
  END LOOP;

  RETURN enqueued;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_errors(job_name, error_message)
  VALUES ('notify-upcoming-votes', 'Fatal: ' || SQLERRM);
  RETURN enqueued;
END;
$$;
