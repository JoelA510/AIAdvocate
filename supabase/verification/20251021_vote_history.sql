-- Run after applying 20251021120000_pr2_nits and 20251021121000_rls_audit_hardening.
-- Confirms RLS coverage, policy hygiene, and vote history availability.

-- Expect zero rows: every public table should have row security enabled.
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity;

-- Expect zero rows: no remaining policies rely on auth.role().
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE (qual ILIKE '%auth.role()%' OR (with_check IS NOT NULL AND with_check ILIKE '%auth.role()%'));

-- Confirm the vote history view is invoker-secured.
SELECT table_schema, table_name, security_type
FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'v_rep_vote_history';

-- The view should now return data.
-- quick path: expect >0
SELECT count(*) FROM public.v_rep_vote_history;
