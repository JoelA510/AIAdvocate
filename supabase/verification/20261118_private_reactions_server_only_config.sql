-- Post-deploy checks for 20261118120000_private_reactions_server_only_config.sql.
-- Read-only. Returns counts and settings, never a user id or config value.

-- 1. reactions: only the own-row policy is left.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'reactions'
order by policyname;
-- expect one row: "Users can manage their own reactions", ALL, (auth.uid() = user_id)

-- 2. The count functions run as owner with an empty search_path.
select p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,           -- expect true
  p.proconfig as config,                     -- expect {search_path=""}
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_bill_details_for_user', 'get_reaction_counts');
-- expect get_bill_details_for_user: anon false, authenticated true;
--        get_reaction_counts: unchanged (anon true, authenticated true)

-- 3. Counts still come back for a bill with reactions (totals only).
select r.bill_id, public.get_reaction_counts(r.bill_id) as counts
from public.reactions r
group by r.bill_id
order by count(*) desc
limit 3;

-- 4. app_config: no client grants or policies; only server rows remain.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'app_config'
  and grantee in ('anon', 'authenticated', 'PUBLIC');        -- expect no rows

select policyname from pg_policies
where schemaname = 'public' and tablename = 'app_config';    -- expect no rows

select key, value is not null and value <> '' as has_value
from public.app_config
order by key;                                                -- expect functions_base_url only

-- 5. The scheduler still resolves its base URL (no new invoke errors after
--    the next 10:00 UTC run).
select id, job_name, left(error_message, 200) as error_message, occurred_at
from public.cron_job_errors
where occurred_at >= now() - interval '1 day'
order by occurred_at desc;

select public.ingestion_health() - 'metrics' as health;
