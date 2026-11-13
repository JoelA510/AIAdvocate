-- Post-deploy checks for 20261117120000_revoke_default_client_grants.sql.
-- Read-only. Doubles as the grant audit: run it after adding a table.

-- 1. Internal tables: expect no rows.
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and table_name in ('ai_job_log', 'cron_job_errors', 'debug_log',
                     'ingestion_cursors', 'job_state', 'legiscan_api_call_log',
                     'location_lookup_cache', 'legiscan_rate_gate',
                     'push_notification_log', 'push_notification_recipients')
group by grantee, table_name
order by table_name, grantee;

-- 2. app_config: expect no rows. (SELECT only between 20261117120000 and
--    20261118120000, which made the table server-only.)
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'app_config'
  and grantee in ('anon', 'authenticated')
group by grantee;

-- 3. TRUNCATE / REFERENCES / TRIGGER: expect no rows.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
order by table_name, grantee, privilege_type;

-- 4. The service role still has what the Edge Functions need: expect true.
select
  has_table_privilege('service_role', 'public.ingestion_cursors', 'SELECT, INSERT, UPDATE, DELETE') as cursors,
  has_table_privilege('service_role', 'public.legiscan_api_call_log', 'SELECT, INSERT') as call_log,
  has_table_privilege('service_role', 'public.job_state', 'SELECT, INSERT, UPDATE') as job_state;

-- 5. Row-level security is on for every table: expect no rows.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by 1;

-- 6. The whole picture, for review: what each client role holds per table.
select table_name,
  string_agg(distinct privilege_type, ',' order by privilege_type)
    filter (where grantee = 'anon') as anon,
  string_agg(distinct privilege_type, ',' order by privilege_type)
    filter (where grantee = 'authenticated') as authenticated
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name
order by table_name;

-- 7. The paths that depend on the tables above still work.
select public.get_data_freshness();
select (public.ingestion_health() - 'metrics') as health;
