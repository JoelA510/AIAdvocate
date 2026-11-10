-- 20261112120000_ingestion_health_pubinfo_primary.sql
--
-- ingestion_health() for the pubinfo-primary pipeline. Replaces the function
-- from 20261110120000; report_ingestion_health(), grants and the cron job are
-- unchanged (CREATE OR REPLACE keeps the grants).
--
-- Changed:
--   legiscan_search_idle      48 h -> 9 days. getSearch is now a weekly
--                             cross-check (LEGISCAN_SEARCH_COOLDOWN_SECONDS
--                             default 6.5 days), so 48 h would fire daily.
-- Added:
--   status_refresh_stale      no refresh-bill-status run finished in 36 h
--   status_refresh_blocked    its last run hit a Cloudflare challenge
--   status_refresh_failed     its last run had write errors or matched no bill
--   status_unknown_value      pubinfo current_status values with no mapping
--   pubinfo_discovery_stale   no pubinfo discovery run finished in 36 h
--   pubinfo_discovery_blocked its last run hit a Cloudflare challenge
--   pubinfo_discovery_no_index  its last run could not load the index
--   pubinfo_discovery_awaiting_ids  admitted bills waiting > 7 days for a
--                             LegiScan id
--
-- pubinfo_discovery_stale reads 'never' until bulk-import-dataset has run
-- once with pubinfo discovery deployed (the next 10:00 UTC run); the health
-- job runs at 11:30 UTC, after it.
--
-- Rollback: re-run the ingestion_health() definition from
-- 20261110120000_ingestion_health_alerting.sql.

CREATE OR REPLACE FUNCTION public.ingestion_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pending jsonb;
  last_run jsonb;
  queue_size integer := 0;
  finished_at timestamptz;
  missing_text integer;
  missing_summary integer;
  last_search timestamptz;
  errors_24h integer;
  refresh jsonb;
  refresh_finished timestamptz;
  discovery jsonb;
  discovery_run jsonb;
  discovery_finished timestamptz;
  stale_awaiting integer := 0;
  problems jsonb := '[]'::jsonb;
