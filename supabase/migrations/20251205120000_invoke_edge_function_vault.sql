-- vault-backed edge invoke with error logging
create or replace function public.invoke_edge_function(endpoint text, job_name text default 'daily-bill-sync')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  status_code int;
  anon_key    text;
  base_url    text;
begin
  -- config: prefer Vault, then app_config; if missing, log and exit
  base_url := coalesce(
    vault.get_secret('functions_base_url'),
    (select value from public.app_config where key = 'functions_base_url' limit 1)
  );

  if base_url is null then
    insert into public.cron_job_errors(job_name, error_message)
    values (job_name, 'Invoke Error: missing functions_base_url');
    return;
  end if;

  if right(base_url, 1) <> '/' then
    base_url := base_url || '/';
  end if;

  anon_key := vault.get_secret('supabase_anon_key');
  if anon_key is null then
    insert into public.cron_job_errors(job_name, error_message)
    values (job_name, 'Invoke Error: missing supabase_anon_key');
    return;
  end if;

  select status into status_code
  from net.http_post(
    url     := base_url || endpoint,
    headers := jsonb_build_object('Content-Type','application/json','apikey',anon_key)
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
