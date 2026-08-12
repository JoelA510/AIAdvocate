-- 20260812122000_lock_down_ingestion_rpcs.sql
--
-- Follow-up to 20260812120000, which locked lease_next_bill to service_role.
-- Reviewing that change surfaced the same exposure on every other RPC in the
-- ingestion pipeline: anon and authenticated hold EXECUTE on all of them.
--
-- These are not client APIs. Every caller in the repo is an Edge Function
-- running as service_role (sync-updated-bills, bulk-import-dataset); nothing in
-- mobile-app references any of them. They are all SECURITY DEFINER, so the
-- grant is the only thing standing in front of them.
--
--   public.upsert_bill_and_translation(jsonb, jsonb)
--     The worst of the four. Takes an arbitrary JSONB payload and writes it
--     straight into public.bills. An anonymous caller could rewrite any bill's
--     title, summaries or original_text -- silent defacement of the exact
--     content this app exists to present accurately, with RLS bypassed.
--
--   public.reserve_legiscan_api_call(text, text, integer, integer, integer)
--     The LegiScan quota gate. Anonymous callers could burn the daily (900) and
--     monthly (30000) reservation budgets in a loop, which both stalls
--     ingestion and defeats the guardrail that docs/external-api-policy.md
--     exists to enforce after the 2026-07-26 key lock.
--
--   public.release_bill_lease(bigint, text, boolean)
--     Releases a lease and sets summary_ok. Lets a caller mark bills as
--     successfully summarised when they were not, removing them from the queue.
--
--   public.get_bills_needing_summaries()
--     Read-only, but it enumerates pipeline state to anyone who asks.
--
-- Note on why REVOKE ... FROM PUBLIC was not enough in the first place:
-- Supabase's default privileges grant anon/authenticated EXECUTE *explicitly*,
-- not via PUBLIC, so revoking from PUBLIC alone leaves the explicit grants in
-- place. Each role has to be named. That is why 20260709162000's
-- "REVOKE ... FROM PUBLIC, anon" pattern worked for the client RPCs but these
-- were missed -- they were never part of that audit.
--
-- Rollback: GRANT EXECUTE ... TO anon, authenticated for the function in
-- question. Not recommended; nothing legitimate needs it.

REVOKE EXECUTE ON FUNCTION public.upsert_bill_and_translation(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_bill_and_translation(jsonb, jsonb)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_legiscan_api_call(text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_legiscan_api_call(text, text, integer, integer, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_bill_lease(bigint, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_bill_lease(bigint, text, boolean)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_bills_needing_summaries()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bills_needing_summaries()
  TO service_role;

-- One-time data normalisation, paired with the predicate change in
-- 20260812120000. That migration swapped NULLIF(BTRIM(original_text), '') IS NULL
-- for original_text IS NULL to avoid detoasting the table on every lease, which
-- means a row holding an empty or whitespace-only string is no longer seen as
-- needing text. Such a row would sit in the table forever, never re-queued.
-- None exist today; this collapses any that do to NULL so the cheaper predicate
-- is complete rather than merely cheap.
UPDATE public.bills
   SET original_text = NULL
 WHERE original_text IS NOT NULL
   AND BTRIM(original_text) = '';

UPDATE public.bills
   SET original_text_formatted = NULL
 WHERE original_text_formatted IS NOT NULL
   AND BTRIM(original_text_formatted) = '';

NOTIFY pgrst, 'reload schema';
