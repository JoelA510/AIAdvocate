-- 20261119120000_deny_by_default_client_access.sql
--
-- Client access in public becomes deny-by-default: the client roles (anon,
-- authenticated) hold only what the app uses, and new objects grant them
-- nothing until a migration says so. Follows the 2026-11-12 grant audit and
-- 20261117120000 / 20261118120000. AGENTS.md section 4a states the rules
-- this sets up; scripts/check-migration-access.js enforces them in CI for
-- migrations after this one.
--
-- 1. Write grants nobody uses.
--    What the app writes, checked 2026-11-13: events (INSERT) and
--    user_push_tokens (INSERT/UPDATE/DELETE) directly; reactions, bookmarks
--    and subscriptions through handle_reaction and
--    toggle_bookmark_and_subscription, which run as the caller. Admin edits
--    go through update_bill_review, update_bill_summary and
--    update_bill_translation_secure, which run as owner. Nothing writes the
--    tables below as a client role, so INSERT/UPDATE/DELETE are revoked from
--    both client roles:
--      bills, bill_translations, legislators, votes, vote_events,
--      vote_records, profiles
--    Every client write needs a signed-in (anonymous) session, so anon loses
--    INSERT/UPDATE/DELETE on every table and view in public.
--    The two policies that granted admins direct writes ("Admins can update
--    bills", "Admins can manage translations") could no longer apply and are
--    dropped, so the catalogue does not suggest a path that does not exist.
--
-- 2. profiles stop being a public list of user ids.
--    One column (id), 1,769 rows on 2026-11-13, a "Public can view profiles"
--    policy and no reader in the app. Rows are created by handle_new_user
--    (SECURITY DEFINER trigger on auth.users), which is unaffected. A user
--    can now read only their own row.
--
-- 3. Default privileges for objects migrations create (as postgres).
--    Supabase's defaults grant anon and authenticated full access to every
--    new table, sequence and function in public, and Postgres grants EXECUTE
--    on every new function to PUBLIC. Both are removed. service_role keeps
--    its defaults so Edge Functions keep working with new tables. Existing
--    objects keep the grants they have. Supabase recommends this change
--    (docs: "Securing your API", default privileges for new tables and
--    functions); its snippet also revokes service_role, which is deliberately
--    not done here. The EXECUTE-to-PUBLIC default is global in Postgres, so
--    it is revoked for objects postgres creates in any schema.
--
-- Rollback:
--   grant insert, update, delete on public.bills, public.bill_translations,
--     public.legislators, public.votes, public.vote_events,
--     public.vote_records, public.profiles to anon, authenticated;
--   grant insert, update, delete on all tables in schema public to anon;
--   create policy "Admins can update bills" on public.bills for update
--     to authenticated using (exists (select 1 from public.app_admins a
--     where a.user_id = auth.uid())) with check (exists (select 1 from
--     public.app_admins a where a.user_id = auth.uid()));
--   create policy "Admins can manage translations" on public.bill_translations
--     for all to authenticated using (exists (select 1 from public.app_admins
--     a where a.user_id = auth.uid())) with check (exists (select 1 from
--     public.app_admins a where a.user_id = auth.uid()));
--   drop policy if exists "Users can view own profile" on public.profiles;
--   create policy "Public can view profiles" on public.profiles for select
--     using (true);
--   grant select on public.profiles to anon;
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant all on sequences to anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant execute on functions to anon, authenticated;
--   alter default privileges for role postgres
--     grant execute on functions to public;

-- 1. Unused client writes.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.bills, public.bill_translations, public.legislators, public.votes,
  public.vote_events, public.vote_records, public.profiles
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Admins can update bills" ON public.bills;
DROP POLICY IF EXISTS "Admins can manage translations" ON public.bill_translations;

-- 2. Own profile row only.
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- 3. Nothing for the client roles until a migration grants it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
