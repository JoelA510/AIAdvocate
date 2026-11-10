-- Verification for 20261113120000_lock_down_scheduler_rpcs.sql. Read-only
-- except the marked statement.

-- Expect anon_exec = false, authenticated_exec = false, service_exec = true
-- for all eight.
select p.oid::regprocedure::text as sig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_exec,
       has_function_privilege('postgres', p.oid, 'execute') as postgres_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'invoke_edge_function', 'invoke_full_legislative_refresh',
    'invoke_sync_updated_bills', 'sync_updated_bills', 'notify_upcoming_votes',
    'cleanup_old_cron_job_errors', 'cleanup_expired_location_cache',
    'is_valid_bill_sync_secret')
order by 1;

-- What anon and authenticated can still execute in public (expect only
-- client RPCs, the admin update_* functions and trigger functions).
select p.oid::regprocedure::text as sig, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  and (has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute'))
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by p.prosecdef desc, 1;

-- The scheduler path still works: cron jobs run as postgres, Edge Functions
-- as service_role. Manual invocation (WRITES: runs the daily refresh):
-- select public.invoke_edge_function('refresh-bill-status', 'bill-status-refresh');

select id, status_code, timed_out, error_msg, created,
       left(coalesce(content, ''), 300) as content_preview
from net._http_response order by created desc limit 10;

select job_name, occurred_at, left(error_message, 200) as error_message
from public.cron_job_errors
where occurred_at >= now() - interval '1 day' order by occurred_at desc limit 20;

-- Cron jobs and the role they run as.
select jobname, schedule, active, username from cron.job order by jobname;
