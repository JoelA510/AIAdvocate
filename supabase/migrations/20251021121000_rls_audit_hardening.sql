-- migrate:up

-- This routine audit enables RLS everywhere and scaffolds "deny select" placeholders
-- for tables that lack read policies so feature work can replace them intentionally.

-- Safety: keep schema usage (idempotent)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Enable RLS on any public table that still lacks it (should be no-ops)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', r.schema, r.tbl);
  END LOOP;
END$$;

-- Optional clarity: explicit deny-all SELECT where RLS is ON but zero policies exist
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='r' AND n.nspname='public' AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname=n.nspname AND p.tablename=c.relname
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR SELECT TO anon, authenticated USING (false);',
      format('deny select on %s', r.tbl),
      r.schema,
      r.tbl
    );
  END LOOP;
END$$;

-- Non-public schemas (e.g., cron) remain locked down; no changes here.
