-- Audit Fixes: Add missing indexes for performance

-- Index for filtering bills by status (e.g. "active", "passed")
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);

-- Index for searching legislators by name (used in "Find Your Rep" and general search)
CREATE INDEX IF NOT EXISTS idx_legislators_name ON public.legislators(name);

-- Index for filtering legislators by district
CREATE INDEX IF NOT EXISTS idx_legislators_district ON public.legislators(district);

-- Index for fetching a user's reactions quickly
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON public.reactions(user_id);
