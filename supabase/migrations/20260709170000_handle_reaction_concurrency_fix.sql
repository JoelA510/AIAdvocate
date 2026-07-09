-- 20260709170000_handle_reaction_concurrency_fix.sql
--
-- PR review (gemini-code-assist) on #57 correctly flagged a concurrency race
-- in public.handle_reaction (added in 20260709162000): it does
-- SELECT ... INTO existing_reaction, then branches INSERT vs UPDATE/DELETE.
-- Two concurrent requests from the same user (e.g. a rapid double-tap) can
-- both see NOT FOUND and both attempt to INSERT, and the second one throws
-- an unhandled 23505 unique_violation (reactions_pkey is (bill_id, user_id)).
--
-- The reviewer's suggested fix (add FOR UPDATE to the SELECT) is necessary
-- but not sufficient: FOR UPDATE only locks rows that already exist -- it
-- cannot lock (and so cannot serialize concurrent access to) a row that
-- doesn't exist yet, which is exactly the double-INSERT race. This migration
-- adds FOR UPDATE (correctly handles the concurrent UPDATE/DELETE-on-an-
-- existing-row case) AND wraps the INSERT in its own block that catches
-- unique_violation and converges to the same toggle result the winning
-- concurrent call already applied, instead of surfacing a raw DB error.
--
-- Verified live: a duplicate insert against reactions' PK (bill_id, user_id)
-- raises SQLSTATE 23505 (unique_violation), confirming the EXCEPTION WHEN
-- clause below is the correct catch; sequential insert-then-toggle-off
-- behavior is unchanged (0 rows remaining after insert+toggle).

CREATE OR REPLACE FUNCTION public.handle_reaction(p_bill_id bigint, p_user_id uuid, p_reaction_type text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE existing_reaction TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated caller';
  END IF;

  -- FOR UPDATE serializes concurrent requests when a row already exists
  -- (avoiding a lost UPDATE/DELETE), but cannot lock a row that doesn't
  -- exist yet -- two concurrent first-time INSERTs both see NOT FOUND and
  -- both attempt to insert. The EXCEPTION block below handles that case.
  SELECT reaction_type INTO existing_reaction
  FROM public.reactions WHERE user_id = p_user_id AND bill_id = p_bill_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_reaction = p_reaction_type THEN
      DELETE FROM public.reactions WHERE user_id = p_user_id AND bill_id = p_bill_id;
    ELSE
      UPDATE public.reactions SET reaction_type = p_reaction_type, created_at = NOW() WHERE user_id = p_user_id AND bill_id = p_bill_id;
    END IF;
  ELSE
    BEGIN
      INSERT INTO public.reactions (user_id, bill_id, reaction_type) VALUES (p_user_id, p_bill_id, p_reaction_type);
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent request from the same user (e.g. a rapid double-tap)
      -- won the race and inserted first. Converge on the caller's intended
      -- reaction_type instead of surfacing a raw DB error: toggle off if it
      -- already matches, otherwise update to it.
      IF EXISTS (
        SELECT 1 FROM public.reactions
        WHERE user_id = p_user_id AND bill_id = p_bill_id AND reaction_type = p_reaction_type
      ) THEN
        DELETE FROM public.reactions WHERE user_id = p_user_id AND bill_id = p_bill_id;
      ELSE
        UPDATE public.reactions SET reaction_type = p_reaction_type, created_at = NOW()
        WHERE user_id = p_user_id AND bill_id = p_bill_id;
      END IF;
    END;
  END IF;
END;
$function$;
