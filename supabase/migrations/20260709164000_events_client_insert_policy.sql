-- 20260709164000_events_client_insert_policy.sql
--
-- mobile-app/src/lib/analytics.ts inserts into public.events, but the table
-- has no policy permitting client (authenticated) inserts -- only "Service
-- role can manage events" existed -- so every client-side trackEvent() call
-- has always failed. The failure is deliberately swallowed by the client
-- (by design, per its own doc comment), so this has silently produced zero
-- analytics in production the whole time.
--
-- Add an INSERT policy scoped to the caller's own row, matching the
-- established pattern for bookmarks/reactions/user_push_tokens. Table-level
-- GRANTs for authenticated (and anon) already exist by Supabase platform
-- default across this schema -- RLS, not GRANT, is the enforcement layer
-- here (verified: an authenticated caller inserting their own user_id
-- succeeds; the same caller spoofing another user's user_id is denied by
-- this policy's WITH CHECK).
--
-- The client is also being updated (same PR) to only insert columns that
-- actually exist (type, user_id, bill_id) -- it previously sent payload/
-- platform, which are not columns on this table and would 42703.
--
-- Idempotent (existence-guarded). Rollback: DROP POLICY.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='events' AND policyname='Authenticated users insert own events'
  ) THEN
    CREATE POLICY "Authenticated users insert own events" ON public.events
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
