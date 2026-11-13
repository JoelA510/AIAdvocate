-- 20261118120000_private_reactions_server_only_config.sql
--
-- 1. Reactions become private to their author.
--    public.reactions had a "Public can view reactions" policy (FOR SELECT
--    USING (true)), so anyone holding the public key could list every row:
--    a stable anonymous user id, the bill, the reaction and its time. For
--    this app's users, one id's reactions over time is sensitive even
--    without a name. The policy is dropped; "Users can manage their own
--    reactions" (ALL, auth.uid() = user_id) remains, so a user still sees
--    and changes their own row.
--
--    Reaction counts are aggregates over everyone's rows, so the two
--    functions that return them now run with their owner's rights:
--      get_bill_details_for_user(bigint, uuid) - the app's only reader.
--        It already refuses a caller asking for another user's id; its
--        bookmark and own-reaction lookups are filtered to that id.
--      get_reaction_counts(bigint) - not called by the app or any function
--        in the repo (created outside migrations). Kept, with its existing
--        grants, so it still returns counts and nothing else.
--    Both now have an empty search_path with schema-qualified references.
--    handle_reaction stays SECURITY INVOKER: it only touches the caller's
--    own row, which the remaining policy allows.
--
-- 2. app_config becomes server-only.
--    Clients could read it ("Allow authenticated users to read config"),
--    but no shipped code does: the only reader, ConfigProvider, was never
--    mounted and is removed in the same PR. Server use is unchanged:
--    invoke_edge_function and notify_upcoming_votes are SECURITY DEFINER
--    and read functions_base_url as their owner. The four EXPO_PUBLIC_* rows
--    held placeholders, matched no config field and are deleted. No
--    migration creates them (they were added outside migrations), so a
--    fresh database never has them.
--
-- Rollback:
--   create policy "Public can view reactions" on public.reactions
--     for select using (true);
--   alter function public.get_bill_details_for_user(bigint, uuid)
--     security invoker set search_path = public;
--   alter function public.get_reaction_counts(bigint)
--     security invoker reset search_path;
--   create policy "Allow authenticated users to read config"
--     on public.app_config for select to authenticated using (true);
--   grant select on public.app_config to anon, authenticated;
-- The deleted placeholder rows carried no information and nothing reads
-- them, so they are not restored.

-- 1a. Counts for the bill card.
CREATE OR REPLACE FUNCTION public.get_bill_details_for_user(p_bill_id bigint, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reaction_counts jsonb;
  user_reaction_type text;
  is_bookmarked boolean;
BEGIN
  -- Runs as owner: this check is what keeps one caller out of another
  -- user's bookmark and reaction.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated caller';
  END IF;

  SELECT pg_catalog.jsonb_object_agg(c.reaction_type, c.count) INTO reaction_counts
  FROM (
    SELECT r.reaction_type, pg_catalog.count(*) AS count
    FROM public.reactions AS r
    WHERE r.bill_id = p_bill_id
    GROUP BY r.reaction_type
  ) AS c;

  SELECT r.reaction_type INTO user_reaction_type
  FROM public.reactions AS r
  WHERE r.bill_id = p_bill_id AND r.user_id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM public.bookmarks AS b
    WHERE b.bill_id = p_bill_id AND b.user_id = p_user_id
  ) INTO is_bookmarked;

  RETURN pg_catalog.jsonb_build_object(
    'reaction_counts', COALESCE(reaction_counts, '{}'::jsonb),
    'user_reaction', user_reaction_type,
    'is_bookmarked', is_bookmarked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_bill_details_for_user(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bill_details_for_user(bigint, uuid)
  TO authenticated, service_role;

-- 1b. The unused counts helper keeps returning counts.
CREATE OR REPLACE FUNCTION public.get_reaction_counts(bill_id_param bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_object_agg(c.reaction_type, c.count)
  FROM (
    SELECT r.reaction_type, pg_catalog.count(*) AS count
    FROM public.reactions AS r
    WHERE r.bill_id = bill_id_param
    GROUP BY r.reaction_type
  ) AS c;
$$;

-- 1c. Rows are private to their author.
DROP POLICY IF EXISTS "Public can view reactions" ON public.reactions;

-- 2. Configuration is server-only.
DROP POLICY IF EXISTS "Allow authenticated users to read config" ON public.app_config;
REVOKE ALL ON TABLE public.app_config FROM PUBLIC, anon, authenticated;

DELETE FROM public.app_config
WHERE key IN (
  'EXPO_PUBLIC_OPENSTATES_API_KEY',
  'EXPO_PUBLIC_LOCATIONIQ_API_KEY',
  'EXPO_PUBLIC_RECAPTCHA_SITE_KEY',
  'EXPO_PUBLIC_FIREBASE_WEB_CONFIG'
);

NOTIFY pgrst, 'reload schema';
