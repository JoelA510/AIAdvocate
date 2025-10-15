-- Create enum for strict status values
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_job_status') then
    create type public.ai_job_status as enum ('ok','empty','http_error','exception','invoke_error');
  end if;
end$$;

-- Backfill any unexpected strings to a safe bucket before type change
update public.ai_job_log
set status = 'exception'
where status not in ('ok','empty','http_error','exception','invoke_error');

-- Alter column to enum
alter table public.ai_job_log
  alter column status type public.ai_job_status
  using status::public.ai_job_status;
