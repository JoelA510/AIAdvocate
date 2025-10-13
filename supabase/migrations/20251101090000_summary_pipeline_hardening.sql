-- Add formatted source text column and summary quality metadata
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS original_text_formatted TEXT,
  ADD COLUMN IF NOT EXISTS summary_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS summary_len_simple INTEGER,
  ADD COLUMN IF NOT EXISTS summary_hash TEXT;

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
    embedding = EXCLUDED.embedding;

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
