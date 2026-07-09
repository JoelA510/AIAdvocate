-- 20260709171000_notify_pgrst_reload_schema.sql
--
-- PR review (chatgpt-codex-connector) on #57 correctly flagged that two
-- earlier migrations in this PR changed PostgREST-relevant schema state
-- without sending NOTIFY pgrst, 'reload schema' -- a gap against AGENTS.md
-- §4's own explicit rule ("Include NOTIFY pgrst, 'reload schema' ... when
-- RPC/function shape changes affect PostgREST/Supabase API behavior").
--
--   - 20260709163000 changed user_push_tokens' PRIMARY KEY from (user_id) to
--     (user_id, expo_token) -- the exact conflict target the mobile client's
--     upsert(..., { onConflict: "user_id,expo_token" }) depends on.
--   - 20260709162000 added/replaced get_bill_details_for_user, handle_
--     reaction, and toggle_bookmark_and_subscription and changed their
--     grants (revoked anon/PUBLIC execute).
--
-- Whether or not either change was already picked up automatically by this
-- managed Supabase project's normal deploy pipeline, sending an explicit
-- reload here is cheap, safe, and removes any doubt.

NOTIFY pgrst, 'reload schema';
