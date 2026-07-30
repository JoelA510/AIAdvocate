-- 20260730120000_trim_bill_payload_from_get_bill_details.sql
--
-- public.get_bill_details_for_user is the single hottest read path in the app:
-- one call per rendered bill card, so a feed of N bills costs N calls. Its body
-- opened with
--
--     SELECT to_jsonb(b) INTO bill_details FROM public.bills b WHERE b.id = p_bill_id;
--
-- which serialises the ENTIRE bills row into the response. public.bills carries
-- two columns that dominate that row and that no client reads:
--
--   * embedding vector(1536) -- semantic-search input, consumed server-side by
--     get_related_bills. PostgREST renders it as a JSON array of 1536 floats,
--     on the order of 15-20 KB of egress per call.
--   * original_text / original_text_formatted -- the full text of the bill,
--     twice. Bill cards render neither; the "Original Text" view on /bill/[id]
--     comes from that screen's own fetch.
--
-- So every card on every feed load paid for a full bill row, including a
-- 1536-dimension vector, and the client discarded all of it -- the caller reads
-- only reaction_counts, user_reaction and is_bookmarked. Against the project's
-- 5 GB/month egress allowance this was plausibly the largest single consumer in
-- the product.
--
-- This drops the 'bill' key from the returned object. That is a change to the
-- RESPONSE SHAPE (the function signature -- arguments and RETURNS jsonb -- is
-- unchanged), so it was checked against shipped clients rather than assumed:
-- `git log --all -p -- mobile-app/src/components/Bill.tsx` shows no revision,
-- current or historical, that ever reads `.bill` off this response. The live
-- vc13 / 1.7.0 binary talks to this same database and is likewise unaffected.
--
-- The three remaining statements are all indexed single-row lookups against
-- reactions/bookmarks, so the function stays STABLE and cheap.
--
-- Rollback: re-run the previous definition from
-- 20260709162000_reconcile_and_harden_client_rpcs.sql, which is byte-identical
-- to this one except for the restored `SELECT to_jsonb(b) ...` line and the
-- 'bill', bill_details pair in jsonb_build_object.

CREATE OR REPLACE FUNCTION public.get_bill_details_for_user(p_bill_id bigint, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  reaction_counts JSONB;
  user_reaction_type TEXT;
  is_bookmarked BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated caller';
  END IF;

  SELECT jsonb_object_agg(reaction_type, count) INTO reaction_counts
    FROM (SELECT reaction_type, COUNT(*) AS count FROM public.reactions WHERE bill_id = p_bill_id GROUP BY reaction_type) AS counts;
  SELECT reaction_type INTO user_reaction_type FROM public.reactions WHERE bill_id = p_bill_id AND user_id = p_user_id;
  SELECT EXISTS (SELECT 1 FROM public.bookmarks WHERE bill_id = p_bill_id AND user_id = p_user_id) INTO is_bookmarked;

  RETURN jsonb_build_object(
    'reaction_counts', COALESCE(reaction_counts, '{}'::jsonb),
    'user_reaction', user_reaction_type,
    'is_bookmarked', is_bookmarked
  );
END;
$function$;

-- Grants are unchanged from 20260709162000; restated so this migration is
-- self-contained if replayed against a database where CREATE OR REPLACE reset
-- nothing. anon must never reach this function -- the auth.uid() guard above is
-- the IDOR fix and the grant is the outer layer of it.
REVOKE EXECUTE ON FUNCTION public.get_bill_details_for_user(bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bill_details_for_user(bigint,uuid) TO authenticated, service_role;

-- The response shape changed, so PostgREST's schema cache must be reloaded.
NOTIFY pgrst, 'reload schema';
