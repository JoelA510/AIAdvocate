-- Schedule the votes-daily edge function at 02:15 America/Los_Angeles.
DO $$
DECLARE
  original_timezone TEXT := current_setting('TimeZone');
BEGIN
  BEGIN
    PERFORM cron.unschedule('votes-daily');
  EXCEPTION
    WHEN others THEN
      NULL;
  END;

  PERFORM set_config('TimeZone', 'America/Los_Angeles', true);

  PERFORM cron.schedule(
    'votes-daily',
    '15 2 * * *',
    'SELECT public.invoke_edge_function(''votes-daily'', ''votes-daily'')'
  );

  PERFORM set_config('TimeZone', original_timezone, true);
END;
$$;
