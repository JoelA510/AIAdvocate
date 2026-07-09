-- 20260709162000_reconcile_and_harden_client_rpcs.sql
--
-- Two problems found during a pre-app-store-launch production review:
--
-- 1. Schema drift: public.get_bill_details_for_user, public.handle_reaction,
--    and public.toggle_bookmark_and_subscription -- called directly from the
--    mobile client (mobile-app/src/components/Bill.tsx) for every bill card
--    -- exist only in production; no migration ever defined them. A fresh
--    environment, DR rebuild, or CI provisioned from migrations would 404 on
--    all three (bill detail, reactions, and bookmarks entirely broken).
--    This migration adds them, bodies matching production exactly
--    (CREATE OR REPLACE, idempotent, no functional change from what's live).
--
-- 2. IDOR: all three were EXECUTE-granted to the raw `anon` Postgres role
--    (and to PUBLIC, which anon inherits from) with no internal check that
--    the p_user_id argument matched the caller's identity. Anyone holding
--    just the public anon key (no session, no login) could call e.g.
--    handle_reaction(bill_id, <victim_uuid>, 'like') and forge
--    reactions/bookmarks/subscriptions for an arbitrary user. The app never
--    legitimately needs this: Bill.tsx only calls these once a session
--    exists (`if (!userId) return;`), and Supabase anonymous sign-in still
--    produces a real authenticated-role JWT with a genuine auth.uid() --
--    there is no legitimate authenticated-role call this hardening blocks.
--
--    Fix: (a) each function now raises if p_user_id IS DISTINCT FROM
--    auth.uid() (defense in depth, independent of grants), and (b) EXECUTE
--    is revoked from PUBLIC and anon, leaving authenticated + service_role.
--
-- Verified live (self-cleaning, role-switched): authenticated caller acting
-- as themselves succeeds; the same caller passing another user's uuid is
-- denied; a request with the anon role is denied at the grant level
-- (insufficient_privilege) before reaching the function body.
--
-- Rollback: re-grant EXECUTE to anon and drop the auth.uid() guard from each
-- function body (not recommended -- this restores the IDOR).

CREATE OR REPLACE FUNCTION public.get_bill_details_for_user(p_bill_id bigint, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  bill_details JSONB;
  reaction_counts JSONB;
  user_reaction_type TEXT;
  is_bookmarked BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated caller';
  END IF;

  SELECT to_jsonb(b) INTO bill_details FROM public.bills b WHERE b.id = p_bill_id;
  SELECT jsonb_object_agg(reaction_type, count) INTO reaction_counts
    FROM (SELECT reaction_type, COUNT(*) AS count FROM public.reactions WHERE bill_id = p_bill_id GROUP BY reaction_type) AS counts;
  SELECT reaction_type INTO user_reaction_type FROM public.reactions WHERE bill_id = p_bill_id AND user_id = p_user_id;
  SELECT EXISTS (SELECT 1 FROM public.bookmarks WHERE bill_id = p_bill_id AND user_id = p_user_id) INTO is_bookmarked;
  RETURN jsonb_build_object('bill', bill_details, 'reaction_counts', COALESCE(reaction_counts, '{}'::jsonb), 'user_reaction', user_reaction_type, 'is_bookmarked', is_bookmarked);
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_reaction(p_bill_id bigint, p_user_id uuid, p_reaction_type text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE existing_reaction TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated caller';
  END IF;

  SELECT reaction_type INTO existing_reaction FROM public.reactions WHERE user_id = p_user_id AND bill_id = p_bill_id;
  IF FOUND THEN
    IF existing_reaction = p_reaction_type THEN
      DELETE FROM public.reactions WHERE user_id = p_user_id AND bill_id = p_bill_id;
    ELSE
      UPDATE public.reactions SET reaction_type = p_reaction_type, created_at = NOW() WHERE user_id = p_user_id AND bill_id = p_bill_id;
    END IF;
  ELSE
    INSERT INTO public.reactions (user_id, bill_id, reaction_type) VALUES (p_user_id, p_bill_id, p_reaction_type);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_bookmark_and_subscription(p_bill_id bigint, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE bookmark_exists BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated caller';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.bookmarks WHERE user_id = p_user_id AND bill_id = p_bill_id)
  INTO bookmark_exists;

  IF bookmark_exists THEN
    DELETE FROM public.bookmarks WHERE user_id = p_user_id AND bill_id = p_bill_id;
    DELETE FROM public.subscriptions WHERE user_id = p_user_id AND bill_id = p_bill_id;
  ELSE
    INSERT INTO public.bookmarks (user_id, bill_id) VALUES (p_user_id, p_bill_id);
    INSERT INTO public.subscriptions (user_id, bill_id, type)
      VALUES (p_user_id, p_bill_id, 'saved')
      ON CONFLICT (user_id, bill_id) DO NOTHING;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_bill_details_for_user(bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_reaction(bigint,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_bookmark_and_subscription(bigint,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_bill_details_for_user(bigint,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_reaction(bigint,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_bookmark_and_subscription(bigint,uuid) TO authenticated, service_role;
