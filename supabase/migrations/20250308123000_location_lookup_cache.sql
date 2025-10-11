BEGIN;

CREATE TABLE IF NOT EXISTS public.location_lookup_cache (
  lookup_key TEXT PRIMARY KEY,
  raw_query TEXT NOT NULL,
  query_type TEXT NOT NULL CHECK (query_type IN ('zip', 'city')),
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  representatives JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS location_lookup_cache_expires_idx
  ON public.location_lookup_cache (expires_at);

ALTER TABLE public.location_lookup_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'location_lookup_cache'
      AND policyname = 'Public can read location cache'
  ) THEN
    CREATE POLICY "Public can read location cache"
      ON public.location_lookup_cache
      FOR SELECT
      USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_location_cache() RETURNS VOID AS $$
BEGIN
  DELETE FROM public.location_lookup_cache WHERE expires_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule('cleanup-location-cache', '0 3 * * *', 'SELECT public.cleanup_expired_location_cache()')
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-location-cache'
);

COMMENT ON TABLE public.location_lookup_cache
IS 'Caches non-specific location lookups (ZIP or city) to reduce external geocoding/OpenStates traffic.';

COMMENT ON COLUMN public.location_lookup_cache.lookup_key
IS 'Normalized cache key in the form "<type>:<value>" (type is zip or city).';

COMMENT ON COLUMN public.location_lookup_cache.representatives
IS 'Cached OpenStates representatives array for the location.';

COMMIT;
