-- ================================================================
-- FIX: ADMIN RLS POLICIES
-- ================================================================

-- 1. Ensure RLS is enabled
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_translations ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts/duplication
DROP POLICY IF EXISTS "Service role reads audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can log their actions" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can manage translations" ON public.bill_translations;

-- 3. Re-create Admin Audit Log Policies
-- Service Role (Full Access)
CREATE POLICY "Service role full access audit log" ON public.admin_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admins SELECT (View all logs)
CREATE POLICY "Admins can view all audit logs" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()));

-- Admins INSERT (Log actions)
CREATE POLICY "Admins can log their actions" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid())
  );

-- 4. Re-create Bill Translations Policies
-- Admins Full Access (Select, Insert, Update, Delete)
CREATE POLICY "Admins can manage translations" ON public.bill_translations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()));

-- Public Read Access (if needed for the app, usually public needs to read translations)
-- Assuming public needs to read translations for the app to work?
-- If not already defined, we should add it.
CREATE POLICY "Public can view translations" ON public.bill_translations
  FOR SELECT TO anon, authenticated
  USING (true);
