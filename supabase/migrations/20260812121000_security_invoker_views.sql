-- 20260812121000_security_invoker_views.sql
--
-- Clears the three ERROR-level `security_definer_view` findings from Supabase's
-- security advisor: public.v_rep_vote_history, public.v_bill_summary_leases and
-- public.v_legiscan_api_usage_30d.
--
-- All three are owned by `postgres` and none had security_invoker set
-- (reloptions was NULL on all three). A view without it runs with its OWNER's
-- rights, so every RLS policy on the underlying tables is evaluated as postgres
-- -- effectively bypassed -- no matter who queries the view. README already
-- describes v_rep_vote_history as "invoker-secured", so this reconciles the
-- database with the documented intent.
--
-- Checked before flipping, because security_invoker can silently empty a view
-- if the caller cannot read the base tables. Every base table has RLS enabled
-- with a permissive SELECT policy for anon and authenticated:
--
--   legislators   "read legislators public"    {anon,authenticated} SELECT USING (true)
--   vote_events   "read vote_events public"    {anon,authenticated} SELECT USING (true)
--   vote_records  "read vote_records public"   {anon,authenticated} SELECT USING (true)
--
-- so v_rep_vote_history keeps returning the same rows to the app. It is read by
-- VotingHistory.tsx and FindYourRep.tsx, which is why that check mattered.

ALTER VIEW public.v_rep_vote_history SET (security_invoker = true);
ALTER VIEW public.v_bill_summary_leases SET (security_invoker = true);
ALTER VIEW public.v_legiscan_api_usage_30d SET (security_invoker = true);

-- Second finding from the same audit: all three views had been granted the full
-- privilege set (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER as well as
-- SELECT) to anon and authenticated, presumably from a blanket GRANT ALL. These
-- are read-only reporting views; nothing writes through them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.v_rep_vote_history, public.v_bill_summary_leases, public.v_legiscan_api_usage_30d
  FROM anon, authenticated;

-- v_bill_summary_leases and v_legiscan_api_usage_30d are operational telemetry:
-- who holds which ingestion lease, and this project's LegiScan call volume.
-- Neither is referenced anywhere in mobile-app or supabase/functions, and
-- publishing API-usage patterns to anonymous clients has no upside. Read access
-- stays with service_role, which is what the ops scripts use.
REVOKE SELECT ON public.v_bill_summary_leases, public.v_legiscan_api_usage_30d
  FROM anon, authenticated;

-- v_rep_vote_history intentionally keeps SELECT for anon and authenticated --
-- the rep vote timeline is a core public feature of the app.

NOTIFY pgrst, 'reload schema';
