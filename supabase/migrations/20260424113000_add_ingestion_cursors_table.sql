-- Durable cursor storage for bounded ingestion Edge Functions.
-- Non-destructive: adds a new table used by service-role workers.

CREATE TABLE IF NOT EXISTS public.ingestion_cursors (
  key TEXT PRIMARY KEY,
  cursor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ingestion_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_cursors_service_role ON public.ingestion_cursors;
CREATE POLICY ingestion_cursors_service_role
  ON public.ingestion_cursors
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.ingestion_cursors FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingestion_cursors TO service_role;
