-- ================================================================
-- FIX: IMPROVE LOGGING DETAIL
-- ================================================================

-- Update the RPC to log the full content of the review
CREATE OR REPLACE FUNCTION public.update_bill_review(
  p_bill_id BIGINT,
  p_review JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_review JSONB;
BEGIN
  -- 1. Check if caller is an admin
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- 2. Get old review for logging (optional, but good for diffs)
  SELECT panel_review INTO v_old_review FROM public.bills WHERE id = p_bill_id;

  -- 3. Update the bill
  UPDATE public.bills
  SET panel_review = p_review
  WHERE id = p_bill_id;

  -- 4. Log the action with FULL details
  -- We log the new state. Diffs can be computed if needed, but new state is what the user asked for.
  INSERT INTO public.admin_audit_log (user_id, action, bill_id, details)
  VALUES (
    auth.uid(), 
    'update_bill_review', -- Changed from _rpc to match standard action name
    p_bill_id, 
    p_review -- Log the entire JSON object (notes, pros, cons)
  );
END;
$$;
