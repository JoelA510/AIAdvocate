-- Allow Edge Functions to validate the scheduler bearer token against Vault
-- without exposing or duplicating the secret in Edge environment variables.

CREATE OR REPLACE FUNCTION public.is_valid_bill_sync_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets AS v
    WHERE v.name IN ('SYNC_SECRET', 'sync_secret', 'bill-sync-api-key')
      AND NULLIF(v.decrypted_secret, '') IS NOT NULL
      AND v.decrypted_secret = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.is_valid_bill_sync_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_bill_sync_secret(text) TO service_role;

NOTIFY pgrst, 'reload schema';
