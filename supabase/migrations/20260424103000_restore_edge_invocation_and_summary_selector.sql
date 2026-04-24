-- Restore scheduler -> DB wrapper -> pg_net invocation without vault.get_secret dependency.
-- Preserve generated summaries/embeddings during source bill upserts.
-- Repair summary candidate selection.
-- Current as of 2026-04-24.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(
  endpoint TEXT,
  job_name TEXT DEFAULT 'daily-bill-sync'
)
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
    VALUES (
      safe_job_name,
      'Invoke Error: endpoint not allowlisted: ' || COALESCE(endpoint, '<null>')
    );
    RETURN;
  END IF;

  -- Prefer Vault. Fall back to app_config for non-secret URL config.
  SELECT v.decrypted_secret
    INTO base_url
  FROM vault.decrypted_secrets AS v
  WHERE v.name = 'functions_base_url'
    AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

  IF NULLIF(base_url, '') IS NULL THEN
    SELECT c.value
      INTO base_url
    FROM public.app_config AS c
    WHERE c.key = 'functions_base_url'
      AND NULLIF(c.value, '') IS NOT NULL
    LIMIT 1;
  END IF;

  IF NULLIF(base_url, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (
      safe_job_name,
      'Invoke Error: missing functions_base_url in Vault and app_config'
    );
    RETURN;
  END IF;

  SELECT v.decrypted_secret
    INTO anon_key
  FROM vault.decrypted_secrets AS v
  WHERE v.name IN ('supabase_anon_key', 'anon_key')
    AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY
    CASE v.name
      WHEN 'supabase_anon_key' THEN 0
      WHEN 'anon_key' THEN 1
      ELSE 2
    END,
    v.updated_at DESC NULLS LAST,
    v.created_at DESC NULLS LAST
  LIMIT 1;

  IF NULLIF(anon_key, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (
      safe_job_name,
      'Invoke Error: missing supabase_anon_key/anon_key'
    );
    RETURN;
  END IF;

  req_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', anon_key
  );

  IF endpoint = 'sync-updated-bills' THEN
    SELECT v.decrypted_secret
      INTO sync_secret
    FROM vault.decrypted_secrets AS v
    WHERE v.name IN ('SYNC_SECRET', 'sync_secret', 'bill-sync-api-key')
      AND NULLIF(v.decrypted_secret, '') IS NOT NULL
    ORDER BY
      CASE v.name
        WHEN 'SYNC_SECRET' THEN 0
        WHEN 'sync_secret' THEN 1
        WHEN 'bill-sync-api-key' THEN 2
        ELSE 3
      END,
      v.updated_at DESC NULLS LAST,
      v.created_at DESC NULLS LAST
    LIMIT 1;

    IF NULLIF(sync_secret, '') IS NULL THEN
      INSERT INTO public.cron_job_errors(job_name, error_message)
      VALUES (
        safe_job_name,
        'Invoke Error: missing SYNC_SECRET/sync_secret/bill-sync-api-key for sync-updated-bills'
      );
      RETURN;
    END IF;

    req_headers := req_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || sync_secret
    );
  ELSE
    req_headers := req_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || anon_key
    );
  END IF;

  SELECT net.http_post(
    url := rtrim(base_url, '/') || '/' || endpoint,
    body := '{}'::jsonb,
    headers := req_headers,
    timeout_milliseconds := 30000
  )
  INTO request_id;

  IF request_id IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (
      safe_job_name,
      'Invoke Error: ' || endpoint || ' enqueue returned null request id'
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (
      safe_job_name,
      'Invoke Error: ' || COALESCE(endpoint, '<null>') || ' failed: ' || SQLERRM
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.invoke_sync_updated_bills()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invoke_edge_function('sync-updated-bills', 'daily-bill-sync');
END;
$$;


CREATE OR REPLACE FUNCTION public.sync_updated_bills()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invoke_edge_function('sync-updated-bills', 'daily-bill-sync');
END;
$$;


-- Keep this ID-returning version only if the existing function result is TABLE(id bigint).
CREATE OR REPLACE FUNCTION public.get_bills_needing_summaries()
RETURNS TABLE (id BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id
  FROM public.bills AS b
  WHERE b.summary_ok IS DISTINCT FROM TRUE
     OR b.summary_simple IS NULL
     OR b.summary_medium IS NULL
     OR b.summary_complex IS NULL
     OR b.summary_simple ILIKE 'AI_SUMMARY_FAILED%'
     OR b.summary_simple ~* '^[[:space:]]*Placeholder[[:space:]]+'
  ORDER BY b.id;
$$;


CREATE OR REPLACE FUNCTION public.upsert_bill_and_translation(bill JSONB, tr JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF bill IS NULL THEN
    RAISE EXCEPTION 'bill payload is required';
  END IF;

  IF NULLIF(bill->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'bill.id is required';
  END IF;

  INSERT INTO public.bills (
    id,
    bill_number,
    title,
    description,
    status,
    status_text,
    status_date,
    state_link,
    change_hash,
    original_text,
    original_text_formatted,
    summary_simple,
    summary_medium,
    summary_complex,
    summary_ok,
    summary_len_simple,
    summary_hash,
    progress,
    calendar,
    history,
    embedding
  )
  SELECT
    (bill->>'id')::BIGINT,
    bill->>'bill_number',
    bill->>'title',
    bill->>'description',
    NULLIF(bill->>'status', ''),
    bill->>'status_text',
    NULLIF(bill->>'status_date', '')::DATE,
    bill->>'state_link',
    bill->>'change_hash',
    bill->>'original_text',
    bill->>'original_text_formatted',
    bill->>'summary_simple',
    bill->>'summary_medium',
    bill->>'summary_complex',
    NULLIF(bill->>'summary_ok', '')::BOOLEAN,
    NULLIF(bill->>'summary_len_simple', '')::INTEGER,
    bill->>'summary_hash',
    COALESCE(bill->'progress', '[]'::jsonb),
    COALESCE(bill->'calendar', '[]'::jsonb),
    COALESCE(bill->'history', '[]'::jsonb),
    CASE
      WHEN bill ? 'embedding'
       AND NULLIF(bill->>'embedding', '') IS NOT NULL
      THEN (bill->>'embedding')::vector
      ELSE NULL
    END
  ON CONFLICT (id) DO UPDATE SET
    bill_number = EXCLUDED.bill_number,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    status_text = EXCLUDED.status_text,
    status_date = EXCLUDED.status_date,
    state_link = EXCLUDED.state_link,
    change_hash = EXCLUDED.change_hash,
    original_text = EXCLUDED.original_text,
    original_text_formatted = EXCLUDED.original_text_formatted,
    progress = EXCLUDED.progress,
    calendar = EXCLUDED.calendar,
    history = EXCLUDED.history;

  IF tr IS NOT NULL THEN
    INSERT INTO public.bill_translations (
      bill_id,
      language_code,
      summary_simple,
      summary_medium,
      summary_complex,
      updated_at
    )
    VALUES (
      (tr->>'bill_id')::BIGINT,
      tr->>'language_code',
      tr->>'summary_simple',
      tr->>'summary_medium',
      tr->>'summary_complex',
      COALESCE(NULLIF(tr->>'updated_at', '')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (bill_id, language_code) DO UPDATE SET
      summary_simple = EXCLUDED.summary_simple,
      summary_medium = EXCLUDED.summary_medium,
      summary_complex = EXCLUDED.summary_complex,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;


-- Patch the broken secret manager without exposing secret values.
-- This intentionally allows only service_role RPC context.
CREATE OR REPLACE FUNCTION public.manage_bill_sync_secret(new_secret TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_secret TEXT;
  existing_secret_id UUID;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'manage_bill_sync_secret requires service_role';
  END IF;

  clean_secret := NULLIF(BTRIM(new_secret), '');

  IF clean_secret IS NULL THEN
    RAISE EXCEPTION 'new_secret is required';
  END IF;

  SELECT v.id
    INTO existing_secret_id
  FROM vault.decrypted_secrets AS v
  WHERE v.name = 'bill-sync-api-key'
  ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

  IF existing_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      clean_secret,
      'bill-sync-api-key',
      'API key for daily bill sync operation'
    );
  ELSE
    PERFORM vault.update_secret(
      existing_secret_id,
      clean_secret,
      'bill-sync-api-key',
      'API key for daily bill sync operation'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manage_bill_sync_secret(TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.manage_bill_sync_secret(TEXT)
TO service_role;


-- Set search_path on known SECURITY DEFINER functions if present.
DO $$
BEGIN
  IF to_regprocedure('public.cleanup_expired_location_cache()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.cleanup_expired_location_cache() SET search_path = public';
  END IF;

  IF to_regprocedure('public.cleanup_old_cron_job_errors()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.cleanup_old_cron_job_errors() SET search_path = public';
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.handle_new_user() SET search_path = public';
  END IF;

  IF to_regprocedure('public.invoke_full_legislative_refresh()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.invoke_full_legislative_refresh() SET search_path = public';
  END IF;

  IF to_regprocedure('public.invoke_sync_updated_bills()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.invoke_sync_updated_bills() SET search_path = public';
  END IF;

  IF to_regprocedure('public.sync_updated_bills()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.sync_updated_bills() SET search_path = public';
  END IF;

  IF to_regprocedure('public.get_bills_needing_summaries()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_bills_needing_summaries() SET search_path = public';
  END IF;

  IF to_regprocedure('public.manage_bill_sync_secret(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.manage_bill_sync_secret(text) SET search_path = public';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
