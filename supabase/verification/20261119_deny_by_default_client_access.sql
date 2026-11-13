-- Post-deploy checks for 20261119120000_deny_by_default_client_access.sql.
-- Read-only; counts and settings only.

-- 1. No client role can write the reference tables or profiles: expect no rows.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  and table_name in ('bills', 'bill_translations', 'legislators', 'votes',
                     'vote_events', 'vote_records', 'profiles')
order by 2, 1, 3;

-- 2. anon writes nothing anywhere: expect no rows.
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by 1, 2;

-- 3. What authenticated may still write: expect exactly these tables
--    (direct writes and the caller-rights RPCs): bookmarks, events,
--    reactions, subscriptions, user_push_tokens. app_admins and
--    admin_audit_log are SELECT only.
select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
group by 1
order by 1;

-- 4. profiles: own row only, no anon access.
select policyname, cmd, roles, qual from pg_policies
where schemaname = 'public' and tablename = 'profiles';   -- expect "Users can view own profile"
select has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_reads_profiles;  -- expect false

-- 5. The inert admin write policies are gone: expect no rows.
select tablename, policyname from pg_policies
where policyname in ('Admins can update bills', 'Admins can manage translations');

-- 6. Default privileges for objects postgres creates: no grants to PUBLIC,
--    anon or authenticated; service_role keeps table/sequence/function access.
select coalesce(n.nspname, '(all schemas)') as schema, d.defaclobjtype as type, d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where pg_get_userbyid(d.defaclrole) = 'postgres'
order by 1, 2;
-- expect for public: r, S and f entries listing postgres and service_role only;
--        one (all schemas) f entry listing postgres only (no PUBLIC).

-- 7. The app's read paths and the daily chain are unaffected.
select public.get_data_freshness();
select (public.ingestion_health() - 'metrics') as health;
