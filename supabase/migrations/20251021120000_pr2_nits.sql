-- migrate:up

-- Idempotent: ensure anon/authenticated can resolve objects in public
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Replace remaining service_role policies to use TO clause

-- bill_translations
DROP POLICY IF EXISTS "Service role can manage translations" ON public.bill_translations;
CREATE POLICY "Service role can manage translations"
ON public.bill_translations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- events
DROP POLICY IF EXISTS "Allow service role to insert events" ON public.events;
CREATE POLICY "Allow service role to insert events"
ON public.events
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to update events" ON public.events;
CREATE POLICY "Allow service role to update events"
ON public.events
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to delete events" ON public.events;
CREATE POLICY "Allow service role to delete events"
ON public.events
FOR DELETE
TO service_role
USING (true);

-- vote_events
DROP POLICY IF EXISTS "Service role manages vote events" ON public.vote_events;
CREATE POLICY "Service role manages vote events"
ON public.vote_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- vote_records
DROP POLICY IF EXISTS "Service role manages vote records" ON public.vote_records;
CREATE POLICY "Service role manages vote records"
ON public.vote_records
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- job_state
DROP POLICY IF EXISTS job_state_service_role ON public.job_state;
CREATE POLICY job_state_service_role
ON public.job_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
