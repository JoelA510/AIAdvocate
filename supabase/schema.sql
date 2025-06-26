-- 1. BILLS TABLE
CREATE TABLE bills (
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
COMMENT ON TABLE bills IS 'Stores core legislative bill information and AI-generated summaries.';

-- 2. PROFILES TABLE (SIMPLIFIED FOR ANONYMOUS AUTH)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
COMMENT ON TABLE profiles IS 'Stores a public reference to an authenticated user.';

-- 3. REACTIONS TABLE
CREATE TABLE reactions (
  bill_id BIGINT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, user_id)
);
COMMENT ON TABLE reactions IS 'Stores user reactions to bills. Enforces one reaction per user per bill.';

-- 4. BOOKMARKS TABLE
CREATE TABLE bookmarks (
  bill_id BIGINT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, user_id)
);
COMMENT ON TABLE bookmarks IS 'Stores user bookmarks for bills.';

-- 5. FUNCTION TO AUTO-CREATE A PROFILE ON NEW USER SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a profile entry for a new anonymous or registered user.';

-- 6. TRIGGER TO RUN THE FUNCTION
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();