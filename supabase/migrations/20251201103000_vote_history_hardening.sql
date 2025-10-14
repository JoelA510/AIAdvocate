-- Vote history data hardening and summary repair
-- Ensures OpenStates identifiers are persisted for events/records and restores missing summaries.

BEGIN;

ALTER TABLE public.vote_events
  ADD COLUMN IF NOT EXISTS openstates_vote_event_id TEXT;

UPDATE public.vote_events
SET openstates_vote_event_id = COALESCE(openstates_vote_event_id, provider_vote_event_id)
WHERE openstates_vote_event_id IS NULL
  AND provider_vote_event_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.vote_events WHERE openstates_vote_event_id IS NULL
  ) THEN
    RAISE EXCEPTION 'vote_events rows missing openstates_vote_event_id';
  END IF;
END $$;

ALTER TABLE public.vote_events
  ALTER COLUMN openstates_vote_event_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_vote_events_external'
  ) THEN
    ALTER TABLE public.vote_events
      ADD CONSTRAINT uq_vote_events_external UNIQUE (openstates_vote_event_id);
  END IF;
END $$;

ALTER TABLE public.vote_records
  ADD COLUMN IF NOT EXISTS person_openstates_id TEXT;

UPDATE public.vote_records vr
SET person_openstates_id = l.provider_person_id
FROM public.legislators l
WHERE vr.legislator_id = l.id
  AND l.provider_person_id IS NOT NULL
  AND vr.person_openstates_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.vote_records WHERE person_openstates_id IS NULL
  ) THEN
    RAISE EXCEPTION 'vote_records rows missing person_openstates_id';
  END IF;
END $$;

ALTER TABLE public.vote_records
  ALTER COLUMN person_openstates_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_vote_records_event_person'
  ) THEN
    ALTER TABLE public.vote_records
      ADD CONSTRAINT uq_vote_records_event_person UNIQUE (vote_event_id, person_openstates_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bills_openstates
  ON public.bills(openstates_bill_id)
  WHERE openstates_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vote_records_legislator
  ON public.vote_records(legislator_id);

UPDATE public.bills
SET simple_summary_en = COALESCE(simple_summary_en, LEFT(medium_summary_en, 280)),
    simple_summary_es = COALESCE(simple_summary_es, LEFT(medium_summary_es, 280))
WHERE (simple_summary_en IS NULL AND medium_summary_en IS NOT NULL)
   OR (simple_summary_es IS NULL AND medium_summary_es IS NOT NULL);

COMMIT;
