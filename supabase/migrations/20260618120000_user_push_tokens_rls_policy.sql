-- 20260618120000_user_push_tokens_rls_policy.sql
--
-- Fix: public.user_push_tokens has RLS ENABLED (see 00000000000000_initial.sql)
-- but no policy, so every non-service request is denied. The authenticated
-- client upsert in mobile-app/src/lib/push.ts (insert/update of the caller's
-- own Expo token) is therefore rejected, no tokens are ever stored, and
-- send-push-notifications has zero recipients.
--
-- This adds the same user-owned FOR ALL policy already present on
-- public.reactions / public.bookmarks / public.subscriptions, scoping every
-- row operation to the authenticated owner (auth.uid() = user_id).
--
-- The send-push-notifications Edge Function reads tokens with the service-role
-- key, which has BYPASSRLS, so this policy does not affect that read path.
--
-- Idempotent: guarded by a pg_policies existence check so re-applying (or
-- applying on top of the schema.sql snapshots) is a no-op.
--
-- No PostgREST schema-cache reload is required: this changes a row-security
-- policy, not table/column/function shape.

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
