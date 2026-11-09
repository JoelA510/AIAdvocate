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
-- request may start. A grant is issued only once that time has arrived, in the
-- same row-locked statement that pushes the next slot out by the gap; a caller
-- that is early gets retry_after_ms and asks again. The caller sends its
-- request immediately on a grant, so two requests can be closer than the gap
-- only by the grant RPC's response latency (the client refuses or flags a
-- grant whose round trip exceeded gap - 1000 ms, keeping the 1000 ms floor).
-- Handing out future slots and sleeping client-side was rejected: differing
-- RPC latencies between callers could collapse the spacing entirely.
--
-- Two entry points:
--   reserve_legiscan_api_call_gated  -- first attempt of every request: the
--     quota/cooldown reservation and the slot grant happen in one transaction,
--     so a gate that is busy or unreachable never consumes a reservation (a
--     getBillText reservation holds for a year).
--   claim_legiscan_slot              -- retries of an already-reserved request.
--
-- Rollback (after rolling back the Edge Functions that call these; they fail
-- closed, sending nothing, when the RPCs are missing):
--   DROP FUNCTION public.reserve_legiscan_api_call_gated(text, text, integer, integer, integer, integer);
--   DROP FUNCTION public.claim_legiscan_slot(integer);
--   DROP TABLE public.legiscan_rate_gate;

CREATE TABLE IF NOT EXISTS public.legiscan_rate_gate (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_slot_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.legiscan_rate_gate (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- Internal state: no client role reads or writes it. RLS with no policies plus
-- revoked grants; the SECURITY DEFINER functions below are the only writers.
ALTER TABLE public.legiscan_rate_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legiscan_rate_gate FROM PUBLIC, anon, authenticated;

-- Grant a slot if one is due now, else report how long until it is.
-- clock_timestamp, not now(): now() is the transaction start, and callers queue
-- on the row lock, so it would compare against a stale time.
CREATE OR REPLACE FUNCTION public.claim_legiscan_slot(
  p_min_gap_ms integer DEFAULT 1500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  gap_ms integer := LEAST(GREATEST(COALESCE(p_min_gap_ms, 1500), 1000), 10000);
  next_slot timestamptz;
  now_value timestamptz;
BEGIN
  INSERT INTO public.legiscan_rate_gate (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT g.next_slot_at INTO next_slot
  FROM public.legiscan_rate_gate AS g
  WHERE g.id
  FOR UPDATE;

  now_value := clock_timestamp();
  IF next_slot > now_value THEN
    RETURN jsonb_build_object(
      'granted', false,
      'retry_after_ms',
      CEIL(EXTRACT(EPOCH FROM (next_slot - now_value)) * 1000)::integer
    );
  END IF;

  UPDATE public.legiscan_rate_gate AS g
     SET next_slot_at = now_value + make_interval(secs => gap_ms / 1000.0)
   WHERE g.id;

  RETURN jsonb_build_object('granted', true, 'gap_ms', gap_ms);
END;
$$;

-- reserve_legiscan_api_call plus a slot grant, atomically. Returns the
-- reservation result unchanged when the gate is open (the slot is consumed only
-- if the reservation is allowed), or {allowed:false, reason:'rate_gate',
-- retry_after_ms} without touching the call log when it is not.
CREATE OR REPLACE FUNCTION public.reserve_legiscan_api_call_gated(
  p_endpoint text,
  p_resource_key text DEFAULT 'global',
  p_cooldown_seconds integer DEFAULT 0,
  p_daily_limit integer DEFAULT 900,
  p_monthly_limit integer DEFAULT 25000,
  p_min_gap_ms integer DEFAULT 1500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  gap_ms integer := LEAST(GREATEST(COALESCE(p_min_gap_ms, 1500), 1000), 10000);
  next_slot timestamptz;
  now_value timestamptz;
  reservation jsonb;
BEGIN
  INSERT INTO public.legiscan_rate_gate (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT g.next_slot_at INTO next_slot
  FROM public.legiscan_rate_gate AS g
  WHERE g.id
  FOR UPDATE;

  now_value := clock_timestamp();
  IF next_slot > now_value THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'rate_gate',
      'retry_after_ms',
      CEIL(EXTRACT(EPOCH FROM (next_slot - now_value)) * 1000)::integer
    );
  END IF;

  reservation := public.reserve_legiscan_api_call(
    p_endpoint,
    p_resource_key,
    p_cooldown_seconds,
    p_daily_limit,
    p_monthly_limit
  );

  IF COALESCE((reservation ->> 'allowed')::boolean, false) THEN
    UPDATE public.legiscan_rate_gate AS g
       SET next_slot_at = clock_timestamp() + make_interval(secs => gap_ms / 1000.0)
     WHERE g.id;
  END IF;

  RETURN reservation;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_legiscan_slot(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legiscan_slot(integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_legiscan_api_call_gated(text, text, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_legiscan_api_call_gated(text, text, integer, integer, integer, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
