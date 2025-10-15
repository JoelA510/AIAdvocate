-- unresolved placeholders
select count(*) as placeholders
from public.bills
where summary_simple ilike 'Placeholder for %';

-- latest non-ok logs
select ts, job, bill_id, status, http_status, finish_reason, model, preview, error
from public.ai_job_log
where status <> 'ok'
order by ts desc
limit 200;

-- distribution
select status, count(*) 
from public.ai_job_log
group by 1
order by 2 desc;

-- empty-ok anomaly (should be none)
select *
from public.ai_job_log
where status='ok' and content_chars=0
order by ts desc
limit 50;
