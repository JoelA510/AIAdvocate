-- 20260709163000_user_push_tokens_composite_pk.sql
--
-- mobile-app/src/lib/push.ts upserts with onConflict: "user_id" against a
-- table whose PK is (user_id) alone, so a second device (or a reinstall that
-- mints a new Expo token) silently overwrites the previous device's row --
-- a user signed in on two devices only ever gets pushes on whichever
-- registered most recently.
--
-- Change the PK to (user_id, expo_token) so each device keeps its own row.
-- No edge-function change needed: send-push-notifications already selects
-- expo_token for `.in("user_id", chunk)` (potentially multiple rows per
-- user) and dedupes via Set before fan-out, so multi-row-per-user was
-- already handled correctly on the read side.
--
-- Compatibility note: this changes what onConflict target push.ts must use
-- (updated in the same PR to onConflict: "user_id,expo_token"). Only 5 rows
-- existed in production at migration time (pre-launch), so there is no
-- meaningful data-migration risk; an already-installed OLD client build
-- using onConflict:"user_id" would fail to upsert until it updates, which is
-- acceptable pre-launch but worth knowing if this ships to any existing
-- install base.
--
-- Rollback: re-run with the constraint reversed (DROP the composite PK, ADD
-- PRIMARY KEY (user_id)) -- only safe if no user has more than one row.

ALTER TABLE public.user_push_tokens DROP CONSTRAINT user_push_tokens_pkey;
ALTER TABLE public.user_push_tokens ADD PRIMARY KEY (user_id, expo_token);
