-- 20260618150000_fix_invoke_edge_function_vault_resolution.sql
--
-- Restore the scheduler -> DB -> pg_net -> Edge invocation path.
--
-- Production verification (2026-06-18) found public.invoke_edge_function(text,text)
-- calling vault.get_secret(...) -- a helper that does NOT exist in this project's
-- Vault schema (AGENTS.md §6). Every cron ingestion call (daily-bill-sync, via
-- invoke_full_legislative_refresh, and votes-daily) therefore throws
-- "function vault.get_secret(unknown) does not exist", is caught, logged to
-- cron_job_errors, and RETURNs before net.http_post -- so bills/votes/calendar
-- have been frozen and net._http_response stays empty.
--
-- This regression was introduced by
-- 20260616200000_extend_cron_auth_to_votes_and_bulk_import (which extended the
-- bearer to all endpoints but reverted secret resolution back to vault.get_secret),
-- undoing 20260424103000_restore_edge_invocation_and_summary_selector (which read
-- vault.decrypted_secrets directly). A second latent defect: that live version only
-- resolves SYNC_SECRET/sync_secret, but this project's Vault holds the shared secret
-- under 'bill-sync-api-key' only.
--
-- Fix (CREATE OR REPLACE; the applied 20260616200000 is left untouched):
--   * resolve functions_base_url / anon_key / sync_secret by reading
--     vault.decrypted_secrets DIRECTLY (+ app_config fallback for the non-secret
--     base URL) -- the pattern already proven by notify_upcoming_votes and
--     is_valid_bill_sync_secret;
--   * include 'bill-sync-api-key' in the sync-secret name list;
--   * send Authorization: Bearer <sync_secret> for EVERY allowlisted endpoint (all
--     cron edge functions run verify_jwt=false and authorize in code via
--     is_valid_bill_sync_secret, which accepts bill-sync-api-key) -- never anon_key.
-- No secret VALUES are referenced literally. SECURITY DEFINER + explicit search_path.
--
-- Rollback: re-apply the body from
-- 20260616200000_extend_cron_auth_to_votes_and_bulk_import.sql.

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

  -- functions_base_url: Vault first, then app_config (non-secret URL config).
  SELECT v.decrypted_secret INTO base_url
  FROM vault.decrypted_secrets AS v
  WHERE v.name = 'functions_base_url' AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

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

  SELECT v.decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets AS v
  WHERE v.name IN ('supabase_anon_key', 'anon_key') AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY CASE v.name WHEN 'supabase_anon_key' THEN 0 WHEN 'anon_key' THEN 1 ELSE 2 END,
           v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

  IF NULLIF(anon_key, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (safe_job_name, 'Invoke Error: missing supabase_anon_key/anon_key');
    RETURN;
  END IF;

  -- Shared scheduler secret. Every cron edge function authorizes in code via
  -- is_valid_bill_sync_secret(), which accepts any of these names; this project
  -- stores it under 'bill-sync-api-key'.
  SELECT v.decrypted_secret INTO sync_secret
  FROM vault.decrypted_secrets AS v
  WHERE v.name IN ('SYNC_SECRET', 'sync_secret', 'bill-sync-api-key') AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY CASE v.name WHEN 'SYNC_SECRET' THEN 0 WHEN 'sync_secret' THEN 1 WHEN 'bill-sync-api-key' THEN 2 ELSE 3 END,
           v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

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

NOTIFY pgrst, 'reload schema';
