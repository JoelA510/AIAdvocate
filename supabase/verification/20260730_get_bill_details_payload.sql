-- Post-deploy verification for
-- 20260730120000_trim_bill_payload_from_get_bill_details.sql
--
-- Run as a normal authenticated user (not service_role) so the auth.uid()
-- guard is exercised. Every check below should report ok = true.

-- 1. The response no longer carries the whole bills row.
--    Replace :bill_id and :user_id with a real bookmarked bill and the
--    caller's own uuid.
select
  not (public.get_bill_details_for_user(:bill_id, :user_id) ? 'bill') as ok,
  'bill key removed from response' as check;

-- 2. The three keys the client actually reads are all still present.
select
  (public.get_bill_details_for_user(:bill_id, :user_id) ?& array['reaction_counts','user_reaction','is_bookmarked']) as ok,
  'reaction_counts / user_reaction / is_bookmarked still returned' as check;

-- 3. reaction_counts still defaults to an object, never null -- the client does
--    `data.reaction_counts ?? {}` but the RPC should not rely on that.
select
  jsonb_typeof(public.get_bill_details_for_user(:bill_id, :user_id) -> 'reaction_counts') = 'object' as ok,
  'reaction_counts is an object even with zero reactions' as check;

-- 4. The IDOR guard still fires for someone else's uuid. This should RAISE;
--    the check passes if the statement errors with the message below.
--    Expected: ERROR: p_user_id must match the authenticated caller
-- select public.get_bill_details_for_user(:bill_id, '00000000-0000-0000-0000-000000000000'::uuid);

-- 5. anon still cannot execute it at the grant level.
select
  not has_function_privilege('anon', 'public.get_bill_details_for_user(bigint,uuid)', 'EXECUTE') as ok,
  'anon has no EXECUTE grant' as check;

select
  has_function_privilege('authenticated', 'public.get_bill_details_for_user(bigint,uuid)', 'EXECUTE') as ok,
  'authenticated retains EXECUTE grant' as check;

-- 6. The function is still STABLE (it is called once per card; VOLATILE would
--    defeat any planner-side reuse within a statement).
select
  p.provolatile = 's' as ok,
  'function is STABLE' as check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_bill_details_for_user';
