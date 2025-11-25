-- ================================================================
-- FIX: UPDATE GUARD TO ALLOW ADMIN OVERRIDES
-- ================================================================

CREATE OR REPLACE FUNCTION public.guard_bill_summaries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Check if the current user is an admin
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()
  ) INTO is_admin;

  -- IF ADMIN: Allow everything (Skip checks)
  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- IF NOT ADMIN: Apply original protection logic

  -- sanitize placeholder
  IF NEW.summary_simple IS NOT NULL AND NEW.summary_simple ~* '^Placeholder for[[:space:]]' THEN
    NEW.summary_simple := NULL;
  END IF;

  -- block overwrites (Original Logic)
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
  END IF;

  -- validate newly-set fields
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.summary_simple IS NULL)) THEN
    PERFORM public.validate_bill_summary(NEW.summary_simple, 'summary_simple');
  END IF;
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.summary_medium IS NULL)) THEN
    PERFORM public.validate_bill_summary(NEW.summary_medium, 'summary_medium');
  END IF;
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.summary_complex IS NULL)) THEN
    PERFORM public.validate_bill_summary(NEW.summary_complex, 'summary_complex');
  END IF;

  RETURN NEW;
END;
$$;
