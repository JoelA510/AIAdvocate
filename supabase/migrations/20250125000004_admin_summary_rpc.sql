-- ================================================================
-- FIX: SECURE SUMMARY UPDATES (RPCs)
-- ================================================================

-- 1. RPC for updating Bill Summaries (English/Default)
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
END;
$$;

-- 2. RPC for updating Bill Translations
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
BEGIN
  -- Check Admin Access
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- Upsert Translation (Insert or Update)
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
END;
$$;
