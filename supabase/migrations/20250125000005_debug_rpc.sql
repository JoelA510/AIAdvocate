-- ================================================================
-- FIX: DEBUG RPC PERSISTENCE
-- ================================================================

-- 1. Debug RPC for Bill Summaries (English)
CREATE OR REPLACE FUNCTION public.update_bill_summary(
  p_bill_id BIGINT,
  p_title TEXT,
  p_simple TEXT,
  p_medium TEXT,
  p_complex TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  -- Check Admin Access
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- Update Bill
  UPDATE public.bills
  SET 
    title = p_title,
    summary_simple = p_simple,
    summary_medium = p_medium,
    summary_complex = p_complex
  WHERE id = p_bill_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Update Failed: No bill found with ID %', p_bill_id;
  END IF;
END;
$$;

-- 2. Debug RPC for Translations
CREATE OR REPLACE FUNCTION public.update_bill_translation_secure(
  p_bill_id BIGINT,
  p_language_code TEXT,
  p_title TEXT,
  p_simple TEXT,
  p_medium TEXT,
  p_complex TEXT,
  p_verified BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  -- Check Admin Access
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- Upsert Translation
  INSERT INTO public.bill_translations (
    bill_id, language_code, title, summary_simple, summary_medium, summary_complex, human_verified
  )
  VALUES (
    p_bill_id, p_language_code, p_title, p_simple, p_medium, p_complex, p_verified
  )
  ON CONFLICT (bill_id, language_code)
  DO UPDATE SET
    title = EXCLUDED.title,
    summary_simple = EXCLUDED.summary_simple,
    summary_medium = EXCLUDED.summary_medium,
    summary_complex = EXCLUDED.summary_complex,
    human_verified = EXCLUDED.human_verified;

  -- Note: INSERT ON CONFLICT UPDATE always affects at least 1 row unless it does nothing (DO NOTHING)
  -- But checking anyway
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Update Failed: Translation upsert affected 0 rows';
  END IF;
END;
$$;
