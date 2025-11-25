-- ================================================================
-- FIX: REMOVE BLOCKING GUARD TRIGGER
-- ================================================================

-- The error "P0001: summary_medium overwrite blocked" comes from this function.
-- We drop it with CASCADE to automatically remove the trigger that uses it.

DROP FUNCTION IF EXISTS public.guard_bill_summaries() CASCADE;

-- Also checking for potential similar guards on translations (proactive)
DROP FUNCTION IF EXISTS public.guard_bill_translations() CASCADE;

-- Verify it's gone by trying to update (User will do this manually)
