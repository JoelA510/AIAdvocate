BEGIN;

CREATE OR REPLACE FUNCTION public.search_bills(p_query TEXT)
RETURNS TABLE (
  id BIGINT,
  bill_number TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  state_link TEXT,
  summary_simple TEXT,
  summary_medium TEXT,
  summary_complex TEXT,
  panel_review JSONB,
  is_verified BOOLEAN,
  created_at TIMESTAMPTZ,
  change_hash TEXT,
  is_curated BOOLEAN,
  original_text TEXT,
  embedding vector(1536),
  status_text TEXT,
  status_date DATE,
  progress JSONB,
  calendar JSONB,
  history JSONB,
  rank DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  trimmed TEXT := trim(p_query);
  condensed TEXT := regexp_replace(trimmed, '\s+', '', 'g');
  tsq TSQUERY;
  result_rows INTEGER;
BEGIN
  IF trimmed IS NULL OR trimmed = '' THEN
    RETURN;
  END IF;

  -- Very short queries (e.g., "AB") are treated as bill number/title prefix searches.
  IF length(condensed) < 3 THEN
    RETURN QUERY
    SELECT
      b.id,
      b.bill_number,
      b.title,
      b.description,
      b.status,
      b.state_link,
      b.summary_simple,
      b.summary_medium,
      b.summary_complex,
      b.panel_review,
      b.is_verified,
      b.created_at,
      b.change_hash,
      b.is_curated,
      b.original_text,
      b.embedding,
      b.status_text,
      b.status_date,
      b.progress,
      b.calendar,
      b.history,
      0::DOUBLE PRECISION AS rank
    FROM public.bills b
    WHERE
      b.bill_number ILIKE concat(condensed, '%')
      OR b.bill_number ILIKE concat('%', condensed, '%')
      OR b.title ILIKE concat('%', trimmed, '%')
    ORDER BY
      b.is_curated DESC,
      COALESCE(b.status_date, b.created_at) DESC,
      b.created_at DESC,
      b.id DESC;
    RETURN;
  END IF;

  tsq := websearch_to_tsquery('english', trimmed);

  IF tsq IS NOT NULL AND tsq::text <> '' THEN
    RETURN QUERY
    WITH docs AS (
      SELECT
        b.*,
        setweight(to_tsvector('english', coalesce(b.bill_number, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(b.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(b.description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(b.summary_simple, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(b.summary_medium, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(b.summary_complex, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(b.original_text, '')), 'D') AS document
      FROM public.bills b
    )
    SELECT
      d.id,
      d.bill_number,
      d.title,
      d.description,
      d.status,
      d.state_link,
      d.summary_simple,
      d.summary_medium,
      d.summary_complex,
      d.panel_review,
      d.is_verified,
      d.created_at,
      d.change_hash,
      d.is_curated,
      d.original_text,
      d.embedding,
      d.status_text,
      d.status_date,
      d.progress,
      d.calendar,
      d.history,
      ts_rank_cd(d.document, tsq)::DOUBLE PRECISION AS rank
    FROM docs d
    WHERE d.document @@ tsq
    ORDER BY rank DESC, d.is_curated DESC, d.created_at DESC;

    GET DIAGNOSTICS result_rows = ROW_COUNT;
    IF result_rows > 0 THEN
      RETURN;
    END IF;
  END IF;

  -- Fallback when tsquery is empty or yields no hits: do a broader ILIKE search.
  RETURN QUERY
  SELECT
    b.id,
    b.bill_number,
    b.title,
    b.description,
    b.status,
    b.state_link,
    b.summary_simple,
    b.summary_medium,
    b.summary_complex,
    b.panel_review,
    b.is_verified,
    b.created_at,
    b.change_hash,
    b.is_curated,
    b.original_text,
    b.embedding,
    b.status_text,
    b.status_date,
    b.progress,
    b.calendar,
    b.history,
    0::DOUBLE PRECISION AS rank
  FROM public.bills b
  WHERE
    b.bill_number ILIKE concat('%', trimmed, '%')
    OR b.title ILIKE concat('%', trimmed, '%')
    OR b.description ILIKE concat('%', trimmed, '%')
  ORDER BY
    b.is_curated DESC,
    COALESCE(b.status_date, b.created_at) DESC,
    b.created_at DESC,
    b.id DESC;
END;
$$;

COMMENT ON FUNCTION public.search_bills(TEXT)
IS 'Ranked websearch over bills.search tsvector with graceful fallback for short or sparse queries.';

GRANT EXECUTE ON FUNCTION public.search_bills(TEXT) TO anon, authenticated, service_role;

COMMIT;
