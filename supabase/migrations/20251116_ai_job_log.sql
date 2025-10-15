create table if not exists public.ai_job_log (
  id bigserial primary key,
  ts timestamptz default now(),
  job text not null,                 -- e.g., 'summarize-simple' | 'summarize-backfill'
  bill_id bigint,
  status text not null,              -- 'ok' | 'empty' | 'http_error' | 'exception' | 'invoke_error'
  http_status int,                   -- HTTP status from downstream call (if applicable)
  finish_reason text,                -- OpenAI finish_reason when available
  model text,                        -- OpenAI model
  response_id text,                  -- OpenAI response id
  token_usage jsonb,                 -- {prompt_tokens, completion_tokens, total_tokens}
  prompt_chars int,                  -- source length
  content_chars int,                 -- summary length
  preview text,                      -- first ~200 chars of summary
  error text                         -- truncated error message
);

-- helpful index
create index if not exists ai_job_log_bill_job_ts on public.ai_job_log (bill_id, job, ts desc);
