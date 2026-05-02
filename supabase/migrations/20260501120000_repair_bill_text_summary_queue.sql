-- Keep bills with missing text or incomplete/invalid summaries in the worker queue.
-- The active sync worker uses lease_next_bill(), not only get_bills_needing_summaries().

CREATE OR REPLACE FUNCTION public.get_bills_needing_summaries()
RETURNS TABLE (id BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id
  FROM public.bills AS b
  WHERE b.summary_ok IS DISTINCT FROM TRUE
     OR NULLIF(BTRIM(b.original_text), '') IS NULL
     OR NULLIF(BTRIM(b.original_text_formatted), '') IS NULL
     OR NULLIF(BTRIM(b.summary_simple), '') IS NULL
     OR NULLIF(BTRIM(b.summary_medium), '') IS NULL
     OR NULLIF(BTRIM(b.summary_complex), '') IS NULL
     OR LENGTH(BTRIM(b.summary_simple)) < 40
     OR LENGTH(BTRIM(b.summary_medium)) < 40
     OR LENGTH(BTRIM(b.summary_complex)) < 40
     OR b.summary_simple ILIKE 'AI_SUMMARY_FAILED%'
     OR b.summary_medium ILIKE 'AI_SUMMARY_FAILED%'
     OR b.summary_complex ILIKE 'AI_SUMMARY_FAILED%'
     OR b.summary_simple ~* '^[[:space:]]*(error|placeholder)'
     OR b.summary_medium ~* '^[[:space:]]*(error|placeholder)'
     OR b.summary_complex ~* '^[[:space:]]*(error|placeholder)'
     OR b.summary_simple ~* 'placeholder'
     OR b.summary_medium ~* 'placeholder'
     OR b.summary_complex ~* 'placeholder'
  ORDER BY b.id;
$$;

CREATE OR REPLACE FUNCTION public.lease_next_bill(p_owner text, p_ttl_seconds int DEFAULT 900)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidate AS (
    SELECT b.id
    FROM public.bills AS b
    WHERE (
          b.summary_ok IS DISTINCT FROM TRUE
       OR NULLIF(BTRIM(b.original_text), '') IS NULL
       OR NULLIF(BTRIM(b.original_text_formatted), '') IS NULL
       OR NULLIF(BTRIM(b.summary_simple), '') IS NULL
       OR NULLIF(BTRIM(b.summary_medium), '') IS NULL
       OR NULLIF(BTRIM(b.summary_complex), '') IS NULL
       OR LENGTH(BTRIM(b.summary_simple)) < 40
       OR LENGTH(BTRIM(b.summary_medium)) < 40
       OR LENGTH(BTRIM(b.summary_complex)) < 40
       OR b.summary_simple ILIKE 'AI_SUMMARY_FAILED%'
       OR b.summary_medium ILIKE 'AI_SUMMARY_FAILED%'
       OR b.summary_complex ILIKE 'AI_SUMMARY_FAILED%'
       OR b.summary_simple ~* '^[[:space:]]*(error|placeholder)'
       OR b.summary_medium ~* '^[[:space:]]*(error|placeholder)'
       OR b.summary_complex ~* '^[[:space:]]*(error|placeholder)'
       OR b.summary_simple ~* 'placeholder'
       OR b.summary_medium ~* 'placeholder'
       OR b.summary_complex ~* 'placeholder'
    )
      AND (b.summary_lease_until IS NULL OR b.summary_lease_until < now())
    ORDER BY
      CASE WHEN NULLIF(BTRIM(b.original_text), '') IS NULL THEN 0 ELSE 1 END,
      CASE WHEN b.summary_ok IS DISTINCT FROM TRUE THEN 0 ELSE 1 END,
      b.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.bills AS b
     SET summary_lease_until = now() + make_interval(secs => p_ttl_seconds),
         summary_lease_owner = p_owner
    FROM candidate
   WHERE b.id = candidate.id
  RETURNING b.id;
$$;

REVOKE ALL ON FUNCTION public.lease_next_bill(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lease_next_bill(text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.release_bill_lease(p_id bigint, p_owner text, p_ok boolean)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bills
     SET summary_ok = CASE
           WHEN p_ok THEN (
                NULLIF(BTRIM(original_text), '') IS NOT NULL
            AND NULLIF(BTRIM(original_text_formatted), '') IS NOT NULL
            AND NULLIF(BTRIM(summary_simple), '') IS NOT NULL
            AND NULLIF(BTRIM(summary_medium), '') IS NOT NULL
            AND NULLIF(BTRIM(summary_complex), '') IS NOT NULL
            AND LENGTH(BTRIM(summary_simple)) >= 40
            AND LENGTH(BTRIM(summary_medium)) >= 40
            AND LENGTH(BTRIM(summary_complex)) >= 40
            AND summary_simple NOT ILIKE 'AI_SUMMARY_FAILED%'
            AND summary_medium NOT ILIKE 'AI_SUMMARY_FAILED%'
            AND summary_complex NOT ILIKE 'AI_SUMMARY_FAILED%'
            AND summary_simple !~* '^[[:space:]]*(error|placeholder)'
            AND summary_medium !~* '^[[:space:]]*(error|placeholder)'
            AND summary_complex !~* '^[[:space:]]*(error|placeholder)'
            AND summary_simple !~* 'placeholder'
            AND summary_medium !~* 'placeholder'
            AND summary_complex !~* 'placeholder'
           )
           ELSE false
         END,
         summary_lease_until = NULL,
         summary_lease_owner = NULL
   WHERE id = p_id
     AND summary_lease_owner = p_owner;
$$;

REVOKE ALL ON FUNCTION public.release_bill_lease(bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_bill_lease(bigint, text, boolean) TO service_role;

CREATE OR REPLACE VIEW public.v_bill_summary_leases AS
SELECT id, summary_ok, summary_lease_owner, summary_lease_until
FROM public.bills
WHERE summary_lease_until IS NOT NULL
   OR summary_ok IS DISTINCT FROM TRUE
   OR NULLIF(BTRIM(original_text), '') IS NULL
   OR NULLIF(BTRIM(original_text_formatted), '') IS NULL
   OR NULLIF(BTRIM(summary_simple), '') IS NULL
   OR NULLIF(BTRIM(summary_medium), '') IS NULL
   OR NULLIF(BTRIM(summary_complex), '') IS NULL
   OR LENGTH(BTRIM(summary_simple)) < 40
   OR LENGTH(BTRIM(summary_medium)) < 40
   OR LENGTH(BTRIM(summary_complex)) < 40
   OR summary_simple ILIKE 'AI_SUMMARY_FAILED%'
   OR summary_medium ILIKE 'AI_SUMMARY_FAILED%'
   OR summary_complex ILIKE 'AI_SUMMARY_FAILED%'
   OR summary_simple ~* '^[[:space:]]*(error|placeholder)'
   OR summary_medium ~* '^[[:space:]]*(error|placeholder)'
   OR summary_complex ~* '^[[:space:]]*(error|placeholder)'
   OR summary_simple ~* 'placeholder'
   OR summary_medium ~* 'placeholder'
   OR summary_complex ~* 'placeholder';

NOTIFY pgrst, 'reload schema';
