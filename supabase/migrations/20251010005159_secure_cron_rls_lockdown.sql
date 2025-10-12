DO $$
BEGIN
  -- Ensure RLS is on (no-op if already enabled)
  BEGIN
    EXECUTE 'ALTER TABLE cron.job ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE cron.job_run_details ENABLE ROW LEVEL SECURITY';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cron RLS enable (insufficient privileges)';
    WHEN others THEN
      RAISE NOTICE 'Skipping cron RLS enable (unexpected error: %)', SQLERRM;
  END;

  -- Drop any permissive policies (names may vary; drop defensively)
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "cron_job_policy" ON cron.job';
    EXECUTE 'DROP POLICY IF EXISTS "cron_job_run_details_policy" ON cron.job_run_details';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cron policy cleanup (insufficient privileges)';
    WHEN others THEN
      RAISE NOTICE 'Skipping cron policy cleanup (unexpected error: %)', SQLERRM;
  END;
  -- If other public policies exist, drop them too (best-effort)
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "public_can_select_cron_job" ON cron.job';
    EXECUTE 'DROP POLICY IF EXISTS "public_can_select_cron_job_run_details" ON cron.job_run_details';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cron public policy cleanup (insufficient privileges)';
    WHEN others THEN
      RAISE NOTICE 'Skipping cron public policy cleanup (unexpected error: %)', SQLERRM;
  END;

  -- Explicit DENY policies for browser roles
  BEGIN
    EXECUTE 'CREATE POLICY deny_cron_job_to_authenticated ON cron.job FOR ALL TO authenticated USING (false) WITH CHECK (false)';
    EXECUTE 'COMMENT ON POLICY deny_cron_job_to_authenticated ON cron.job IS ''Block authenticated clients from any access to cron.job''';
    EXECUTE 'CREATE POLICY deny_cron_job_to_anon ON cron.job FOR ALL TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'COMMENT ON POLICY deny_cron_job_to_anon ON cron.job IS ''Block anonymous clients from any access to cron.job''';
    EXECUTE 'CREATE POLICY deny_cron_job_run_details_to_authenticated ON cron.job_run_details FOR ALL TO authenticated USING (false) WITH CHECK (false)';
    EXECUTE 'COMMENT ON POLICY deny_cron_job_run_details_to_authenticated ON cron.job_run_details IS ''Block authenticated clients from any access to cron.job_run_details''';
    EXECUTE 'CREATE POLICY deny_cron_job_run_details_to_anon ON cron.job_run_details FOR ALL TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'COMMENT ON POLICY deny_cron_job_run_details_to_anon ON cron.job_run_details IS ''Block anonymous clients from any access to cron.job_run_details''';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Cron deny policies already exist';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cron deny policy creation (insufficient privileges)';
    WHEN others THEN
      RAISE NOTICE 'Skipping cron deny policy creation (unexpected error: %)', SQLERRM;
  END;

  -- Extra belt-and-suspenders: remove direct privileges for client roles on the cron schema & tables (best-effort)
  BEGIN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON SCHEMA cron FROM anon, authenticated';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cron privilege revocation (insufficient privileges)';
    WHEN others THEN
      RAISE NOTICE 'Skipping cron privilege revocation (unexpected error: %)', SQLERRM;
  END;
END;
$$;

-- NOTE: service_role bypasses RLS and is unaffected. pg_cron internals continue to work.
