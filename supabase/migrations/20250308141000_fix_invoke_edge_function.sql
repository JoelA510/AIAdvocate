BEGIN;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(endpoint TEXT, job_name TEXT DEFAULT 'daily-bill-sync')
RETURNS VOID AS $$
DECLARE
  request_id BIGINT;
BEGIN
  BEGIN
    SELECT net.http_post(
      url := 'https://klpwiiszmzzfvlbfsjrd.supabase.co/functions/v1/' || endpoint,
      headers := '{"Content-Type": "application/json"}'
    )
    INTO request_id;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.cron_job_errors (job_name, error_message)
      VALUES (
        job_name,
        'Invoke Error: Edge Function ' || endpoint || ' failed with ' || SQLERRM
      );
      RETURN;
  END;

  IF request_id IS NULL THEN
    INSERT INTO public.cron_job_errors (job_name, error_message)
    VALUES (
      job_name,
      'Invoke Error: Edge Function ' || endpoint || ' returned null request id'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
