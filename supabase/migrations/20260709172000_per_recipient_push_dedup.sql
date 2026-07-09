-- 20260709172000_per_recipient_push_dedup.sql
--
-- PR review (gemini-code-assist) on #57 correctly flagged that the previous
-- fix (require failedBatches === 0 before writing the bill-level
-- push_notification_log dedup row) traded one bug for another: retrying the
-- WHOLE bill on any partial Expo batch failure causes duplicate
-- notifications for the recipients whose batch already succeeded.
--
-- This replaces bill-level dedup with per-recipient dedup: a new table
-- records exactly which (bill, event_date, user) combinations already got a
-- confirmed ("ok") Expo ticket. notify_upcoming_votes' candidate query and
-- send-push-notifications (updated in the same PR) now both operate at the
-- recipient level, so a retry only re-targets bookmarkers who are actually
-- still missing a confirmed delivery -- never re-notifying someone who
-- already got one, and never permanently skipping someone who didn't.
--
-- public.push_notification_log (the old bill-level ledger) is superseded
-- and no longer read or written by application code, but is left in place
-- rather than dropped (it has 0 rows in production; dropping tables is a
-- destructive operation reserved for an explicit follow-up if desired).
--
-- Verified live: manual notify_upcoming_votes() invocation still returns 0
-- (matches the pre-existing baseline -- no live candidates, calendar data is
-- stale per the separate ingestion-restoration track), and the new table's
-- grants are service_role-only (no anon/authenticated access), matching the
-- established push_notification_log pattern.

CREATE TABLE IF NOT EXISTS public.push_notification_recipients (
  bill_id     BIGINT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  event_date  DATE   NOT NULL,
  user_id     UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bill_id, event_date, user_id)
);

COMMENT ON TABLE public.push_notification_recipients IS
  'Per-recipient delivery-confirmed dedup ledger for upcoming-vote push notifications: one row per (bill, event date, user) already successfully notified. Supersedes the bill-level push_notification_log.';

ALTER TABLE public.push_notification_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_notification_recipients FROM PUBLIC;
REVOKE ALL ON TABLE public.push_notification_recipients FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_notification_recipients TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_notification_recipients'
      AND policyname = 'Service role manages push recipients'
  ) THEN
    CREATE POLICY "Service role manages push recipients" ON public.push_notification_recipients
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

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
      -- A bill is a candidate iff at least one of its bookmarkers has not
      -- yet been recorded as delivery-confirmed for this (bill, event date)
      -- -- per-recipient, not bill-level, so a partial-failure retry only
      -- re-targets the recipients who are actually still missing.
      AND EXISTS (
        SELECT 1 FROM public.bookmarks AS bm
        WHERE bm.bill_id = b.id
          AND NOT EXISTS (
            SELECT 1 FROM public.push_notification_recipients AS r
            WHERE r.bill_id = b.id AND r.event_date::text = elem->>'date' AND r.user_id = bm.user_id
          )
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

NOTIFY pgrst, 'reload schema';
