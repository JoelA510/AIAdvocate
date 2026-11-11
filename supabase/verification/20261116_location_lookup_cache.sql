-- Post-deploy checks for 20261116120000_lock_down_location_lookup_cache.sql.
-- Read-only; returns no cached values.

-- 1. RLS on, and no policy left on the table (service_role bypasses RLS).
select c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'location_lookup_cache'; -- expect true

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'location_lookup_cache'; -- expect no rows

-- 2. Table privileges.
select
  has_table_privilege('anon', 'public.location_lookup_cache', 'SELECT') as anon_select,                   -- expect false
  has_table_privilege('authenticated', 'public.location_lookup_cache', 'SELECT') as authenticated_select, -- expect false
  has_table_privilege('service_role', 'public.location_lookup_cache', 'SELECT') as service_role_select,   -- expect true
  has_table_privilege('service_role', 'public.location_lookup_cache', 'INSERT') as service_role_insert;   -- expect true

-- 3. The cache still works: after one ZIP lookup in the app, a row has been
--    written or refreshed recently. Counts only.
select
  count(*) as rows,
  count(*) filter (where query_type = 'zip') as zip_rows,
  count(*) filter (where query_type = 'city') as city_rows,
  max(last_hit_at) as last_hit_at
from public.location_lookup_cache;