BEGIN
  SELECT c.cursor INTO pending
  FROM public.ingestion_cursors AS c
  WHERE c.key LIKE 'bulk_import_search_pending:%'
  ORDER BY c.updated_at DESC
  LIMIT 1;

  last_run := pending -> 'last_verification';
  IF jsonb_typeof(pending -> 'rows') = 'array' THEN
    queue_size := jsonb_array_length(pending -> 'rows');
  END IF;
  BEGIN
    finished_at := (last_run ->> 'finished_at')::timestamptz;
  EXCEPTION WHEN others THEN
    finished_at := NULL;
  END;

  IF queue_size > 0
     AND (finished_at IS NULL OR finished_at < now() - interval '36 hours') THEN
    problems := problems || jsonb_build_object(
      'code', 'verification_stale',
      'detail', format('%s candidates queued; last verification finished %s',
        queue_size, COALESCE(finished_at::text, 'never')));
  END IF;

  IF COALESCE((last_run ->> 'blocked')::integer, 0) > 0 THEN
    problems := problems || jsonb_build_object(
      'code', 'verification_blocked',
      'detail', 'pubinfo returned a Cloudflare challenge on the last verification run');
  END IF;

  IF jsonb_typeof(last_run -> 'errors') = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(last_run -> 'errors') AS e(msg)
    WHERE e.msg LIKE 'pubinfo index unavailable%'
  ) THEN
    problems := problems || jsonb_build_object(
      'code', 'pubinfo_unavailable',
      'detail', (
        SELECT e.msg FROM jsonb_array_elements_text(last_run -> 'errors') AS e(msg)
        WHERE e.msg LIKE 'pubinfo index unavailable%' LIMIT 1));
  END IF;

  -- A run that resolved nothing: no reads at all, or every read came back
  -- `unavailable` (e.g. an archive format change). Rejections count as
  -- progress. A Cloudflare challenge is reported by verification_blocked.
  IF COALESCE((last_run ->> 'queue_before')::integer, 0) > 0
     AND COALESCE((last_run ->> 'blocked')::integer, 0) = 0
     AND COALESCE((last_run ->> 'verified')::integer, 0)
       + COALESCE((last_run ->> 'rejected')::integer, 0) = 0 THEN
    problems := problems || jsonb_build_object(
      'code', 'verification_no_progress',
      'detail', format('last run had %s queued, attempted %s, %s unavailable, resolved none',
        last_run ->> 'queue_before',
        COALESCE(last_run ->> 'attempted', '0'),
        COALESCE(last_run ->> 'unavailable', '0')));
  END IF;

  SELECT
    count(*) FILTER (WHERE b.original_text IS NULL),
    count(*) FILTER (WHERE NULLIF(BTRIM(b.summary_simple), '') IS NULL
                        OR NULLIF(BTRIM(b.summary_medium), '') IS NULL
                        OR NULLIF(BTRIM(b.summary_complex), '') IS NULL)
  INTO missing_text, missing_summary
  FROM public.bills AS b
  WHERE b.created_at < now() - interval '2 days';

  IF missing_text > 0 THEN
    problems := problems || jsonb_build_object(
      'code', 'bills_missing_text',
      'detail', format('%s bills older than 2 days have no text', missing_text));
  END IF;
  IF missing_summary > 0 THEN
    problems := problems || jsonb_build_object(
      'code', 'bills_missing_summary',
      'detail', format('%s bills older than 2 days are missing a summary level', missing_summary));
  END IF;

  SELECT max(l.created_at) INTO last_search
  FROM public.legiscan_api_call_log AS l
  WHERE l.endpoint = 'getSearch'
    AND l.created_at >= now() - interval '31 days';
  -- getSearch is a weekly cross-check since pubinfo discovery took over.
  IF last_search IS NULL OR last_search < now() - interval '9 days' THEN
    problems := problems || jsonb_build_object(
      'code', 'legiscan_search_idle',
      'detail', format('no LegiScan getSearch reservation since %s',
        COALESCE(last_search::text, 'at least 31 days')));
  END IF;

  -- Daily status refresh from pubinfo (refresh-bill-status).
  SELECT c.cursor INTO refresh
  FROM public.ingestion_cursors AS c
  WHERE c.key = 'bill_status_refresh';
  BEGIN
    refresh_finished := (refresh ->> 'finished_at')::timestamptz;
  EXCEPTION WHEN others THEN
    refresh_finished := NULL;
  END;

  IF refresh_finished IS NULL OR refresh_finished < now() - interval '36 hours' THEN
    problems := problems || jsonb_build_object(
      'code', 'status_refresh_stale',
      'detail', format('last status refresh finished %s',
        COALESCE(refresh_finished::text, 'never')));
  ELSE
    IF COALESCE((refresh ->> 'blocked')::boolean, false) THEN
      problems := problems || jsonb_build_object(
        'code', 'status_refresh_blocked',
        'detail', 'pubinfo returned a Cloudflare challenge on the last status refresh');
    END IF;
    IF COALESCE((refresh ->> 'update_errors')::integer, 0) > 0
       OR (COALESCE((refresh ->> 'tracked')::integer, 0)
             - COALESCE((refresh ->> 'without_pubinfo_id')::integer, 0) > 0
           AND COALESCE((refresh ->> 'matched')::integer, 0) = 0) THEN
      problems := problems || jsonb_build_object(
        'code', 'status_refresh_failed',
        'detail', format('last status refresh matched %s of %s bills with %s write errors',
          COALESCE(refresh ->> 'matched', '0'),
          COALESCE(refresh ->> 'tracked', '0'),
          COALESCE(refresh ->> 'update_errors', '0')));
    END IF;
    IF jsonb_typeof(refresh -> 'unknown_statuses') = 'array'
       AND jsonb_array_length(refresh -> 'unknown_statuses') > 0 THEN
      problems := problems || jsonb_build_object(
        'code', 'status_unknown_value',
        'detail', 'pubinfo current_status values with no mapping: '
          || (refresh -> 'unknown_statuses')::text);
    END IF;
  END IF;

  -- Discovery from pubinfo (bulk-import-dataset background task).
  SELECT c.cursor INTO discovery
  FROM public.ingestion_cursors AS c
  WHERE c.key LIKE 'pubinfo_discovery:%'
  ORDER BY c.updated_at DESC
  LIMIT 1;
  discovery_run := discovery -> 'last_run';
  BEGIN
    discovery_finished := (discovery_run ->> 'finished_at')::timestamptz;
  EXCEPTION WHEN others THEN
    discovery_finished := NULL;
  END;

  IF discovery_finished IS NULL OR discovery_finished < now() - interval '36 hours' THEN
    problems := problems || jsonb_build_object(
      'code', 'pubinfo_discovery_stale',
      'detail', format('last pubinfo discovery finished %s',
        COALESCE(discovery_finished::text, 'never')));
  ELSE
    IF COALESCE((discovery_run ->> 'blocked')::boolean, false) THEN
      problems := problems || jsonb_build_object(
        'code', 'pubinfo_discovery_blocked',
        'detail', 'pubinfo returned a Cloudflare challenge on the last discovery run');
    END IF;
    IF discovery_run ->> 'archive' IS NULL THEN
      problems := problems || jsonb_build_object(
        'code', 'pubinfo_discovery_no_index',
        'detail', COALESCE(discovery_run -> 'errors' ->> 0,
          'the last discovery run could not load the pubinfo index'));
    END IF;
  END IF;

  -- Admitted bills waiting more than a week for a LegiScan id.
  IF jsonb_typeof(discovery -> 'awaiting') = 'array' THEN
    SELECT count(*) INTO stale_awaiting
    FROM jsonb_array_elements(discovery -> 'awaiting') AS a(item)
    WHERE (a.item ->> 'since') ~ '^\d{4}-\d{2}-\d{2}$'
      AND (a.item ->> 'since')::date < current_date - 7;
  END IF;
  IF stale_awaiting > 0 THEN
    problems := problems || jsonb_build_object(
      'code', 'pubinfo_discovery_awaiting_ids',
      'detail', format('%s admitted bills have waited over 7 days for a LegiScan id',
        stale_awaiting));
  END IF;

  SELECT count(*) INTO errors_24h
  FROM public.cron_job_errors AS e
  WHERE e.occurred_at >= now() - interval '24 hours'
    AND e.job_name <> 'ingestion-health';

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(problems) = 0,
    'checked_at', now(),
    'problems', problems,
    'metrics', jsonb_build_object(
      'verification_queue', queue_size,
      'last_verification_finished_at', finished_at,
      'last_verification', last_run - 'errors',
      'bills_missing_text', missing_text,
      'bills_missing_summary', missing_summary,
      'last_legiscan_search_at', last_search,
      'status_refresh', refresh - 'errors' - 'samples',
      'pubinfo_discovery', discovery_run - 'errors',
      'pubinfo_discovery_pending',
        CASE WHEN jsonb_typeof(discovery -> 'pending') = 'array'
             THEN jsonb_array_length(discovery -> 'pending') ELSE 0 END,
      'pubinfo_discovery_awaiting',
        CASE WHEN jsonb_typeof(discovery -> 'awaiting') = 'array'
             THEN jsonb_array_length(discovery -> 'awaiting') ELSE 0 END,
      'cron_job_errors_24h', errors_24h
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingestion_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingestion_health() TO service_role;
