-- 20261113120000_lock_down_scheduler_rpcs.sql
--
-- Same exposure 20260812122000 closed for the ingestion RPCs, on the
-- scheduler side: anon and authenticated hold EXECUTE on the functions that
-- start ingestion, and PostgREST exposes every public function as
-- /rest/v1/rpc/<name>. All are SECURITY DEFINER, so the grant is the only
-- thing in front of them. Found while verifying 20261111120000.
--
--   public.invoke_edge_function(text, text)
--   public.invoke_full_legislative_refresh()
--   public.invoke_sync_updated_bills()
--   public.sync_updated_bills()
--     Anyone holding the public (anon) key could start the ingestion Edge
--     Functions at will. The LegiScan reservation and rate gate still bound
--     what each run can spend, but every call costs Edge invocations, can
--     burn the day's per-resource cooldowns early, and spends OpenAI quota
--     when bills are waiting.
--
--   public.notify_upcoming_votes(integer)
--     Starts send-push-notifications for every bill with a hearing in the
--     window. Per-recipient dedup limits repeats, but an anonymous caller
--     could pass a wide window and trigger notifications days early.
--
--   public.cleanup_old_cron_job_errors()
--   public.cleanup_expired_location_cache()
--     Maintenance deletes; harmless to the data model but not a client API.
--
--   public.is_valid_bill_sync_secret(text)
--     Answers whether a presented string is the scheduler secret. Only the
--     Edge Functions' own authorization (service_role) needs it; open to anon
--     it is a guessing oracle for that secret.
--
-- Callers, checked 2026-11-10: pg_cron jobs (run as postgres, unaffected by
-- these grants), bulk-import-dataset's invoke_edge_function RPC and the Edge
-- Functions' is_valid_bill_sync_secret RPC (both use the service_role
-- client). Nothing in mobile-app references any of these functions.
--
-- Not changed here, deliberately: update_bill_review, update_bill_summary and
-- update_bill_translation_secure are called by the admin web UI as the
-- signed-in user; guard_bill_summaries and handle_new_user are trigger
-- functions.
--
-- As in 20260812122000, each role is named: Supabase grants anon and
-- authenticated explicitly, so REVOKE ... FROM PUBLIC alone leaves them.
--
-- Rollback: GRANT EXECUTE ON FUNCTION <signature> TO anon, authenticated;
-- not recommended, nothing legitimate needs it.

REVOKE EXECUTE ON FUNCTION public.invoke_edge_function(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_edge_function(text, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.invoke_full_legislative_refresh()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_full_legislative_refresh()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.invoke_sync_updated_bills()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_sync_updated_bills()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_updated_bills()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_updated_bills()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_upcoming_votes(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_upcoming_votes(integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_cron_job_errors()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_cron_job_errors()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_location_cache()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_location_cache()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_valid_bill_sync_secret(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_bill_sync_secret(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
