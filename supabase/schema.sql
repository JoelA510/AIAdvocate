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
-- 4. Database Functions (RPC): Creates utility functions callable from the app.
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
  is_verified BOOLEAN DEFAULT false,
  is_curated BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.bills IS 'Stores core legislative bill information and AI-generated summaries.';


-- PROFILES TABLE (SIMPLIFIED FOR ANONYMOUS AUTH)
-- Stores a public reference to an authenticated user from the private `auth.users` table.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT
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


-- LEGISLATORS TABLE
-- Stores information about legislators.
CREATE TABLE public.legislators (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  chamber TEXT,
  district TEXT,
  party TEXT,
  photo_url TEXT,
  email TEXT,
  is_lnf_ally BOOLEAN DEFAULT false
);
COMMENT ON TABLE public.legislators IS 'Stores information about legislators.';


-- VOTES TABLE
-- Stores legislator votes on specific bills.
CREATE TABLE public.votes (
  bill_id BIGINT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  legislator_id BIGINT NOT NULL REFERENCES public.legislators(id) ON DELETE CASCADE,
  vote_option TEXT,
  PRIMARY KEY (bill_id, legislator_id)
);
COMMENT ON TABLE public.votes IS 'Stores legislator votes on specific bills.';


-- ===============================================================================================
-- SECTION 2: AUTH HELPER FUNCTION
-- ===============================================================================================

-- Creates a profile entry when a new user signs up in Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;
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
ALTER TABLE public.legislators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES FOR 'bills'
-- Rule: Anyone can read bill information.
CREATE POLICY "Public can view all bills" ON public.bills
  FOR SELECT USING (true);

-- RLS POLICIES FOR 'profiles'
-- Rule: Anyone can see that user profiles exist.
CREATE POLICY "Public can view profiles" ON public.profiles
  FOR SELECT USING (true);

-- RLS POLICIES FOR 'reactions'
-- Rule: Anyone can see all the reactions that have been submitted.
CREATE POLICY "Public can view reactions" ON public.reactions
  FOR SELECT USING (true);
-- Rule: An authenticated user can manage (insert, update, delete) their own reaction.
CREATE POLICY "Users can manage their own reactions" ON public.reactions
  FOR ALL USING (auth.uid() = user_id);

-- RLS POLICIES FOR 'bookmarks'
-- Rule: A user can only see their own bookmarks. This keeps them private.
CREATE POLICY "Users can view their own bookmarks" ON public.bookmarks
  FOR SELECT USING (auth.uid() = user_id);
-- Rule: A user can only create or delete their own bookmark.
CREATE POLICY "Users can manage their own bookmarks" ON public.bookmarks
  FOR ALL USING (auth.uid() = user_id);

-- RLS POLICIES FOR 'legislators'
-- Rule: Anyone can read legislator information.
CREATE POLICY "Public can view all legislators" ON public.legislators
  FOR SELECT USING (true);

-- RLS POLICIES FOR 'votes'
-- Rule: Anyone can read vote information.
CREATE POLICY "Public can view all votes" ON public.votes
  FOR SELECT USING (true);


-- ===============================================================================================
-- SECTION 4: DATABASE FUNCTIONS (RPC)
-- ===============================================================================================

-- Function to aggregate reaction counts for a given bill into a single JSON object.
-- This function is written in PL/pgSQL to match the Supabase UI default.
-- NOTE: In the Supabase UI, the argument type `bigint` is represented as `int8`.
CREATE OR REPLACE FUNCTION public.get_reaction_counts(bill_id_param bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
AS $$
BEGIN
  RETURN (
    SELECT
      jsonb_object_agg(reaction_type, count)
    FROM (
      SELECT
        r.reaction_type,
        COUNT(*) AS count
      FROM
        public.reactions AS r
      WHERE
        r.bill_id = bill_id_param
      GROUP BY
        r.reaction_type
    ) AS reaction_counts
  );
END;
$$;


-- ===============================================================================================
-- End of script
-- ===============================================================================================