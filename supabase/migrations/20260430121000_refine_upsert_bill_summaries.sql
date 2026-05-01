-- Refine upsert_bill_and_translation to use robust JSONB extraction for boolean/integer fields.
-- This ensures summary_ok and summary_len_simple are correctly persisted from JSON payloads.

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

  IF NULLIF(bill->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'bill.id is required';
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
    NULLIF(bill->>'status_date', '')::DATE,
    bill->>'state_link',
    bill->>'change_hash',
    bill->>'original_text',
    bill->>'original_text_formatted',
    bill->>'summary_simple',
    bill->>'summary_medium',
    bill->>'summary_complex',
    (bill->'summary_ok')::BOOLEAN,
    (bill->'summary_len_simple')::INTEGER,
    bill->>'summary_hash',
    COALESCE(bill->'progress', '[]'::jsonb),
    COALESCE(bill->'calendar', '[]'::jsonb),
    COALESCE(bill->'history', '[]'::jsonb),
    CASE
      WHEN bill ? 'embedding'
       AND NULLIF(bill->>'embedding', '') IS NOT NULL
      THEN (bill->>'embedding')::vector
      ELSE NULL
    END
  ON CONFLICT (id) DO UPDATE SET
    bill_number = EXCLUDED.bill_number,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    status_text = EXCLUDED.status_text,
    status_date = EXCLUDED.status_date,
    state_link = EXCLUDED.state_link,
    change_hash = EXCLUDED.change_hash,
    original_text = COALESCE(EXCLUDED.original_text, public.bills.original_text),
    original_text_formatted = COALESCE(EXCLUDED.original_text_formatted, public.bills.original_text_formatted),
    summary_simple = COALESCE(EXCLUDED.summary_simple, public.bills.summary_simple),
    summary_medium = COALESCE(EXCLUDED.summary_medium, public.bills.summary_medium),
    summary_complex = COALESCE(EXCLUDED.summary_complex, public.bills.summary_complex),
    summary_ok = COALESCE(EXCLUDED.summary_ok, public.bills.summary_ok),
    summary_len_simple = COALESCE(EXCLUDED.summary_len_simple, public.bills.summary_len_simple),
    summary_hash = COALESCE(EXCLUDED.summary_hash, public.bills.summary_hash),
    progress = EXCLUDED.progress,
    calendar = EXCLUDED.calendar,
    history = EXCLUDED.history,
    embedding = CASE
      WHEN EXCLUDED.embedding IS NOT NULL AND (EXCLUDED.summary_hash IS DISTINCT FROM public.bills.summary_hash OR public.bills.embedding IS NULL)
      THEN EXCLUDED.embedding
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
      COALESCE(NULLIF(tr->>'updated_at', '')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (bill_id, language_code) DO UPDATE SET
      summary_simple = EXCLUDED.summary_simple,
      summary_medium = EXCLUDED.summary_medium,
      summary_complex = EXCLUDED.summary_complex,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;
