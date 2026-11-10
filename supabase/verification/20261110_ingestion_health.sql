-- Verification for 20261110120000_ingestion_health_alerting.sql.
-- Read-only except the optional test send at the end.

-- Functions exist, are SECURITY DEFINER with an empty search_path, and are
-- service_role only.
select p.oid::regprocedure::text as sig,
       p.prosecdef as security_definer,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ingestion_health', 'report_ingestion_health');

-- Cron job registered.
select jobid, jobname, schedule, active, command
from cron.job where jobname = 'ingestion-health';

-- Current health (no side effects).
select public.ingestion_health();

-- Whether the Sentry DSN is configured (never prints the value).
select name,
       decrypted_secret is not null and decrypted_secret <> '' as has_secret,
       updated_at
from vault.decrypted_secrets
where name = 'ingestion_alert_sentry_dsn';

-- Alerts recorded so far.
select occurred_at, error_message
from public.cron_job_errors
where job_name = 'ingestion-health'
order by occurred_at desc
limit 20;

-- Optional, after setting the DSN: send one test event (level warning) and
-- check net._http_response for a 200 from Sentry.
-- select public.report_ingestion_health(true);
-- select id, status_code, left(content, 200) from net._http_response order by created desc limit 3;
