BEGIN;

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_admins FROM anon;
REVOKE ALL ON TABLE public.app_admins FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_admins'
      AND policyname = 'Admins can read own record'
  ) THEN
    CREATE POLICY "Admins can read own record"
      ON public.app_admins
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT ON TABLE public.app_admins TO authenticated;

COMMENT ON TABLE public.app_admins IS 'Whitelist of application admins by user_id (auth.users).';

COMMIT;
