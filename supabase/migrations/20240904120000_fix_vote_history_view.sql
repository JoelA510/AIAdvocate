-- Ensure the voting history view is accessible to public clients while respecting table policies.
CREATE OR REPLACE VIEW public.v_rep_vote_history
WITH (security_invoker = true) AS
SELECT
  l.id AS legislator_id,
  l.name AS legislator_name,
  l.party,
  l.district,
  l.title,
  b.id AS bill_id,
  b.bill_number,
  b.title AS bill_title,
  ve.id AS vote_event_id,
  ve.date AS vote_date,
  ve.motion,
  ve.result AS vote_result,
  vr.choice AS vote_choice
FROM public.vote_records vr
JOIN public.vote_events ve ON ve.id = vr.vote_event_id
JOIN public.bills b        ON b.id = ve.bill_id
JOIN public.legislators l  ON l.id = vr.legislator_id;

-- Align read access policies with Supabase guidance (use explicit TO roles and rely on RLS instead of auth.role()).
DROP POLICY IF EXISTS "Public can view vote records" ON public.vote_records;
CREATE POLICY "read vote_records public"
ON public.vote_records FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public can view vote events" ON public.vote_events;
CREATE POLICY "read vote_events public"
ON public.vote_events FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public can view bills" ON public.bills;
CREATE POLICY "read bills public"
ON public.bills FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public can view legislators" ON public.legislators;
CREATE POLICY "read legislators public"
ON public.legislators FOR SELECT
TO anon, authenticated
USING (true);

-- Keep grants on the view itself to ensure clients can read through the view.
REVOKE ALL ON public.v_rep_vote_history FROM PUBLIC;
GRANT SELECT ON public.v_rep_vote_history TO anon;
GRANT SELECT ON public.v_rep_vote_history TO authenticated;
