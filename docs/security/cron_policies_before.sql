-- Snapshot of existing policies on cron schema captured before lockdown.
-- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

SELECT schemaname, tablename, policyname, roles, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'cron'
ORDER BY tablename, policyname;

-- NOTE: Replace this block with actual query output when run against the project database.
