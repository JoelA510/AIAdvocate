# Supabase — schema source of truth

The **canonical** database schema is the **timestamped migrations** in
[`supabase/migrations/`](./migrations), applied in filename order:

- `00000000000000_initial.sql` — the baseline schema (tables, types, RLS,
  RPCs, cron), followed by
- `YYYYMMDDHHMMSS_*.sql` — each subsequent change.

`supabase db push` (and Supabase Branching) apply exactly these files. That is
the only definition you should edit or trust.

## Why this file exists

This project previously carried **three overlapping schema definitions** that
had drifted apart:

| File | Role |
| --- | --- |
| `supabase/migrations/00000000000000_initial.sql` + dated migrations | **Canonical** (applied by the CLI). |
| `supabase/migrations/schema.sql` | ❌ Removed — a non-timestamped consolidated snapshot that sat *inside* the migrations directory. Because it sorts after the timestamped files, the CLI could apply it **last**, re-running a stale, drifted copy of the schema (e.g. divergent policy names, missing `vote_events`/`vote_records`/`job_state`/`openstates_bill_id`). It defined nothing the timestamped migrations did not already define. |
| `supabase/schema.sql` (repo root) | ❌ Removed — a hand-maintained full-schema snapshot that was never applied by the CLI but was referenced as "canonical" in docs, competing with the migrations and drifting from them. |

Both `schema.sql` files were deleted so there is a single source of truth.
They remain in git history if needed.

## Working with the schema

- **Change the schema:** add a new timestamped migration. Never edit an
  already-applied migration (Supabase tracks applied migrations and will flag
  checksum/history mismatches).
- **Set `search_path` on every `SECURITY DEFINER` function** and schema-qualify
  references (see `AGENTS.md`).
- **Want a single-file snapshot** for reading/grepping or diffing? Generate it
  on demand instead of hand-maintaining one:

  ```bash
  supabase db dump --schema public -f supabase/schema.snapshot.sql   # local stack
  # or, against a project:
  supabase db dump --linked --schema public -f supabase/schema.snapshot.sql
  ```

  Treat any such dump as a disposable artifact, not a source of truth.

## Verify migrations apply cleanly from scratch

```bash
supabase db reset     # drops, re-creates, and re-applies every migration in order
```

Supabase Branching runs the equivalent on every PR commit and reports a
**Migrations** status; green there means the full set applies to a fresh
database without the removed snapshots.
