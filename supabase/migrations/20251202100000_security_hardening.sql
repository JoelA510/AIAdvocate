-- Tighten access controls for operational tables and vote history view

BEGIN;

-- job_state should only be visible to privileged functions
ALTER TABLE public.job_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_state'
      AND policyname = 'job_state_service_role'
  ) THEN
    DROP POLICY job_state_service_role ON public.job_state;
  END IF;
END $$;

CREATE POLICY job_state_service_role
  ON public.job_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.job_state FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_state TO service_role;

-- Recreate v_rep_vote_history with runtime checks so anonymous callers see nothing
CREATE OR REPLACE VIEW public.v_rep_vote_history AS
WITH access AS (
  SELECT
    CASE
      WHEN auth.role() = 'service_role' THEN TRUE
      WHEN auth.uid() IS NOT NULL THEN TRUE
      ELSE FALSE
    END AS allowed
)
SELECT
  l.id AS legislator_id,
  l.name AS legislator_name,
  l.party,
  l.district,
  l.title,
  b.id AS bill_id,
  b.bill_number,
  b.title AS bill_title,
  ve.id AS vote_event_id,
  ve.date AS vote_date,
  ve.motion,
  ve.result AS vote_result,
  vr.choice AS vote_choice
FROM public.vote_records vr
JOIN public.vote_events ve ON ve.id = vr.vote_event_id
JOIN public.bills b ON b.id = ve.bill_id
JOIN public.legislators l ON l.id = vr.legislator_id
CROSS JOIN access
WHERE access.allowed;

REVOKE ALL ON public.v_rep_vote_history FROM PUBLIC;
GRANT SELECT ON public.v_rep_vote_history TO authenticated;
GRANT SELECT ON public.v_rep_vote_history TO service_role;

COMMIT;
