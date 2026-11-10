-- 20261111120000_bill_status_refresh.sql
--
-- Status metadata from the Legislature's pubinfo archive (plan:
-- docs/plans/2026-11-10-pubinfo-primary-plan.md, phase 2).
--
-- 1. bills.pubinfo_bill_id: the Legislature's id for the bill
--    ("202520260AB1568"), generated from state_link, so one row is linked to
--    both providers: bills.id stays LegiScan's bill_id, pubinfo_bill_id is the
--    Legislature's. Unique, so a bill can never be tracked twice once
--    discovery also reads pubinfo. No backfill statement: a stored generated
--    column is computed for existing rows when it is added (182 rows).
-- 2. invoke_edge_function: 'refresh-bill-status' added to the allowlist.
--    Otherwise unchanged from 20260709161000.
-- 3. cron job 'bill-status-refresh' at 10:40 UTC, after the 10:00 refresh has
--    inserted and summarised new bills.
--
-- Pre-check (expect no rows; a duplicate would fail the unique index):
--   select substring(state_link from 'bill_id=([0-9]{9}[A-Z]+[0-9]+)'), count(*)
--   from public.bills group by 1 having count(*) > 1 and
--     substring(state_link from 'bill_id=([0-9]{9}[A-Z]+[0-9]+)') is not null;
--
-- Rollback:
--   select cron.unschedule('bill-status-refresh');
--   drop index if exists public.bills_pubinfo_bill_id_key;
--   alter table public.bills drop column if exists pubinfo_bill_id;
--   -- and re-run invoke_edge_function from 20260709161000 to drop the
--   -- allowlist entry (harmless to leave).

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS pubinfo_bill_id text
  GENERATED ALWAYS AS (
    substring(state_link from 'bill_id=([0-9]{9}[A-Z]+[0-9]+)')
  ) STORED;

COMMENT ON COLUMN public.bills.pubinfo_bill_id IS
  'California Legislature (pubinfo/leginfo) bill id, e.g. 202520260AB1568. Generated from state_link. bills.id is the LegiScan bill_id.';

CREATE UNIQUE INDEX IF NOT EXISTS bills_pubinfo_bill_id_key
  ON public.bills (pubinfo_bill_id)
  WHERE pubinfo_bill_id IS NOT NULL;

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
    'refresh-bill-status',
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bill-status-refresh') THEN
    PERFORM cron.unschedule('bill-status-refresh');
  END IF;
END;
$$;

SELECT cron.schedule(
  'bill-status-refresh',
  '40 10 * * *',
  $cron$SELECT public.invoke_edge_function('refresh-bill-status', 'bill-status-refresh')$cron$
);
