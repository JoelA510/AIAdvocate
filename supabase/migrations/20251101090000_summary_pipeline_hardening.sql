-- Add formatted source text column and summary quality metadata
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS original_text_formatted TEXT,
  ADD COLUMN IF NOT EXISTS summary_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS summary_len_simple INTEGER,
  ADD COLUMN IF NOT EXISTS summary_hash TEXT;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS summary_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary_lease_owner TEXT;

-- Upsert helper to ensure bills and translations update atomically
CREATE OR REPLACE FUNCTION public.upsert_bill_and_translation(bill JSONB, tr JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF bill IS NULL THEN
    RAISE EXCEPTION 'bill payload is required';
  END IF;

  INSERT INTO public.bills (
    id,
    bill_number,
    title,
    description,
    status,
    status_text,
    status_date,
    state_link,
    change_hash,
    original_text,
    original_text_formatted,
    summary_simple,
    summary_medium,
    summary_complex,
    summary_ok,
    summary_len_simple,
    summary_hash,
    progress,
    calendar,
    history,
    embedding
  )
  SELECT
    (bill->>'id')::BIGINT,
    bill->>'bill_number',
    bill->>'title',
    bill->>'description',
    NULLIF(bill->>'status', ''),
    bill->>'status_text',
    (bill->>'status_date')::DATE,
    bill->>'state_link',
    bill->>'change_hash',
    bill->>'original_text',
    bill->>'original_text_formatted',
    bill->>'summary_simple',
    bill->>'summary_medium',
    bill->>'summary_complex',
    (bill->>'summary_ok')::BOOLEAN,
    (bill->>'summary_len_simple')::INTEGER,
    bill->>'summary_hash',
    bill->'progress',
    bill->'calendar',
    bill->'history',
    CASE WHEN bill ? 'embedding' THEN (bill->>'embedding')::vector ELSE NULL END
  ON CONFLICT (id) DO UPDATE SET
    bill_number = EXCLUDED.bill_number,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    status_text = EXCLUDED.status_text,
    status_date = EXCLUDED.status_date,
    state_link = EXCLUDED.state_link,
    change_hash = EXCLUDED.change_hash,
    original_text = EXCLUDED.original_text,
    original_text_formatted = EXCLUDED.original_text_formatted,
    summary_simple = EXCLUDED.summary_simple,
    summary_medium = EXCLUDED.summary_medium,
    summary_complex = EXCLUDED.summary_complex,
    summary_ok = EXCLUDED.summary_ok,
    summary_len_simple = EXCLUDED.summary_len_simple,
    summary_hash = EXCLUDED.summary_hash,
    progress = EXCLUDED.progress,
    calendar = EXCLUDED.calendar,
    history = EXCLUDED.history,
    embedding = CASE
      WHEN EXCLUDED.summary_hash IS DISTINCT FROM public.bills.summary_hash THEN EXCLUDED.embedding
      ELSE public.bills.embedding
    END;

  IF tr IS NOT NULL THEN
    INSERT INTO public.bill_translations (
      bill_id,
      language_code,
      summary_simple,
      summary_medium,
      summary_complex,
      updated_at
    )
    VALUES (
      (tr->>'bill_id')::BIGINT,
      tr->>'language_code',
      tr->>'summary_simple',
      tr->>'summary_medium',
      tr->>'summary_complex',
      COALESCE((tr->>'updated_at')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (bill_id, language_code) DO UPDATE SET
      summary_simple = EXCLUDED.summary_simple,
      summary_medium = EXCLUDED.summary_medium,
      summary_complex = EXCLUDED.summary_complex,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_bill_and_translation(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_bill_and_translation(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_bill_summaries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trimmed TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.summary_simple IS NOT NULL AND NEW.summary_simple IS DISTINCT FROM OLD.summary_simple THEN
      RAISE EXCEPTION 'summary_simple overwrite blocked';
    END IF;
    IF OLD.summary_medium IS NOT NULL AND NEW.summary_medium IS DISTINCT FROM OLD.summary_medium THEN
      RAISE EXCEPTION 'summary_medium overwrite blocked';
    END IF;
    IF OLD.summary_complex IS NOT NULL AND NEW.summary_complex IS DISTINCT FROM OLD.summary_complex THEN
      RAISE EXCEPTION 'summary_complex overwrite blocked';
    END IF;

    IF OLD.summary_simple IS NULL AND NEW.summary_simple IS NOT NULL THEN
      trimmed := trim(NEW.summary_simple);
      IF length(trimmed) < 40 OR trimmed ~* '^(error[:\s]|placeholder)' OR trimmed ~* 'placeholder' THEN
        RAISE EXCEPTION 'invalid summary_simple';
      END IF;
    END IF;

    IF OLD.summary_medium IS NULL AND NEW.summary_medium IS NOT NULL THEN
      trimmed := trim(NEW.summary_medium);
      IF length(trimmed) < 40 OR trimmed ~* '^(error[:\s]|placeholder)' OR trimmed ~* 'placeholder' THEN
        RAISE EXCEPTION 'invalid summary_medium';
      END IF;
    END IF;

    IF OLD.summary_complex IS NULL AND NEW.summary_complex IS NOT NULL THEN
      trimmed := trim(NEW.summary_complex);
      IF length(trimmed) < 40 OR trimmed ~* '^(error[:\s]|placeholder)' OR trimmed ~* 'placeholder' THEN
        RAISE EXCEPTION 'invalid summary_complex';
      END IF;
    END IF;
  ELSE
    IF NEW.summary_simple IS NOT NULL THEN
      trimmed := trim(NEW.summary_simple);
      IF length(trimmed) < 40 OR trimmed ~* '^(error[:\s]|placeholder)' OR trimmed ~* 'placeholder' THEN
        RAISE EXCEPTION 'invalid summary_simple';
      END IF;
    END IF;

    IF NEW.summary_medium IS NOT NULL THEN
      trimmed := trim(NEW.summary_medium);
      IF length(trimmed) < 40 OR trimmed ~* '^(error[:\s]|placeholder)' OR trimmed ~* 'placeholder' THEN
        RAISE EXCEPTION 'invalid summary_medium';
      END IF;
    END IF;

    IF NEW.summary_complex IS NOT NULL THEN
      trimmed := trim(NEW.summary_complex);
      IF length(trimmed) < 40 OR trimmed ~* '^(error[:\s]|placeholder)' OR trimmed ~* 'placeholder' THEN
        RAISE EXCEPTION 'invalid summary_complex';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bill_summaries ON public.bills;
CREATE TRIGGER trg_guard_bill_summaries
BEFORE INSERT OR UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.guard_bill_summaries();

DROP FUNCTION IF EXISTS public.lease_next_bill();
CREATE OR REPLACE FUNCTION public.lease_next_bill(p_owner text, p_ttl_seconds int DEFAULT 900)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cte AS (
    SELECT id FROM public.bills
    WHERE (summary_ok IS DISTINCT FROM TRUE)
      AND (summary_lease_until IS NULL OR summary_lease_until < now())
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.bills b
     SET summary_lease_until = now() + make_interval(secs => p_ttl_seconds),
         summary_lease_owner = p_owner
  FROM cte
  WHERE b.id = cte.id
  RETURNING b.id;
$$;

REVOKE ALL ON FUNCTION public.lease_next_bill(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lease_next_bill(text, int) TO service_role;

CREATE INDEX IF NOT EXISTS bills_summary_ok_idx
  ON public.bills ((summary_ok IS DISTINCT FROM TRUE));

CREATE OR REPLACE FUNCTION public.release_bill_lease(p_id bigint, p_owner text, p_ok boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bills
     SET summary_ok = p_ok,
         summary_lease_until = NULL,
         summary_lease_owner = NULL
   WHERE id = p_id
     AND summary_lease_owner = p_owner;
$$;

REVOKE ALL ON FUNCTION public.release_bill_lease(bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_bill_lease(bigint, text, boolean) TO service_role;

CREATE OR REPLACE VIEW public.v_bill_summary_leases AS
SELECT id, summary_ok, summary_lease_owner, summary_lease_until
FROM public.bills
WHERE summary_ok IS DISTINCT FROM TRUE
   OR summary_lease_until IS NOT NULL;
