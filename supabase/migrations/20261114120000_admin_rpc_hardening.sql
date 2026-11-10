-- 20261114120000_admin_rpc_hardening.sql
--
-- Follow-up to 20261113120000. The three admin RPCs behind the admin web UI
-- all check public.app_admins before doing anything, so there was no open
-- hole; this tightens what surrounded them.
--
-- 1. anon no longer holds EXECUTE on update_bill_review, update_bill_summary
--    or update_bill_translation_secure. An anonymous caller was always
--    rejected by the admin check (auth.uid() is null); the grant served no
--    purpose. authenticated keeps it: the admin UI calls them as the signed-in
--    user.
--
-- 2. update_bill_summary and update_bill_translation_secure write their own
--    audit row, as update_bill_review already did. Until now the admin UI
--    logged these two edits itself, after the fact and best-effort: a failed
--    insert was only a console warning, and an admin calling the RPC directly
--    left no record. These are the edits that change what the public reads.
--    Action names and detail keys match what the UI wrote
--    ('update_bill_summary_en', 'update_bill_translation'), so the audit
--    screens read the same; details are now a JSON object rather than a
--    JSON-encoded string. The UI's own logging is removed in the same PR.
--    Function bodies are otherwise unchanged.
--
-- 3. admin_audit_log is written only by SECURITY DEFINER functions and the
--    service role:
--      - anon held INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES and
--        TRIGGER on the table, and authenticated the same. RLS blocked the
--        row operations, but TRUNCATE is not subject to RLS.
--      - The INSERT policy let any signed-in user, admin or not, add rows
--        under their own id.
--    Now: anon has nothing, authenticated has SELECT only (admins read the
--    log through the existing "Admins can view all audit logs" policy), and
--    the INSERT policy is dropped. A browser still running the previous UI
--    build will fail its own log insert, which it treats as a warning; the
--    edit itself is logged by the function.
--
-- Rollback:
--   GRANT EXECUTE ON FUNCTION <signature> TO anon;
--   GRANT INSERT ON public.admin_audit_log TO authenticated;
--   CREATE POLICY "Admins can log their actions" ON public.admin_audit_log
--     FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
--   and re-run the two function definitions from 20250125000003 / the
--   previous update_bill_summary definition to drop the audit inserts.

CREATE OR REPLACE FUNCTION public.update_bill_summary(
  p_bill_id bigint,
  p_title text,
  p_simple text,
  p_medium text,
  p_complex text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows_updated INT;
  v_new_medium TEXT;
  v_result JSONB;
BEGIN
  -- Check Admin
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

  -- Perform Update
  UPDATE public.bills
  SET
    title = p_title,
    summary_simple = p_simple,
    summary_medium = p_medium,
    summary_complex = p_complex
  WHERE id = p_bill_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Check Row Count
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Update Failed: No bill found with ID %', p_bill_id;
  END IF;

  -- Verify Data Immediately
  SELECT summary_medium INTO v_new_medium FROM public.bills WHERE id = p_bill_id;

  -- Compare
  IF v_new_medium IS DISTINCT FROM p_medium THEN
    RAISE EXCEPTION 'DATA MISMATCH! Update ran but DB has different value. Input: %, DB: %', p_medium, v_new_medium;
  END IF;

  -- Same transaction as the edit: no edit without its audit row.
  INSERT INTO public.admin_audit_log (user_id, action, bill_id, details)
  VALUES (
    auth.uid(),
    'update_bill_summary_en',
    p_bill_id,
    jsonb_build_object(
      'title', p_title,
      'simple', p_simple,
      'medium', p_medium,
      'complex', p_complex,
      'db_verified', true
    )
  );

  -- Return the full row as JSON
  SELECT row_to_json(b)::jsonb INTO v_result FROM public.bills b WHERE id = p_bill_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_bill_translation_secure(
  p_bill_id bigint,
  p_language_code text,
  p_title text,
  p_simple text,
  p_medium text,
  p_complex text,
  p_verified boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows_updated INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an admin';
  END IF;

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

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Update Failed: Translation upsert affected 0 rows';
  END IF;

  -- Same transaction as the edit: no edit without its audit row.
  INSERT INTO public.admin_audit_log (user_id, action, bill_id, details)
  VALUES (
    auth.uid(),
    'update_bill_translation',
    p_bill_id,
    jsonb_build_object(
      'language', p_language_code,
      'title', p_title,
      'simple', p_simple,
      'medium', p_medium,
      'complex', p_complex,
      'verified', p_verified
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_bill_review(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bill_review(bigint, jsonb)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_bill_summary(bigint, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bill_summary(bigint, text, text, text, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_bill_translation_secure(bigint, text, text, text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bill_translation_secure(bigint, text, text, text, text, text, boolean)
  TO authenticated, service_role;

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS "Admins can log their actions" ON public.admin_audit_log;

NOTIFY pgrst, 'reload schema';
