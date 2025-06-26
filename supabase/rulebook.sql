-- RLS POLICIES FOR 'bills'
-- Rule: Anyone can read bill information.
CREATE POLICY "Public can view all bills" ON bills
  FOR SELECT USING (true);
-- Note: Because we don't add rules for INSERT, UPDATE, or DELETE, they are denied.
-- This means only our server function with the master key can add/change bills.

-- RLS POLICIES FOR 'profiles'
-- Rule: Anyone can see that user profiles exist.
CREATE POLICY "Public can view profiles" ON profiles
  FOR SELECT USING (true);

-- RLS POLICIES FOR 'reactions'
-- Rule: Anyone can see all the reactions that have been submitted.
CREATE POLICY "Public can view reactions" ON reactions
  FOR SELECT USING (true);
-- Rule: You can only create, change, or delete YOUR OWN reaction.
-- auth.uid() is a special function that means "the ID of the person making this request".
CREATE POLICY "Users can manage their own reactions" ON reactions
  FOR ALL USING (auth.uid() = user_id);

-- RLS POLICIES FOR 'bookmarks'
-- Rule: You can only see YOUR OWN bookmarks. This keeps them private.
CREATE POLICY "Users can view their own bookmarks" ON bookmarks
  FOR SELECT USING (auth.uid() = user_id);
-- Rule: You can only create or delete YOUR OWN bookmark.
CREATE POLICY "Users can manage their own bookmarks" ON bookmarks
  FOR ALL USING (auth.uid() = user_id);