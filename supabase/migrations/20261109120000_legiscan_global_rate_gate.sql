-- 20261109120000_legiscan_global_rate_gate.sql
--
-- Cross-invocation spacing for LegiScan requests (docs/external-api-policy.md §3).
--
-- reserve_legiscan_api_call bounds per-resource cooldowns and daily/monthly
-- totals, and each Edge Function paces its own calls, but nothing spaced calls
-- made by *different* invocations. invoke_full_legislative_refresh fans out
-- parallel sync-updated-bills workers, and leginfo now serves a Cloudflare
-- challenge to cloud egress, so every bill without stored text falls back to
-- LegiScan. Production showed the result daily from 2026-10-28 to 2026-11-09:
-- three getBill calls 1-92 ms apart from three workers, overlapping
-- bulk-import-dataset's getSearch sweep (five calls in ~420 ms on 2026-10-28).
-- That is the burst pattern that locked the key on 2026-07-26.
--
-- Mechanism: a single-row table holds the earliest time the next LegiScan
-- request may start. claim_legiscan_slot() takes that slot and pushes the next
-- one out by the gap, in one row-locked UPDATE, and returns how long the caller
-- must sleep before issuing its request. No lock is held while anyone sleeps,
-- and callers never retry: concurrent callers simply receive successive slots.
--
-- Callers claim a slot for every HTTP request (retries included), after any
-- reservation and immediately before the fetch. The gap defaults to 1500 ms and
-- cannot go below the 1000 ms policy floor; the 500 ms margin absorbs RPC
-- latency differences between callers, which is the only way two requests can
-- land closer together than their slots.
--
-- Rollback: DROP FUNCTION public.claim_legiscan_slot(integer);
--           DROP TABLE public.legiscan_rate_gate;
-- Only after rolling back the Edge Functions that call it: they fail closed
-- (no LegiScan request) when the RPC is missing.

CREATE TABLE IF NOT EXISTS public.legiscan_rate_gate (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_slot_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.legiscan_rate_gate (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- Internal state: no client role reads or writes it. RLS with no policies plus
-- revoked grants; the SECURITY DEFINER function below is the only writer.
ALTER TABLE public.legiscan_rate_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legiscan_rate_gate FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_legiscan_slot(
  p_min_gap_ms integer DEFAULT 1500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- clock_timestamp, not now(): now() is the transaction start, and callers
  -- queue on the row lock, so it would hand a late caller an already-past slot.
  now_value timestamptz := clock_timestamp();
  gap_ms integer := LEAST(GREATEST(COALESCE(p_min_gap_ms, 1500), 1000), 10000);
  slot timestamptz;
BEGIN
  SELECT GREATEST(g.next_slot_at, now_value)
    INTO slot
  FROM public.legiscan_rate_gate AS g
  WHERE g.id
  FOR UPDATE;

  IF slot IS NULL THEN
    -- Row missing (should not happen after this migration): recreate it.
    INSERT INTO public.legiscan_rate_gate (id, next_slot_at)
    VALUES (true, now_value)
    ON CONFLICT (id) DO NOTHING;
    slot := now_value;
  END IF;

  UPDATE public.legiscan_rate_gate AS g
     SET next_slot_at = slot + make_interval(secs => gap_ms / 1000.0)
   WHERE g.id;

  RETURN jsonb_build_object(
    'wait_ms', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (slot - now_value)) * 1000))::integer,
    'slot_at', slot,
    'gap_ms', gap_ms
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_legiscan_slot(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legiscan_slot(integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
