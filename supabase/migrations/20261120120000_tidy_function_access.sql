-- 20261120120000_tidy_function_access.sql
--
-- Clears four warnings from Supabase's security advisor (2026-11-13). No data
-- changes, no behaviour change for the app.
--
-- 1. Trigger functions are no longer callable through the API.
--    guard_bill_summaries() (BEFORE trigger on public.bills) and
--    handle_new_user() (AFTER INSERT trigger on auth.users) were executable
--    by anon and authenticated, so they appeared as /rest/v1/rpc endpoints.
--    A trigger function called directly only raises an error, so this is
--    tidiness, not a fix. Triggers do not check EXECUTE when they fire, so
--    both keep working for every role that writes those tables.
--
-- 2. Functions with a search_path the caller could change get a fixed one.
--    All three run with the caller's rights, so the risk was low.
--      validate_bill_summary(text, text): built-ins only, so the strict
--        empty path.
--      search_bills(text), get_related_bills(bigint): use pgvector's <=>
--        operator and vector type, installed in public, so
--        pg_catalog, public (fixed, built-ins first). An empty path would
--        stop <=> resolving and break search and related bills.
--    Their grants are unchanged and restated below, per AGENTS.md section 4a.
--
-- Rollback:
--   grant execute on function public.guard_bill_summaries(),
--     public.handle_new_user() to public, anon, authenticated;
--   alter function public.validate_bill_summary(text, text) reset search_path;
--   alter function public.search_bills(text) reset search_path;
--   alter function public.get_related_bills(bigint) reset search_path;

-- 1. Trigger-only functions.
REVOKE ALL ON FUNCTION public.guard_bill_summaries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_bill_summaries(), public.handle_new_user()
  TO service_role;

-- 2. Fixed search paths.
ALTER FUNCTION public.validate_bill_summary(text, text) SET search_path = '';
ALTER FUNCTION public.search_bills(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_related_bills(bigint) SET search_path = pg_catalog, public;

-- Grants as before: the app calls search_bills and get_related_bills before
-- and after sign-in; validate_bill_summary is called by guard_bill_summaries
-- (as owner) and was open to every role.
GRANT EXECUTE ON FUNCTION public.search_bills(text), public.get_related_bills(bigint)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_bill_summary(text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
