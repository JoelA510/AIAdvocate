-- Verification for 20261114120000_admin_rpc_hardening.sql. Read-only.

-- Expect anon_exec = false, authenticated_exec = true, service_exec = true.
select p.oid::regprocedure::text as sig, p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_exec,
       pg_get_functiondef(p.oid) like '%admin_audit_log%' as writes_audit_row
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('update_bill_review', 'update_bill_summary', 'update_bill_translation_secure')
order by 1;

-- Table grants: expect no row for anon and only SELECT for authenticated.
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'admin_audit_log'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee order by grantee;

-- Policies: expect the two SELECT policies and no INSERT policy.
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'admin_audit_log' order by policyname;

-- After an admin saves a bill in the admin UI: one row per edit, written by
-- the function (details is a JSON object, not a JSON string).
select id, action, bill_id, jsonb_typeof(details) as details_type, timestamp
from public.admin_audit_log order by timestamp desc limit 10;

-- No change to generated content coverage.
select count(*) as bills,
       count(*) filter (where summary_simple is null or summary_medium is null
                           or summary_complex is null) as bills_missing_any_summary
from public.bills;
