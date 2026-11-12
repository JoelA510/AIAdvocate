-- Post-deploy checks for 20261115120000_data_freshness_rpc.sql. Read-only.

-- 1. Definition: SECURITY DEFINER, empty search_path, stable.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.provolatile as volatility, -- expect 's'
  p.proconfig as config        -- expect {search_path=""}
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_data_freshness';

-- 2. Grants: anon, authenticated and service_role may execute; PUBLIC may not.
select
  has_function_privilege('anon', 'public.get_data_freshness()', 'EXECUTE') as anon_can,
  has_function_privilege('authenticated', 'public.get_data_freshness()', 'EXECUTE') as authenticated_can,
  has_function_privilege('service_role', 'public.get_data_freshness()', 'EXECUTE') as service_role_can,
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(p.proacl) a
    where p.oid = 'public.get_data_freshness()'::regprocedure and a.grantee = 0
  ) as public_can; -- expect false

-- 3. The table behind it is still closed to clients. (False since
--    20261117120000; before that the default grants were present and only
--    the row-level security policy kept clients out.)
select
  has_table_privilege('anon', 'public.ingestion_cursors', 'SELECT') as anon_reads_cursors,           -- expect false
  has_table_privilege('authenticated', 'public.ingestion_cursors', 'SELECT') as authenticated_reads; -- expect false

-- 4. Output: exactly two keys; last_checked_at within the last day or so when
--    the daily refresh is healthy.
select public.get_data_freshness();

-- 5. Cross-check against the source values.
select
  cursor ->> 'finished_at' as refresh_finished_at,
  cursor ->> 'last_success_at' as refresh_last_success_at
from public.ingestion_cursors
where key = 'bill_status_refresh';

select max(status_date) as latest_status_date from public.bills;
