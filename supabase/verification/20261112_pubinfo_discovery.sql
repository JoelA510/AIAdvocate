-- Verification for pubinfo discovery (bulk-import-dataset background task)
-- and 20261112120000_ingestion_health_pubinfo_primary.sql. Read-only.

-- Health function still service_role only, with an empty search_path.
select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ingestion_health';

-- Current health, including the new status_refresh and pubinfo_discovery
-- metrics. pubinfo_discovery_stale is expected until the first 10:00 UTC run
-- after deploy.
select public.ingestion_health();

-- Discovery state after a run: last_run stats, queue sizes, bills waiting
-- for a LegiScan id.
select cursor->'last_run' as last_run,
       cursor->>'scanned_through' as scanned_through,
       jsonb_array_length(coalesce(cursor->'pending', '[]'::jsonb)) as pending,
       cursor->'awaiting' as awaiting,
       updated_at
from public.ingestion_cursors where key like 'pubinfo_discovery:%';

-- LegiScan call mix: getSearch should fall to about 40 calls a week (20
-- phrases x 2 pages), getMasterList to at most one a day.
select endpoint, count(*) as calls, min(created_at) as first_call, max(created_at) as last_call
from public.legiscan_api_call_log
where created_at >= now() - interval '8 days'
group by endpoint order by calls desc;

-- Spacing between consecutive LegiScan calls (expect >= 1000 ms everywhere).
select min(gap_ms) as min_gap_ms from (
  select extract(epoch from created_at - lag(created_at) over (order by created_at)) * 1000 as gap_ms
  from public.legiscan_api_call_log where created_at >= now() - interval '2 days'
) g where gap_ms is not null;

-- Bills inserted in the last two days and their downstream state.
select id, bill_number, pubinfo_bill_id, created_at,
       original_text is not null as has_text, summary_ok, status, status_date
from public.bills where created_at >= now() - interval '2 days' order by created_at desc;

-- Recent job errors.
select job_name, occurred_at, left(error_message, 200) as error_message
from public.cron_job_errors where occurred_at >= now() - interval '2 days'
order by occurred_at desc limit 20;
