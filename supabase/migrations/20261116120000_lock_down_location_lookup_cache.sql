-- 20261116120000_lock_down_location_lookup_cache.sql
--
-- public.location_lookup_cache holds what people typed into representative
-- lookup (a ZIP code or a city name), the geocoded point and the result. It
-- carried a "Public can read location cache" policy, FOR SELECT USING (true),
-- so anyone holding the public (anon) key could read every cached lookup
-- through PostgREST.
--
-- Callers, checked 2026-11-11: only the find-your-rep Edge Function reads or
-- writes this table, with the service_role client (which bypasses RLS), and
-- the cleanup-location-cache cron deletes expired rows as the database owner.
-- Nothing in mobile-app references the table. Client impact: none.
--
-- Not changed: what is cached (ZIP and city lookups, 7-day expiry), by the
-- owner's decision.
--
-- Rollback:
--   create policy "Public can read location cache"
--     on public.location_lookup_cache for select using (true);
--   grant select on public.location_lookup_cache to anon, authenticated;

DROP POLICY IF EXISTS "Public can read location cache"
  ON public.location_lookup_cache;

REVOKE ALL ON public.location_lookup_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_lookup_cache
  TO service_role;
