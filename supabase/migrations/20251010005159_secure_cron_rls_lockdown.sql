-- Ensure RLS is on (no-op if already enabled)
ALTER TABLE cron.job ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron.job_run_details ENABLE ROW LEVEL SECURITY;

-- Drop any permissive policies (names may vary; drop defensively)
DROP POLICY IF EXISTS "cron_job_policy" ON cron.job;
DROP POLICY IF EXISTS "cron_job_run_details_policy" ON cron.job_run_details;
-- If other public policies exist, drop them too:
-- DROP POLICY IF EXISTS "public_can_select_cron_job" ON cron.job;
-- DROP POLICY IF EXISTS "public_can_select_cron_job_run_details" ON cron.job_run_details;

-- Explicit DENY policies for browser roles
CREATE POLICY deny_cron_job_to_authenticated
ON cron.job FOR ALL TO authenticated
USING (false) WITH CHECK (false);
COMMENT ON POLICY deny_cron_job_to_authenticated ON cron.job
  IS 'Block authenticated clients from any access to cron.job';

CREATE POLICY deny_cron_job_to_anon
ON cron.job FOR ALL TO anon
USING (false) WITH CHECK (false);
COMMENT ON POLICY deny_cron_job_to_anon ON cron.job
  IS 'Block anonymous clients from any access to cron.job';

CREATE POLICY deny_cron_job_run_details_to_authenticated
ON cron.job_run_details FOR ALL TO authenticated
USING (false) WITH CHECK (false);
COMMENT ON POLICY deny_cron_job_run_details_to_authenticated ON cron.job_run_details
  IS 'Block authenticated clients from any access to cron.job_run_details';

CREATE POLICY deny_cron_job_run_details_to_anon
ON cron.job_run_details FOR ALL TO anon
USING (false) WITH CHECK (false);
COMMENT ON POLICY deny_cron_job_run_details_to_anon ON cron.job_run_details
  IS 'Block anonymous clients from any access to cron.job_run_details';

-- Extra belt-and-suspenders: remove direct privileges for client roles on the cron schema & tables.
REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM anon, authenticated;
REVOKE ALL ON SCHEMA cron FROM anon, authenticated;

-- NOTE: service_role bypasses RLS and is unaffected. pg_cron internals continue to work.
