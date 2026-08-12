-- 20260812120000_lease_next_bill_avoid_detoast.sql
--
-- Ingestion has been failing every day since at least 2026-08-08. Every entry
-- in public.cron_job_errors for sync-updated-bills is
-- "57014: canceling statement due to statement timeout", on both
-- lease_next_bill and upsert_bill_and_translation. Bills are discovered and
-- inserted, but their text never persists, and because summaries are gated on
-- original_text nothing downstream runs either: at time of writing 19 of 175
-- bills have no text, all created in the last 14 days, and the count of bills
-- with a summary (156) exactly equals the count with text.
--
-- The ceiling is 8 seconds, not the 2 minutes the database default suggests.
-- PostgREST connects as `authenticator`, which carries
-- statement_timeout=8s / lock_timeout=8s, and `SET ROLE service_role` does not
-- re-apply role-level GUCs. So every Edge Function RPC gets 8s.
--
-- Raising that ceiling from inside the function does NOT work, and this was
-- tested rather than assumed: a probe function declared
-- `SET statement_timeout TO '20s'` still died under a 2s session timeout,
-- because the timer is armed at statement start and is not re-armed when the
-- GUC changes mid-statement. `ALTER FUNCTION ... SET statement_timeout` looks
-- like the fix and silently does nothing. The work has to get under 8s instead.
--
-- This migration removes the largest avoidable cost in the lease path.
-- The predicate ran BTRIM() over original_text and original_text_formatted,
-- which forces a full detoast of both columns for every row on every call.
-- public.bills is 18 MB total against a 304 kB heap -- almost all of it TOAST,
-- with individual bill texts up to 1.58 MB (the Budget Acts). A `IS NULL`
-- test reads the tuple's null bitmap and never touches TOAST at all.
--
-- Measured on production, same 175-row table, candidate SELECT only:
--   before: 646 ms, 3018 shared buffer hits
--   after:  229 ms, 3053 shared buffer hits
--
-- Semantics narrow slightly: a row whose original_text is present but
-- whitespace-only is no longer treated as missing text. No such row exists
-- today (all 19 stuck rows are true NULL).
--
-- There is no downstream safety net for this. processBill's isUsableBillText()
-- check only runs on bills this function has already leased, so a row that
-- stops matching here is never handed to it -- it would simply sit unqueued
-- forever. 20260812122000 therefore normalises any empty/whitespace-only text
-- to NULL, which makes the cheap predicate complete rather than merely fast.
-- Apply the two together.
--
-- Deliberately NOT changed: the summary_* predicates keep BTRIM/ILIKE/regex.
-- Those columns are small, they are what actually decides whether a summary
-- needs regenerating, and rewriting them would change which bills requeue.
--
-- Rollback: re-run the definition from
-- 20260501120000_repair_bill_text_summary_queue.sql (or whichever migration
-- last defined lease_next_bill), which is identical except that the two
-- original_text tests are wrapped in NULLIF(BTRIM(...), '').

CREATE OR REPLACE FUNCTION public.lease_next_bill(p_owner text, p_ttl_seconds integer DEFAULT 900)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidate AS (
    SELECT b.id
    FROM public.bills AS b
    WHERE (
          b.summary_ok IS DISTINCT FROM TRUE
       -- IS NULL reads the null bitmap; BTRIM() here would detoast every
       -- bill's full text on every lease. See the header note.
       OR b.original_text IS NULL
       OR b.original_text_formatted IS NULL
       OR NULLIF(BTRIM(b.summary_simple), '') IS NULL
       OR NULLIF(BTRIM(b.summary_medium), '') IS NULL
       OR NULLIF(BTRIM(b.summary_complex), '') IS NULL
       OR LENGTH(BTRIM(b.summary_simple)) < 40
       OR LENGTH(BTRIM(b.summary_medium)) < 40
       OR LENGTH(BTRIM(b.summary_complex)) < 40
       OR b.summary_simple ILIKE 'AI_SUMMARY_FAILED%'
       OR b.summary_medium ILIKE 'AI_SUMMARY_FAILED%'
       OR b.summary_complex ILIKE 'AI_SUMMARY_FAILED%'
       OR b.summary_simple ~* '^[[:space:]]*(error|placeholder)'
       OR b.summary_medium ~* '^[[:space:]]*(error|placeholder)'
       OR b.summary_complex ~* '^[[:space:]]*(error|placeholder)'
       OR b.summary_simple ~* 'placeholder'
       OR b.summary_medium ~* 'placeholder'
       OR b.summary_complex ~* 'placeholder'
    )
      AND (b.summary_lease_until IS NULL OR b.summary_lease_until < now())
    ORDER BY
      CASE WHEN b.original_text IS NULL THEN 0 ELSE 1 END,
      CASE WHEN b.summary_ok IS DISTINCT FROM TRUE THEN 0 ELSE 1 END,
      b.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.bills AS b
     SET summary_lease_until = now() + make_interval(secs => p_ttl_seconds),
         summary_lease_owner = p_owner
    FROM candidate
   WHERE b.id = candidate.id
  RETURNING b.id;
$function$;

-- SECURITY FIX, found while auditing the above rather than reported.
--
-- anon and authenticated both held EXECUTE on this function. It is
-- SECURITY DEFINER and it writes summary_lease_until / summary_lease_owner, so
-- any anonymous caller could run
--
--     select public.lease_next_bill('attacker', 2147483647);
--
-- in a loop and hold every bill leased indefinitely, stalling ingestion and
-- summary generation for the whole product. No client calls this: the only
-- caller in the repo is sync-updated-bills, through supabaseAdmin
-- (service_role). Locking it to service_role costs nothing and closes it.
REVOKE EXECUTE ON FUNCTION public.lease_next_bill(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_next_bill(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
