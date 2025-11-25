-- ================================================================
-- PART 6: ADMIN RPCs (Fix Persistence)
-- ================================================================

-- Secure RPC to update bill reviews (Bypasses RLS for UPDATE)
CREATE OR REPLACE FUNCTION public.update_bill_review(
  p_bill_id BIGINT,
  p_review JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with service role privileges
SET search_path = public
AS $$
BEGIN
  -- 1. Check if caller is an admin
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- 2. Update the bill
  UPDATE public.bills
  SET panel_review = p_review
  WHERE id = p_bill_id;

  -- 3. Log the action (internal log, robust against RLS)
  INSERT INTO public.admin_audit_log (user_id, action, bill_id, details)
  VALUES (
    auth.uid(), 
    'update_bill_review_rpc', 
    p_bill_id, 
    jsonb_build_object('review_length', length(p_review::text))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bill_review(BIGINT, JSONB) TO authenticated;
