-- 20260709160000_add_get_vault_secret_helper.sql
--
-- Extract the Vault secret-resolution pattern (priority-ordered lookup across
-- several possible secret names) into a single helper. Before this, the same
-- ~15-line block was copy-pasted 3x per caller across invoke_edge_function and
-- notify_upcoming_votes. That duplication already caused a real production
-- outage: 20260616200000 regressed ONE copy back to calling nonexistent
-- vault.get_secret(...) while other copies stayed correct, silently breaking
-- every cron ingestion call for roughly two months (fixed in 20260618150000).
-- A single helper makes that class of regression structurally impossible.
--
-- Idempotent (CREATE OR REPLACE). No behavior change for any caller: the
-- callers refactored to use this (see 20260709161000) already had this exact
-- resolution logic inline.

CREATE OR REPLACE FUNCTION public.get_vault_secret(p_names text[])
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.decrypted_secret
  FROM vault.decrypted_secrets AS v
  WHERE v.name = ANY(p_names) AND NULLIF(v.decrypted_secret, '') IS NOT NULL
  ORDER BY array_position(p_names, v.name), v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_vault_secret(text[]) IS
  'Resolve the highest-priority non-empty Vault secret among p_names (priority = array order). Extracted to prevent the class of regression that broke ingestion for ~2 months (see 20260616200000 / 20260618150000).';

-- Internal helper only: never callable by anon/authenticated.
REVOKE ALL ON FUNCTION public.get_vault_secret(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vault_secret(text[]) TO service_role;
