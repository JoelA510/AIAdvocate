-- vault-backed edge invoke with error logging
CREATE OR REPLACE FUNCTION public.invoke_edge_function(endpoint TEXT, job_name TEXT DEFAULT 'daily-bill-sync')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  status_code INT;
  anon_key    TEXT;
  base_url    TEXT;
BEGIN
  -- prefer Vault, then app_config
  base_url := COALESCE(
    vault.get_secret('functions_base_url'),
    (SELECT value FROM public.app_config WHERE key = 'functions_base_url' LIMIT 1)
  );

  IF base_url IS NULL OR base_url = '' THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: missing functions_base_url (Vault and app_config empty)');
    RETURN;
  END IF;

  anon_key := vault.get_secret('supabase_anon_key');
  IF anon_key IS NULL OR anon_key = '' THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: missing supabase_anon_key');
    RETURN;
  END IF;

  -- normalize final URL
  base_url := rtrim(base_url, '/');

  SELECT status INTO status_code
  FROM net.http_post(
    url     := base_url || '/' || endpoint,
    headers := jsonb_build_object('Content-Type','application/json','apikey', anon_key)::text
  );

  IF status_code <> 200 THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: ' || endpoint || ' returned status ' || status_code);
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.cron_job_errors(job_name, error_message)
    VALUES (job_name, 'Invoke Error: ' || endpoint || ' failed: ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_edge_function(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.invoke_edge_function(text, text) TO service_role;

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
