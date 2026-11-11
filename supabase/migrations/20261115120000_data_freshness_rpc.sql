-- 20261115120000_data_freshness_rpc.sql
--
-- public.get_data_freshness(): what the app needs to tell a reader how
-- current the bill data is.
--
--   last_checked_at     when refresh-bill-status last completed a full,
--                       successful comparison of every tracked bill against
--                       the Legislature's records; null if that is unknown.
--   latest_action_date  the most recent action recorded on any tracked bill.
--                       When this is weeks old the app says so, so a quiet
--                       Legislature does not read as stale data.
--
-- Why an RPC: the refresh stats live in public.ingestion_cursors, which is
-- service_role only and also holds queue contents and run diagnostics. This
-- function exposes two values and nothing else.
--
-- Security: SECURITY DEFINER with an empty search_path and schema-qualified
-- references. EXECUTE is granted to anon and authenticated deliberately: the
-- bill feed is public, and so is the date it was last checked. It takes no
-- arguments and writes nothing.
--
-- Rollback:
--   drop function if exists public.get_data_freshness();
--   notify pgrst, 'reload schema';
-- The app treats a failed call as "unknown" and shows no freshness line.

CREATE OR REPLACE FUNCTION public.get_data_freshness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  refresh jsonb;
  checked timestamptz;
  looked_up numeric;
  latest date;
BEGIN
  SELECT c.cursor INTO refresh
  FROM public.ingestion_cursors AS c
  WHERE c.key = 'bill_status_refresh';

  BEGIN
    checked := (refresh ->> 'last_success_at')::timestamptz;
    -- Stats written before last_success_at existed: accept the run itself if
    -- it meets the test sync-updated-bills applies (isStatusRefreshHealthy).
    IF checked IS NULL AND NOT (refresh ? 'last_success_at') THEN
      looked_up := (refresh ->> 'tracked')::numeric
        - (refresh ->> 'without_pubinfo_id')::numeric;
      IF COALESCE((refresh ->> 'blocked')::boolean, true) IS FALSE
        AND COALESCE((refresh ->> 'dry_run')::boolean, true) IS FALSE
        AND (refresh ->> 'update_errors')::numeric = 0
        AND looked_up > 0
        AND (refresh ->> 'matched')::numeric / looked_up >= 0.9
      THEN
        checked := (refresh ->> 'finished_at')::timestamptz;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    checked := NULL;
  END;

  SELECT max(d) INTO latest
  FROM (
    SELECT b.status_date AS d
    FROM public.bills AS b
    UNION ALL
    SELECT pg_catalog.to_date(pg_catalog.left(h.entry ->> 'date', 10), 'YYYY-MM-DD')
    FROM public.bills AS b
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(b.history) = 'array'
        THEN b.history ELSE '[]'::jsonb END
    ) AS h(entry)
    WHERE (h.entry ->> 'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
  ) AS dates
  -- A mistyped future date must not hide a real quiet period.
  WHERE d <= (pg_catalog.now() AT TIME ZONE 'UTC')::date + 1;

  RETURN pg_catalog.jsonb_build_object(
    'last_checked_at', checked,
    'latest_action_date', latest
  );
END;
$$;

COMMENT ON FUNCTION public.get_data_freshness() IS
  'Public, read-only: when bill data was last checked against the Legislature, and the latest action on any tracked bill.';

REVOKE ALL ON FUNCTION public.get_data_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_data_freshness()
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
