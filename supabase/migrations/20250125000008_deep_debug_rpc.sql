-- ================================================================
-- FIX: DEEP DEBUG RPC (CORRECTED)
-- ================================================================

-- Drop the old function first because we are changing the return type from VOID to JSONB
DROP FUNCTION IF EXISTS public.update_bill_summary(bigint, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_bill_summary(
  p_bill_id BIGINT,
  p_title TEXT,
  p_simple TEXT,
  p_medium TEXT,
  p_complex TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INT;
  v_new_medium TEXT;
  v_result JSONB;
BEGIN
  -- 1. Check Admin
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- 2. Perform Update
  UPDATE public.bills
  SET 
    title = p_title,
    summary_simple = p_simple,
    summary_medium = p_medium,
    summary_complex = p_complex
  WHERE id = p_bill_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  -- 3. Check Row Count
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Update Failed: No bill found with ID %', p_bill_id;
  END IF;

  -- 4. Verify Data Immediately
  SELECT summary_medium INTO v_new_medium FROM public.bills WHERE id = p_bill_id;
  
  -- 5. Compare (Check Medium specifically as that was the test case)
  IF v_new_medium IS DISTINCT FROM p_medium THEN
    RAISE EXCEPTION 'DATA MISMATCH! Update ran but DB has different value. Input: %, DB: %', p_medium, v_new_medium;
  END IF;

  -- 6. Return the full row as JSON
  SELECT row_to_json(b)::jsonb INTO v_result FROM public.bills b WHERE id = p_bill_id;
  RETURN v_result;
END;
$$;
