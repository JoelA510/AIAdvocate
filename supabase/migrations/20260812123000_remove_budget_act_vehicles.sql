-- 20260812123000_remove_budget_act_vehicles.sql
--
-- Removes California's omnibus appropriations vehicles from `bills`, and
-- re-queues the remaining recent imports so their summaries regenerate under
-- the corrected summariser prompt.
--
-- WHY THE BUDGET ACTS ARE HERE AT ALL
--
-- The discovery sweep is correctly targeted -- every phrase in
-- RELEVANT_SEARCH_PHRASES is a trafficking, sexual assault or domestic violence
-- term, and each candidate is verified against the real bill text before it is
-- written. Budget Acts pass that gate legitimately: they appropriate money to
-- essentially every state program, so those phrases genuinely appear in their
-- text. All 10 Budget Acts carrying text match at least two phrases, and
-- AB102 / AB105 / AB111 / SB102 / SB105 / SB111 match three.
--
-- A bill that funds a program is not a bill about that program. Love Never
-- Fails' remit is survivors of trafficking, sexual assault and domestic
-- violence; a 1.5 MB appropriations act sitting in that feed misrepresents what
-- the app is for, and no summary of it can tell a survivor which line items
-- matter. This is also why every Budget Act summary read as interchangeable
-- boilerplate.
--
-- Future imports are already blocked in bulk-import-dataset via
-- isExcludedVehicle(); this clears what was imported before that existed.
--
-- CHECKED BEFORE DELETING -- nine of the ten FKs pointing at bills are ON
-- DELETE CASCADE (only admin_audit_log.bill_id is SET NULL), so this would
-- take user data with it if any existed. Every one was counted against
-- production first, not reasoned about:
--
--   budget bills                  18
--   bookmarks                      0
--   reactions                      0
--   subscriptions                  0
--   votes                          0
--   vote_events                    0
--   push_notification_log          0
--   push_notification_recipients   0
--   admin_audit_log                0
--   is_curated                     0
--   bill_translations             10   (machine-generated, regenerate on demand)
--
-- No human-authored or user-owned data is destroyed. If that ever stops being
-- true, this migration must be revisited rather than replayed.
--
-- Scope is deliberately narrow: only the appropriations vehicles. Bills that
-- are topical only in their operative text -- foster care, protective orders,
-- "Slavery: corporate disclosures", missing children -- are left alone, since
-- reaching those is exactly why the text-verification gate exists.
--
-- Rollback: these rows are recoverable only by re-running discovery with
-- BULK_IMPORT_TOPIC_EXCLUSION_REGEX set empty. There is no undo in this file.

DELETE FROM public.bills
 WHERE title ~* '^[[:space:]]*budget[[:space:]]+acts?[[:space:]]+of[[:>:]]';

-- Note for anyone porting this predicate: Postgres POSIX regex does NOT support
-- \b (it means backspace) or \s the way JavaScript does -- [[:>:]] is the word
-- boundary and [[:space:]] the whitespace class. An earlier audit query using
-- \b silently matched zero rows and made the problem look non-existent.

-- Re-queue recent imports for re-summarisation.
--
-- The summariser prompt changed materially: it now states the length floors it
-- is judged against, asks for concrete specifics over generic description, and
-- forbids inventing effects the source text does not support. Summaries written
-- before that are the ones that read as "a law that helps fund the state
-- government" regardless of content.
--
-- Clearing summary_ok and summary_hash puts these bills back in front of
-- lease_next_bill without deleting the existing text, so the app keeps showing
-- the current summary until a better one replaces it. At SYNC_BILLS_PER_RUN=8
-- on a daily cron this drains over roughly a week; each bill costs one
-- OpenAI call.
UPDATE public.bills
   SET summary_ok = FALSE,
       summary_hash = NULL
 WHERE created_at >= TIMESTAMPTZ '2026-07-25'
   AND summary_simple IS NOT NULL
   AND summary_simple <> '';

NOTIFY pgrst, 'reload schema';

-- POST-DEPLOY VERIFICATION (run by hand after this applies; expected values are
-- from the pre-deploy measurement above, 175 bills total):
--
--   SELECT
--     (SELECT count(*) FROM public.bills) AS total_bills,                   -- 157
--     (SELECT count(*) FROM public.bills
--       WHERE title ~* '^[[:space:]]*budget[[:space:]]+acts?[[:space:]]+of[[:>:]]')
--       AS budget_vehicles_remaining,                                      -- 0
--     (SELECT count(*) FROM public.bills
--       WHERE summary_ok IS DISTINCT FROM TRUE) AS queued_for_summary;     -- >= 63
--
-- Then confirm the queue is actually reachable -- lease_next_bill is what the
-- cron drains through, and a re-queued row that it will not hand out is worse
-- than one that was never re-queued:
--
--   BEGIN;
--     SELECT public.lease_next_bill('verify-20260812123000', 1);
--   ROLLBACK;
--
-- A non-null id means the re-queue took. NULL means either everything is
-- already leased or the predicate does not match -- investigate before
-- assuming the cron will catch up on its own.
