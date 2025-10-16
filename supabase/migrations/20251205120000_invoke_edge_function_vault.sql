-- vault-backed edge invoke with error logging
create or replace function public.invoke_edge_function(endpoint text, job_name text default 'daily-bill-sync')
returns void
language plpgsql
security definer
as $$
declare
  status_code int;
  anon_key text;
begin
  anon_key := vault.get_secret('supabase_anon_key');

  select status into status_code
  from net.http_post(
    url := 'https://klpwiiszmzzfvlbfsjrd.supabase.co/functions/v1/' || endpoint,
    headers := '{"Content-Type": "application/json", "apikey": "' || anon_key || '"}'
  );

  if status_code != 200 then
    insert into public.cron_job_errors(job_name, error_message)
    values (job_name, 'Invoke Error: ' || endpoint || ' returned status ' || status_code);
  end if;
exception
  when others then
    insert into public.cron_job_errors(job_name, error_message)
    values (job_name, 'Invoke Error: ' || endpoint || ' failed: ' || sqlerrm);
end;
$$;

-- keep wrappers stable
create or replace function public.invoke_sync_updated_bills() returns void
language plpgsql security definer
as $$ begin perform public.invoke_edge_function('sync-updated-bills','daily-bill-sync'); end $$;

-- normalize index name if prior snapshot used a different one
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='i' and n.nspname='public' and c.relname='idx_location_lookup_cache_expires_at'
  ) then
    execute 'alter index public.idx_location_lookup_cache_expires_at rename to location_lookup_cache_expires_idx';
  end if;
end $$;

create index if not exists location_lookup_cache_expires_idx
  on public.location_lookup_cache(expires_at);
