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
LANGUAGE sql STABLE AS $$
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
    ts_rank_cd(b.search, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.bills b
  WHERE b.search @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC, created_at DESC;
$$;

COMMENT ON FUNCTION public.search_bills(TEXT)
IS 'Ranked websearch over bills.search tsvector. Returns bills + rank.';

GRANT EXECUTE ON FUNCTION public.search_bills(TEXT) TO anon, authenticated, service_role;

COMMIT;
