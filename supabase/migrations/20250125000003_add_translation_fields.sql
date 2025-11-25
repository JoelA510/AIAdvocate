-- ================================================================
-- FIX: ADD MISSING COLUMNS
-- ================================================================

-- Add human_verified column to bill_translations if it doesn't exist
ALTER TABLE public.bill_translations 
ADD COLUMN IF NOT EXISTS human_verified BOOLEAN DEFAULT FALSE;

-- ================================================================
-- RE-APPLY PREVIOUS FIXES (Safe to run again)
-- ================================================================

-- 1. Improve Logging (Show actual text changes)
CREATE OR REPLACE FUNCTION public.update_bill_review(
  p_bill_id BIGINT,
  p_review JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  UPDATE public.bills
  SET panel_review = p_review
  WHERE id = p_bill_id;

  INSERT INTO public.admin_audit_log (user_id, action, bill_id, details)
  VALUES (auth.uid(), 'update_bill_review', p_bill_id, p_review);
END;
$$;

-- 2. Fix Translation Permissions (RLS)
ALTER TABLE public.bill_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage translations" ON public.bill_translations;
CREATE POLICY "Admins can manage translations" ON public.bill_translations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()));

-- 3. Insert Test Translation (If none exist for the current bill)
-- Replace 1968238 with your specific Bill ID if different
INSERT INTO public.bill_translations (bill_id, language_code, title, summary_simple, human_verified)
SELECT id, 'es', 'Título de prueba', 'Resumen de prueba', false
FROM public.bills
WHERE id = 1968238
AND NOT EXISTS (SELECT 1 FROM public.bill_translations WHERE bill_id = 1968238 AND language_code = 'es');
