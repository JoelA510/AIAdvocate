-- 20261117120000_revoke_default_client_grants.sql
--
-- Supabase's default privileges give anon and authenticated every table
-- privilege on each new table in public. Row-level security is enabled on all
-- of them and is what actually protects the rows, but the grants are a second
-- layer that was never narrowed. Audit of 2026-11-12 (production, read-only):
--
--   * Six internal tables are used only by the service role and by
--     SECURITY DEFINER functions, yet anon and authenticated held ALL on them:
--       ai_job_log, cron_job_errors, debug_log, ingestion_cursors, job_state,
--       legiscan_api_call_log
--   * app_config is read by the app (ConfigProvider) and holds the
--     scheduler's functions_base_url; clients held INSERT, UPDATE and DELETE
--     on it as well.
--   * Every table carried TRUNCATE, REFERENCES and TRIGGER for both roles.
--     None of the three is reachable through PostgREST, and TRUNCATE is not
--     subject to row-level security at all.
--
-- This migration removes those grants. It changes no policy and no data.
--
-- Client impact: none expected. Checked: mobile-app references none of the
-- six internal tables; it only SELECTs app_config. Every public function that
-- touches these tables is SECURITY DEFINER (cleanup_old_cron_job_errors,
-- get_data_freshness, ingestion_health, invoke_edge_function,
-- notify_upcoming_votes, report_ingestion_health, reserve_legiscan_api_call),
-- so it runs with its owner's rights, not the caller's. The Edge Functions
-- use the service_role client, whose grants are untouched.
--
-- Deliberately not changed here (reported to the owner instead):
--   * INSERT/UPDATE/DELETE on the user-facing and public-read tables, which
--     row-level security already limits to the policies' terms;
--   * the default privileges themselves, so tables created later still start
--     with the broad grants and need the same treatment;
--   * the read policies on app_config, profiles and reactions.
--
-- Rollback (restores the previous, broader grants):
--   grant all on public.ai_job_log, public.cron_job_errors, public.debug_log,
--     public.ingestion_cursors, public.job_state, public.legiscan_api_call_log
--     to anon, authenticated;
--   grant usage on sequence public.ai_job_log_id_seq,
--     public.cron_job_errors_id_seq, public.debug_log_id_seq,
--     public.legiscan_api_call_log_id_seq, public.app_config_id_seq
--     to anon, authenticated;
--   grant insert, update, delete on public.app_config to anon, authenticated;
--   grant truncate, references, trigger on all tables in schema public
--     to anon, authenticated;

-- 1. Internal tables: no client access at all.
DO $$
DECLARE
  tbl text;
  seq text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ai_job_log', 'cron_job_errors', 'debug_log', 'ingestion_cursors',
    'job_state', 'legiscan_api_call_log'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl);
      EXECUTE pg_catalog.format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', tbl);
    END IF;
  END LOOP;

  FOREACH seq IN ARRAY ARRAY[
    'ai_job_log_id_seq', 'cron_job_errors_id_seq', 'debug_log_id_seq',
    'legiscan_api_call_log_id_seq', 'app_config_id_seq'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', seq)) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated', seq);
    END IF;
  END LOOP;
END;
$$;

-- 2. app_config: clients read it and nothing more.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.app_config
  FROM PUBLIC, anon, authenticated;

-- 3. Privileges no client request can use, on every table and view.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;
