-- Verification for 20261111120000_bill_status_refresh.sql and the
-- refresh-bill-status Edge Function. Read-only except the marked statements.

-- Column, index and coverage. Expect has_pubinfo_id = bills for CA bills.
select count(*) as bills,
       count(pubinfo_bill_id) as has_pubinfo_id,
       count(distinct pubinfo_bill_id) as distinct_pubinfo_ids
from public.bills;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname = 'bills_pubinfo_bill_id_key';

-- Cron job registered; the wrapper allowlists the endpoint.
select jobname, schedule, active, command
from cron.job where jobname = 'bill-status-refresh';

select pg_get_functiondef('public.invoke_edge_function(text,text)'::regprocedure)
       like '%''refresh-bill-status''%' as endpoint_allowlisted;

-- No changed function depends on nonexistent Vault helpers (expect no rows).
select p.oid::regprocedure::text as function_signature
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f' and n.nspname in ('public', 'vault')
  and (pg_get_functiondef(p.oid) ilike '%vault.get_secret%'
    or pg_get_functiondef(p.oid) ilike '%vault.delete_secret%');

-- Manual invocation (WRITES: updates status fields on public.bills).
-- select public.invoke_edge_function('refresh-bill-status', 'bill-status-refresh');

-- The response (expect 200 and a JSON body with matched/updated counts).
select id, status_code, timed_out, error_msg, created,
       left(coalesce(content, ''), 600) as content_preview
from net._http_response order by created desc limit 5;

-- Last run's stats.
select cursor - 'samples' as last_refresh, updated_at
from public.ingestion_cursors where key = 'bill_status_refresh';

-- Outcome: bills with status, status date and history.
select count(*) as bills,
       count(*) filter (where status ~ '^[1-6]$') as has_status_code,
       count(*) filter (where status_date is not null) as has_status_date,
       count(*) filter (where jsonb_array_length(coalesce(history, '[]'::jsonb)) > 0) as has_history,
       max(status_date) as latest_status_date,
       count(*) filter (where summary_simple is null or summary_medium is null
                           or summary_complex is null) as bills_missing_any_summary
from public.bills;

-- Errors from the job.
select occurred_at, error_message from public.cron_job_errors
where job_name = 'bill-status-refresh' order by occurred_at desc limit 10;
