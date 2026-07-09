-- 20260618140000_drop_redundant_user_push_tokens_policy.sql
--
-- Cleanup follow-up to 20260618120000_user_push_tokens_rls_policy.sql.
--
-- Production verification (2026-06-18) found public.user_push_tokens carrying TWO
-- functionally identical PERMISSIVE, FOR ALL, role=public RLS policies:
--
--   1. "Users can manage their own push token"  (pre-existing)
--        USING (auth.uid() = user_id), no explicit WITH CHECK
--        -> for a FOR ALL policy the USING expression is reused as the write
--           (INSERT/UPDATE) check, so this already scoped writes to the owner.
--   2. "Users manage own push tokens"            (added by 20260618120000)
--        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--
-- Multiple permissive policies are OR-ed together, and both carry the identical
-- auth.uid() = user_id predicate, so they grant exactly the same access. The
-- 20260618120000 premise ("RLS enabled but NO policy, so tokens are never
-- stored") was inaccurate: a working owner-scoped policy (#1) was already
-- present and tokens were being stored, which is why #2 is redundant.
--
-- This migration removes the duplicate, keeping the explicit-WITH CHECK policy
-- (which mirrors public.reactions / public.bookmarks / public.subscriptions and
-- the 20260618120000 intent). Net RLS behavior is UNCHANGED:
--   owner can read/insert/update/delete own row; cross-user writes are denied;
--   anon sees nothing; the service-role read path (BYPASSRLS) is unaffected.
--
-- Idempotent: DROP ... IF EXISTS plus an existence-guarded recreate of the
-- canonical policy, so the table can never be left policy-less (and re-applying
-- on top of a schema.sql snapshot is a no-op). Policy-only change, so no
-- PostgREST schema-cache reload is required.
--
-- Rollback (if ever needed):
--   CREATE POLICY "Users can manage their own push token" ON public.user_push_tokens
--     FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own push token" ON public.user_push_tokens;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_push_tokens'
      AND policyname = 'Users manage own push tokens'
  ) THEN
    CREATE POLICY "Users manage own push tokens" ON public.user_push_tokens
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
