-- 20260618130000_wire_upcoming_vote_push.sql
--
-- Wire push notifications: nothing currently invokes the send-push-notifications
-- Edge Function, so registered Expo tokens never receive anything. This adds a
-- daily pg_cron job that finds bookmarked bills with an UPCOMING calendar entry
-- and POSTs { billId } to send-push-notifications for each, deduplicating so a
-- given (bill, event date) notifies its bookmarkers at most once.
--
-- Depends on (deploy first): the push-notification auth + RLS hardening PR
--   - user_push_tokens RLS policy (so tokens are actually stored), and
--   - send-push-notifications running with verify_jwt = false +
--     isAuthorizedCronOrAdmin(), so the scheduler's SYNC_SECRET bearer token is
--     accepted (this job sends exactly that header).
--
-- Secret resolution reads vault.decrypted_secrets DIRECTLY (like
-- is_valid_bill_sync_secret and the restored invoke_edge_function) rather than
-- vault.get_secret(...), which AGENTS.md documents as historically absent.
--
-- Calendar shape (confirmed by mobile-app/src/lib/billStatus.ts): bills.calendar
-- is a JSONB array of entries { "date": "YYYY-MM-DD", "time"?, "type"?, ... }.

-- ---------- Dedup log (internal / service-role only) ----------
CREATE TABLE IF NOT EXISTS public.push_notification_log (
  bill_id     BIGINT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  event_date  DATE   NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bill_id, event_date)
);

COMMENT ON TABLE public.push_notification_log IS
  'Dedup ledger for upcoming-vote push notifications: one row per (bill, event date) already notified.';

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

-- Clients have no business touching this ledger; only the service role (and the
-- SECURITY DEFINER RPC below, which bypasses RLS) reads/writes it.
REVOKE ALL ON TABLE public.push_notification_log FROM PUBLIC;
REVOKE ALL ON TABLE public.push_notification_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_notification_log TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_notification_log'
      AND policyname = 'Service role manages push log'
  ) THEN
    CREATE POLICY "Service role manages push log" ON public.push_notification_log
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ---------- Invocation RPC ----------
-- p_window_days: how many days ahead to look. Default 1 => events dated today or
-- tomorrow. Run daily, dedup means each event notifies ~1 day out, exactly once.
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
  notified    INT := 0;
  window_days INT := GREATEST(COALESCE(p_window_days, 1), 0);
  rec         RECORD;
BEGIN
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
    VALUES ('notify-upcoming-votes', 'Invoke Error: missing functions_base_url in Vault and app_config');
    RETURN 0;
  END IF;

  SELECT v.decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets AS v
  WHERE v.name IN ('supabase_anon_key', 'anon_key') AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY CASE v.name WHEN 'supabase_anon_key' THEN 0 WHEN 'anon_key' THEN 1 ELSE 2 END,
           v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

  IF NULLIF(anon_key, '') IS NULL THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES ('notify-upcoming-votes', 'Invoke Error: missing supabase_anon_key/anon_key');
    RETURN 0;
  END IF;

  -- send-push-notifications authorizes the scheduler via the shared secret,
  -- validated in-function against Vault (isAuthorizedCronOrAdmin / the pg_cron path).
  SELECT v.decrypted_secret INTO sync_secret
  FROM vault.decrypted_secrets AS v
  WHERE v.name IN ('SYNC_SECRET', 'sync_secret', 'bill-sync-api-key') AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY CASE v.name WHEN 'SYNC_SECRET' THEN 0 WHEN 'sync_secret' THEN 1 WHEN 'bill-sync-api-key' THEN 2 ELSE 3 END,
           v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;

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

  -- Bookmarked bills whose calendar has an upcoming entry within the window and
  -- that have not already been notified for that event date.
  --
  -- The event date is parsed inside a LATERAL whose WHERE guards the cast: it
  -- only runs for fixed-format YYYY-MM-DD strings already constrained to the
  -- [today, today+window] range (string comparison, since that ordering matches
  -- chronological order), so an untrusted/malformed calendar value can never
  -- throw a date-cast error and abort the run.
  FOR rec IN
    SELECT DISTINCT b.id AS bill_id, ev.event_date
    FROM public.bills AS b
    CROSS JOIN LATERAL jsonb_array_elements(b.calendar) AS elem
    CROSS JOIN LATERAL (
      SELECT (elem->>'date')::date AS event_date
      WHERE elem->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
        AND elem->>'date' >= to_char(current_date, 'YYYY-MM-DD')
        AND elem->>'date' <= to_char(current_date + window_days, 'YYYY-MM-DD')
    ) AS ev
    WHERE jsonb_typeof(b.calendar) = 'array'
      AND EXISTS (SELECT 1 FROM public.bookmarks AS bm WHERE bm.bill_id = b.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.push_notification_log AS l
        WHERE l.bill_id = b.id AND l.event_date = ev.event_date
      )
    ORDER BY ev.event_date, b.id
  LOOP
    BEGIN
      SELECT net.http_post(
        url     := base_url || '/send-push-notifications',
        headers := req_headers,
        body    := jsonb_build_object('billId', rec.bill_id)
      ) INTO request_id;

      IF request_id IS NULL THEN
        INSERT INTO public.cron_job_errors(job_name, error_message)
        VALUES ('notify-upcoming-votes',
                'Invoke Error: send-push-notifications enqueue returned null for bill ' || rec.bill_id);
        CONTINUE;  -- leave undedup'd so the next run retries
      END IF;

      INSERT INTO public.push_notification_log(bill_id, event_date)
      VALUES (rec.bill_id, rec.event_date)
      ON CONFLICT (bill_id, event_date) DO NOTHING;

      notified := notified + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_job_errors(job_name, error_message)
      VALUES ('notify-upcoming-votes', 'Invoke Error: bill ' || rec.bill_id || ' failed: ' || SQLERRM);
    END;
  END LOOP;

  RETURN notified;

EXCEPTION WHEN OTHERS THEN
  -- Match invoke_edge_function: record unexpected failures rather than letting
  -- the cron run fail silently.
  INSERT INTO public.cron_job_errors(job_name, error_message)
  VALUES ('notify-upcoming-votes', 'Fatal: ' || SQLERRM);
  RETURN notified;
END;
$$;

-- Internal scheduler RPC: not for anon/authenticated callers.
REVOKE ALL ON FUNCTION public.notify_upcoming_votes(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_upcoming_votes(INT) TO service_role;

COMMENT ON FUNCTION public.notify_upcoming_votes(INT) IS
  'Daily scheduler hook: POSTs { billId } to send-push-notifications for bookmarked bills with an upcoming calendar entry, deduped via push_notification_log.';

-- ---------- Schedule (mirrors existing cron guard pattern) ----------
-- 16:00 UTC (~08:00-09:00 America/Los_Angeles): a reasonable morning send.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-upcoming-votes') THEN
    PERFORM cron.unschedule('notify-upcoming-votes');
  END IF;
END;
$$;

SELECT cron.schedule('notify-upcoming-votes', '0 16 * * *', 'SELECT public.notify_upcoming_votes()')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-upcoming-votes');

-- New table changes the API surface; refresh PostgREST's schema cache.
NOTIFY pgrst, 'reload schema';
