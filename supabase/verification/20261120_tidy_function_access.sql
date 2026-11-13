-- Post-deploy checks for 20261120120000_tidy_function_access.sql. Read-only.

-- 1. Settings and who may call each function.
select p.oid::regprocedure::text as function_signature,
  p.proconfig as config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('guard_bill_summaries', 'handle_new_user',
                    'validate_bill_summary', 'search_bills', 'get_related_bills')
order by 1;
-- expect: the two trigger functions anon/authenticated false;
--         validate_bill_summary {search_path=""};
--         search_bills, get_related_bills {"search_path=pg_catalog, public"},
--         anon and authenticated true.

-- 2. Search and related bills still return rows.
select count(*) as search_rows from public.search_bills('domestic violence');
select count(*) as related_rows
from public.get_related_bills((select id from public.bills where embedding is not null limit 1));

-- 3. Both triggers are still enabled.
select tgrelid::regclass as table_name, tgname, tgenabled
from pg_trigger
where tgname in ('trg_guard_bill_summaries', 'on_auth_user_created');
-- expect two rows, tgenabled = 'O'

-- 4. After the next sign-in and the next daily run: new profiles keep
--    appearing and summaries keep being written.
select count(*) as profiles_last_day
from public.profiles p
join auth.users u on u.id = p.id
where u.created_at >= now() - interval '1 day';
