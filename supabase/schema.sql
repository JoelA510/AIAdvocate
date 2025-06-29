-- ===============================================================================================
-- AI ADVOCATE: COMPLETE DATABASE SCHEMA
--
-- This script creates all necessary tables, helper functions, and security policies
-- for the AI Advocate application.
--
-- Running this script on a fresh Supabase project will configure the entire database.
--
-- Sections:
-- 1. Table Definitions: Creates the `bills`, `profiles`, `reactions`, and `bookmarks` tables.
-- 2. Auth Helper Function: Automates profile creation for new users.
-- 3. Row-Level Security Policies: Secures the database tables.
-- ===============================================================================================


-- ===============================================================================================
-- SECTION 1: TABLE DEFINITIONS
-- ===============================================================================================

-- BILLS TABLE
-- Stores core legislative bill information and AI-generated summaries.
CREATE TABLE public.bills (
  id BIGINT PRIMARY KEY,
  bill_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  state_link TEXT,
  summary_simple TEXT,
  summary_medium TEXT,
  summary_complex TEXT,
  panel_review JSONB,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.bills IS 'Stores core legislative bill information and AI-generated summaries.';


-- PROFILES TABLE (SIMPLIFIED FOR ANONYMOUS AUTH)
-- Stores a public reference to an authenticated user from the private `auth.users` table.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
COMMENT ON TABLE public.profiles IS 'Stores a public reference to an authenticated user.';


-- REACTIONS TABLE
-- Stores user reactions to bills. Enforces one reaction per user per bill.
CREATE TABLE public.reactions (
  bill_id BIGINT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, user_id)
);
COMMENT ON TABLE public.reactions IS 'Stores user reactions to bills. Enforces one reaction per user per bill.';


-- BOOKMARKS TABLE
-- Stores user bookmarks for bills.
CREATE TABLE public.bookmarks (
  bill_id BIGINT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, user_id)
);
COMMENT ON TABLE public.bookmarks IS 'Stores user bookmarks for bills.';


-- ===============================================================================================
-- SECTION 2: AUTH HELPER FUNCTION
-- ===============================================================================================

-- Creates a profile entry when a new user signs up in Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a profile entry for a new anonymous or registered user.';

-- Attaches the function to the auth.users table.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ===============================================================================================
-- SECTION 3: ROW-LEVEL SECURITY (RLS) POLICIES
-- ===============================================================================================

-- First, enable RLS for all tables.
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES FOR 'bills'
-- Rule: Anyone can read bill information.
CREATE POLICY "Public can view all bills" ON public.bills
  FOR SELECT USING (true);
-- Note: No policy for INSERT, UPDATE, or DELETE means these actions are denied by default.
-- Only server-side functions using the 'service_role' key can write to this table.

-- RLS POLICIES FOR 'profiles'
-- Rule: Anyone can see that user profiles exist.
CREATE POLICY "Public can view profiles" ON public.profiles
  FOR SELECT USING (true);

-- RLS POLICIES FOR 'reactions'
-- Rule: Anyone can see all the reactions that have been submitted.
CREATE POLICY "Public can view reactions" ON public.reactions
  FOR SELECT USING (true);
-- Rule: You can only create, change, or delete YOUR OWN reaction.
-- `auth.uid()` is a special Supabase function that returns the ID of the currently logged-in user.
CREATE POLICY "Users can manage their own reactions" ON public.reactions
  FOR ALL USING (auth.uid() = user_id);

-- RLS POLICIES FOR 'bookmarks'
-- Rule: You can only see YOUR OWN bookmarks. This keeps them private.
CREATE POLICY "Users can view their own bookmarks" ON public.bookmarks
  FOR SELECT USING (auth.uid() = user_id);
-- Rule: You can only create or delete YOUR OWN bookmark.
CREATE POLICY "Users can manage their own bookmarks" ON public.bookmarks
  FOR ALL USING (auth.uid() = user_id);
-- Note: The policies above ensure that users can only interact with their own data,
-- while still allowing public read access to bills and reactions.