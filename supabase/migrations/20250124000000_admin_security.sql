-- Admin User Creation and Audit Logging Migration
-- Run this in Supabase SQL Editor

-- ================================================================
-- PART 1: CREATE ADMIN AUDIT LOG TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  bill_id BIGINT REFERENCES public.bills(id) ON DELETE SET NULL,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can read audit logs (for investigations)
CREATE POLICY "Service role reads audit log" ON public.admin_audit_log
  FOR SELECT TO service_role USING (true);

-- Admins can insert their own audit entries
CREATE POLICY "Admins can log their actions" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid())
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_timestamp 
  ON public.admin_audit_log(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_bill 
  ON public.admin_audit_log(bill_id) WHERE bill_id IS NOT NULL;

COMMENT ON TABLE public.admin_audit_log IS 'Audit trail for all admin actions in the system';

-- ================================================================
-- PART 2: CREATE ADMIN USER ACCOUNTS
-- ================================================================

-- IMPORTANT: Run these commands ONE AT A TIME in Supabase Dashboard
-- Authentication → Add User → Or use SQL below

-- Admin 1: VRUSSELL
-- Email: vrussell@loveneverfails.org
-- Password: LnF$VRu2024!Adv#9mK

-- Admin 2: SDIMARTINO  
-- Email: sdimartino@loveneverfails.org
-- Password: LnF$SDi2024!Prj#7xW

-- To create these users via SQL (use Supabase Dashboard instead for better security):
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add User"
-- 3. Enter email and password for each admin
-- 4. Copy the user UUID after creation
-- 5. Run the INSERT statements below with the actual UUIDs

-- After creating users in Supabase Auth Dashboard, add them to app_admins:
-- REPLACE 'UUID-FROM-AUTH-DASHBOARD' with actual UUIDs after user creation

-- INSERT INTO public.app_admins (user_id)
-- SELECT id FROM auth.users WHERE email = 'vrussell@loveneverfails.org';

-- INSERT INTO public.app_admins (user_id)
-- SELECT id FROM auth.users WHERE email = 'sdimartino@loveneverfails.org';

-- ================================================================
-- PART 3: VERIFICATION QUERIES
-- ================================================================

-- Verify admin_audit_log table created
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'admin_audit_log';

-- Verify RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'admin_audit_log';

-- Check admin users (after manual creation)
SELECT u.id, u.email, u.created_at, a.user_id IS NOT NULL as is_admin
FROM auth.users u
LEFT JOIN public.app_admins a ON u.id = a.user_id
WHERE u.email LIKE '%@loveneverfails.org'
ORDER BY u.created_at DESC;

-- ================================================================
-- PART 4: TEST AUDIT LOGGING
-- ================================================================

-- Test insert (run as authenticated admin user)
-- INSERT INTO public.admin_audit_log (user_id, action, details)
-- VALUES (
--   auth.uid(),
--   'test_action',
--   '{"test": true}'::jsonb
-- );

-- View recent audit logs (service role only)
-- SELECT 
--   al.id,
--   u.email,
--   al.action,
--   al.bill_id,
--   al.details,
--   al.timestamp
-- FROM public.admin_audit_log al
-- JOIN auth.users u ON al.user_id = u.id
-- ORDER BY al.timestamp DESC
-- LIMIT 20;
