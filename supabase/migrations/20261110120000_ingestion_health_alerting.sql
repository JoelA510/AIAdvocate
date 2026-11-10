-- 20261110120000_ingestion_health_alerting.sql
--
-- Daily ingestion health check with alerting.
--
-- Bill text and search verification now come from the Legislature's pubinfo
-- archive first (#95, #96), with LegiScan as the fallback. Both degrade
-- quietly: a Cloudflare challenge on the archive host, a format change, or a
-- LegiScan outage shows up only as a growing queue or bills without text. This
-- adds a check that runs in the database itself (pg_cron), so it still fires
-- when the Edge Functions are not running at all.
--
--   public.ingestion_health()         -> jsonb {ok, problems[], metrics}
--   public.report_ingestion_health()  -> runs the check; on problems, writes
--     one cron_job_errors row (job 'ingestion-health') and, when the Vault
--     secret 'ingestion_alert_sentry_dsn' holds a Sentry DSN, posts one Sentry
--     error event per problem through pg_net. Each problem has its own
--     fingerprint, so Sentry opens one issue per kind of failure and its
--     existing "high priority issues" alert emails on the first occurrence.
--   cron job 'ingestion-health' at 11:30 UTC, after the 10:00 refresh and its
--     background verification.
--
-- Checks (thresholds below; all read-only):
--   verification_stale        queue non-empty, no verification run in 36 h
--   verification_blocked      last run hit a Cloudflare challenge on pubinfo
--   pubinfo_unavailable       last run could not load the pubinfo index
--   verification_no_progress  last run had a queue but resolved nothing
--                             (no reads, or every read unavailable)
--   bills_missing_text        bills older than 2 days with no text
--   bills_missing_summary     bills older than 2 days missing any English
--                             summary level (simple, medium, complex)
--   legiscan_search_idle      no LegiScan getSearch reservation in 48 h
--
-- Setup after applying (optional; without it alerts go to cron_job_errors only):
--   select vault.create_secret('<ai-advocate Sentry DSN>', 'ingestion_alert_sentry_dsn');
--   select public.report_ingestion_health(true);  -- sends one test event
--
-- Rollback:
--   select cron.unschedule('ingestion-health');
--   drop function public.report_ingestion_health(boolean);
--   drop function public.ingestion_health();

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
  IF last_search IS NULL OR last_search < now() - interval '48 hours' THEN
    problems := problems || jsonb_build_object(
      'code', 'legiscan_search_idle',
      'detail', format('no LegiScan getSearch reservation since %s',
        COALESCE(last_search::text, 'at least 31 days')));
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
      'cron_job_errors_24h', errors_24h
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_ingestion_health(
  p_send_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  health jsonb := public.ingestion_health();
  problems jsonb := health -> 'problems';
  dsn text;
  dsn_parts text[];
  problem jsonb;
  sent integer := 0;
BEGIN
  IF jsonb_array_length(problems) = 0 AND NOT p_send_test THEN
    RETURN health || jsonb_build_object('alerted', false);
  END IF;

  IF jsonb_array_length(problems) > 0 THEN
    INSERT INTO public.cron_job_errors (job_name, error_message)
    VALUES (
      'ingestion-health',
      'Ingestion health: ' || (
        SELECT string_agg((p ->> 'code') || ' (' || (p ->> 'detail') || ')', '; ')
        FROM jsonb_array_elements(problems) AS p
      )
    );
  END IF;

  IF p_send_test THEN
    problems := problems || jsonb_build_object(
      'code', 'test',
      'detail', 'Test event from public.report_ingestion_health(true)');
  END IF;

  -- The DSN is not a credential (it ships in client apps) but lives in Vault
  -- so it can be rotated without a migration. Absent: cron_job_errors only.
  dsn := public.get_vault_secret(ARRAY['ingestion_alert_sentry_dsn']);
  IF dsn IS NULL THEN
    RETURN health || jsonb_build_object('alerted', false, 'sentry', 'no_dsn');
  END IF;

  -- https://<public key>@<host>/<project id>
  dsn_parts := regexp_match(dsn, '^(https://)([^@/]+)@([^/]+)/([0-9]+)$');
  IF dsn_parts IS NULL THEN
    INSERT INTO public.cron_job_errors (job_name, error_message)
    VALUES ('ingestion-health', 'ingestion_alert_sentry_dsn is not a valid Sentry DSN');
    RETURN health || jsonb_build_object('alerted', false, 'sentry', 'bad_dsn');
  END IF;

  FOR problem IN SELECT * FROM jsonb_array_elements(problems) LOOP
    PERFORM net.http_post(
      url := dsn_parts[1] || dsn_parts[3] || '/api/' || dsn_parts[4] || '/store/',
      body := jsonb_build_object(
        'message', 'Ingestion health: ' || (problem ->> 'code') || ' - ' || (problem ->> 'detail'),
        'level', CASE WHEN problem ->> 'code' = 'test' THEN 'warning' ELSE 'error' END,
        'logger', 'ingestion-health',
        'platform', 'other',
        'environment', 'production',
        'fingerprint', jsonb_build_array('ingestion-health', problem ->> 'code'),
        'tags', jsonb_build_object('check', problem ->> 'code', 'source', 'pg_cron'),
        'extra', health -> 'metrics'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Sentry-Auth', format(
          'Sentry sentry_version=7, sentry_client=aiadvocate-ingestion-health/1.0, sentry_key=%s',
          dsn_parts[2])
      ),
      timeout_milliseconds := 10000
    );
    sent := sent + 1;
  END LOOP;

  RETURN health || jsonb_build_object('alerted', true, 'sentry_events', sent);
EXCEPTION WHEN others THEN
  INSERT INTO public.cron_job_errors (job_name, error_message)
  VALUES ('ingestion-health', 'report_ingestion_health failed: ' || SQLERRM);
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingestion_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingestion_health() TO service_role;
REVOKE EXECUTE ON FUNCTION public.report_ingestion_health(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_ingestion_health(boolean) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingestion-health') THEN
    PERFORM cron.unschedule('ingestion-health');
  END IF;
END;
$$;

SELECT cron.schedule(
  'ingestion-health',
  '30 11 * * *',
  'SELECT public.report_ingestion_health()'
);
