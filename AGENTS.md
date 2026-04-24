# AGENTS.md — AI Advocate

These instructions apply to this repository. They are repo-specific and should be followed in addition to the user’s global Codex instructions and any higher-priority system/developer instructions.

AI Advocate is a production application using Supabase, PostgreSQL RPCs, Edge Functions, scheduled jobs, RLS, and bill/vote ingestion pipelines. Treat database, auth, scheduler, Vault, and Edge Function changes as production-sensitive.

## 1. Primary operating rules

- Inspect before changing.
- Prefer the smallest safe fix that addresses the requested issue.
- Preserve existing repo conventions, file structure, and naming.
- Avoid unrelated refactors, broad formatting, dependency upgrades, or generated artifacts unless explicitly requested.
- Do not run destructive commands or production-mutating SQL unless the user explicitly approves the exact action.
- Do not expose, print, commit, or log secret values.
- Always distinguish between:
  - implemented
  - locally tested
  - runtime-verified
  - production-verified

If live credentials, Supabase access, or required env vars are unavailable, stop and ask for the smallest non-secret output needed to proceed.

## 2. Repo source-of-truth order

When instructions or facts conflict, use this priority order:

1. Higher-priority system/developer instructions.
2. The user’s current task.
3. This `AGENTS.md`.
4. Repo-local docs and config:
   - `README.md`
   - `CONTRIBUTING.md`
   - `docs/`
   - `.github/workflows/`
   - `supabase/`
   - package scripts
   - existing migrations
   - existing Edge Function patterns
5. Current official Supabase/OpenAI docs where relevant.
6. Static reasoning from the codebase.

For repository behavior, local files are authoritative. For product behavior, current official docs are authoritative.

## 3. Secret-handling rules

Never expose or commit:

- Supabase service-role keys
- Supabase anon keys
- JWT secrets
- Vault decrypted secret values
- OpenStates/LegiScan keys
- Firebase private credentials
- LocationIQ keys
- Expo secrets
- database URLs/passwords
- API tokens
- `.env*` files
- credential JSON files

When checking secret/config presence, use boolean or metadata-only queries. Acceptable output:

```sql
select
  name,
  decrypted_secret is not null and decrypted_secret <> '' as has_secret,
  created_at,
  updated_at
from vault.decrypted_secrets
where name in (...);
````

Do not select or print raw `decrypted_secret` values.

Use placeholders such as `<redacted>` in logs, docs, PR descriptions, and tests.

## 4. Supabase and PostgreSQL rules

Prefer checked-in Supabase migrations over dashboard-only SQL changes.

For database work:

* Inspect existing migrations before creating new ones.
* Preserve public function signatures unless a breaking change is explicitly required.
* Use schema-qualified references in security-sensitive functions.
* Set explicit `search_path` on all `SECURITY DEFINER` functions.
* Avoid implicit object resolution in RPCs, triggers, and scheduled-job functions.
* Keep schema repair separate from data backfills where possible.
* Include post-deploy verification SQL for every migration touching RPCs, RLS, cron, Vault, Edge invocation, or ingestion.
* Include `NOTIFY pgrst, 'reload schema';` in post-deploy instructions when RPC/function shape changes affect PostgREST/Supabase API behavior.
* Treat RLS, grants, revokes, policies, Vault access, JWT handling, and service-role behavior as security-sensitive.
* Do not expose service-role credentials in browser/client code.
* Do not relax RLS or function grants without a clear reason and rollback plan.

For destructive or high-risk DB work, provide a plan first:

* tables/functions affected
* expected data impact
* rollback or roll-forward plan
* verification queries
* known risks

## 5. Supabase Edge Function and scheduler rules

This project uses scheduled database wrappers and Edge Functions for ingestion. Treat the database-to-Edge path as a chain:

```text
cron / manual SQL invocation
→ PostgreSQL RPC wrapper
→ Vault/app_config lookup
→ pg_net net.http_post
→ Edge Function
→ source API
→ database upsert
→ downstream summaries/embeddings/UI
```

Do not claim ingestion is fixed unless the relevant downstream evidence exists.

For scheduled Edge Function work, verify in this order:

1. RPC wrapper compiles.
2. Required config/secret names exist without exposing values.
3. `net.http_post` is reached.
4. `net._http_response` contains recent responses.
5. Edge Function status codes are understood.
6. bills/votes actually change.
7. summaries/embeddings/logs behave as expected.
8. UI/API read paths reflect the new data.

Do not treat cron “success” alone as ingestion success. A cron SQL wrapper can succeed while logging internal failures.

## 6. Known production incident context

The bill-ingestion pipeline was stale for months. Read-only inspection previously found:

* `public.bills` had only 47 rows.
* newest `created_at` was `2025-10-11`.
* latest `status_date`, `history`, and `progress` dates were `2025-10-13`.
* latest `calendar` date was `2025-08-29`.
* `net._http_response` returned no rows.
* `ai_job_log` returned no rows.
* `job_state` returned no rows.
* `cron_job_errors` repeatedly showed failures like:

  * `bulk-import-dataset failed: function vault.get_secret(unknown) does not exist`
  * `sync-updated-bills failed: function vault.get_secret(unknown) does not exist`
  * `votes-backfill failed: function vault.get_secret(unknown) does not exist`
  * `votes-daily failed: function vault.get_secret(unknown) does not exist`

The confirmed immediate blocker was:

```text
public.invoke_edge_function() called vault.get_secret(...),
but the database Vault schema did not contain vault.get_secret(...).
```

Observed Vault objects included:

* `vault.create_secret(...)`
* `vault.update_secret(...)`
* `vault.secrets`
* `vault.decrypted_secrets`

Therefore, database wrappers should not rely on nonexistent `vault.get_secret(...)` or `vault.delete_secret(...)` unless those helpers are intentionally created and tested.

## 7. Relevant database objects

When working on ingestion, scheduler, summaries, votes, or RPCs, inspect relevant definitions and call sites for these objects:

```text
public.invoke_edge_function
public.invoke_full_legislative_refresh
public.invoke_sync_updated_bills
public.sync_updated_bills
public.manage_bill_sync_secret
public.get_bills_needing_summaries
public.upsert_bill_and_translation
public.guard_bill_summaries
public.lease_next_bill
public.release_bill_lease
public.cron_job_errors
public.ai_job_log
public.job_state
public.bills
public.bill_translations
public.votes
public.vote_records
public.vote_events
public.app_config
net._http_response
net.http_request_queue
vault.decrypted_secrets
```

When working on Edge Functions, inspect relevant function directories and shared utilities for:

```text
bulk-import-dataset
sync-updated-bills
votes-backfill
votes-daily
summary/summarization workers
embedding workers
OpenStates/LegiScan clients
Supabase client initialization
auth/JWT/custom-secret checks
```

## 8. Current ingestion repair priorities

For bill-ingestion repair work, use this order:

1. Restore database-to-Edge invocation.
2. Confirm `net._http_response` rows appear after manual invocation.
3. Interpret HTTP status codes.
4. Inspect Edge Function logs/errors.
5. Confirm `public.bills` freshness improves.
6. Confirm summaries/embeddings process.
7. Plan backfill separately.
8. Harden grants/RLS separately unless explicitly requested in the same task.

Do not start with backfill if the invocation path is still broken.

Do not mix these into one large PR unless explicitly requested:

* invocation restore
* RLS/grant hardening
* six-month backfill
* summary-worker redesign
* schema observability expansion
* UI changes

## 9. Required checks for ingestion-related changes

When modifying `invoke_edge_function`, scheduler RPCs, ingestion Edge Functions, bill upserts, or summary workers, include verification SQL in the final response or PR body.

### Check for broken Vault helper usage

```sql
select
  p.oid::regprocedure::text as function_signature,
  n.nspname as schema,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f'
  and n.nspname in ('public', 'vault')
  and (
    pg_get_functiondef(p.oid) ilike '%vault.get_secret%'
    or pg_get_functiondef(p.oid) ilike '%vault.delete_secret%'
  )
order by function_signature;
```

Expected after repair: no application functions depend on nonexistent Vault helpers unless intentionally justified.

### Check required secrets without exposing values

```sql
select
  name,
  decrypted_secret is not null and decrypted_secret <> '' as has_secret,
  created_at,
  updated_at
from vault.decrypted_secrets
where name in (
  'functions_base_url',
  'project_url',
  'supabase_anon_key',
  'anon_key',
  'SYNC_SECRET',
  'sync_secret',
  'bill-sync-api-key'
)
order by name;
```

### Check app config without exposing secret-like values

```sql
select
  key,
  value is not null and value <> '' as has_value,
  case
    when key ilike '%url%' then value
    else '<redacted>'
  end as visible_value
from public.app_config
order by key;
```

### Manual invocation

```sql
select public.invoke_full_legislative_refresh();
```

### Check recent cron errors

```sql
select
  id,
  job_name,
  error_message,
  occurred_at
from public.cron_job_errors
where occurred_at >= now() - interval '15 minutes'
order by occurred_at desc, id desc;
```

### Check pg_net responses

```sql
select
  id,
  status_code,
  timed_out,
  error_msg,
  created,
  left(coalesce(content, ''), 3000) as content_preview
from net._http_response
order by created desc
limit 50;
```

Interpretation:

```text
2xx      = invocation reached Edge Function; continue downstream validation
401/403  = auth/header/JWT/custom-secret mismatch
404      = endpoint name or functions_base_url mismatch
500      = Edge Function runtime/source/upsert failure
no rows  = net.http_post was not reached or pg_net is not processing
timeout  = Edge Function or network timeout
```

### Check bill freshness

```sql
select
  count(*) as bill_count,
  max(created_at) as newest_created_at,
  count(*) filter (
    where created_at >= now() - interval '24 hours'
  ) as created_last_24h,
  count(*) filter (
    where created_at >= now() - interval '7 days'
  ) as created_last_7d,
  max(status_date) as latest_status_date,
  count(*) filter (
    where status_date >= current_date - 30
  ) as status_date_last_30d,
  count(*) filter (
    where change_hash is not null and change_hash <> ''
  ) as bills_with_change_hash,
  count(*) filter (
    where summary_simple is null
       or summary_medium is null
       or summary_complex is null
  ) as bills_missing_any_summary
from public.bills;
```

### Check summary queue

```sql
select
  count(*) as bill_count,
  count(*) filter (where summary_simple is null) as summary_simple_null,
  count(*) filter (where summary_medium is null) as summary_medium_null,
  count(*) filter (where summary_complex is null) as summary_complex_null,
  count(*) filter (where summary_ok is true) as summary_ok_true,
  count(*) filter (
    where summary_ok is distinct from true
      and (summary_lease_until is null or summary_lease_until < now())
  ) as summary_worker_claimable,
  count(*) filter (where summary_lease_until >= now()) as currently_leased
from public.bills;
```

## 10. Summary-worker rules

Current summary health previously showed claimable bills but no AI logs.

When touching summary code or RPCs:

* Determine whether the active worker uses:

  * `get_bills_needing_summaries()`, or
  * `lease_next_bill(...)` / `release_bill_lease(...)`.
* Do not remove legacy functions until call sites are confirmed.
* `get_bills_needing_summaries()` should not only check placeholder text. It should also account for:

  * `summary_ok IS DISTINCT FROM TRUE`
  * `summary_simple IS NULL`
  * `summary_medium IS NULL`
  * `summary_complex IS NULL`
  * `AI_SUMMARY_FAILED%`
  * placeholder summaries
* Do not let source-ingestion upserts overwrite generated summaries or embeddings unless intentionally updating generated content.
* Summary-update functions should be separate from source-ingestion functions.

## 11. Upsert and generated-content rules

When modifying `public.upsert_bill_and_translation(jsonb,jsonb)` or equivalent ingestion upserts:

* Confirm the conflict target is appropriate for the source data.
* Preserve generated summaries and embeddings on source-data conflict updates unless the function is explicitly a summary update.
* Keep legislative/source fields updating normally:

  * `bill_number`
  * `title`
  * `description`
  * `status`
  * `status_text`
  * `status_date`
  * `state_link`
  * `change_hash`
  * `original_text`
  * `original_text_formatted`
  * `progress`
  * `calendar`
  * `history`
  * translation data if supplied
* Check triggers such as `guard_bill_summaries()` before changing summary fields.
* Add validation that existing summaries are not unintentionally nulled or overwritten.

## 12. RLS and grant hardening

RLS/grant changes are security-sensitive.

Before changing grants or policies:

* Inspect current policies with `pg_policies`.
* Inspect function execute privileges.
* Identify client/browser call sites.
* Separate app-facing RPCs from internal worker/scheduler RPCs.
* Explain expected client impact.
* Provide rollback SQL.

Likely internal functions should not be executable by `anon` or `authenticated` unless there is a deliberate reason:

```text
invoke_edge_function
invoke_full_legislative_refresh
invoke_sync_updated_bills
sync_updated_bills
manage_bill_sync_secret
get_bills_needing_summaries
lease_next_bill
release_bill_lease
upsert_bill_and_translation
cleanup_old_cron_job_errors
cleanup_expired_location_cache
```

Do not revoke access in the same PR as invocation restore unless the user asks for hardening in that PR.

## 13. Backfill rules

Normal daily sync is not enough after a months-long outage.

Backfill should be a separate planned operation unless explicitly requested in the same task.

Before backfill:

* Confirm invocation path works.
* Confirm Edge Functions return expected status codes.
* Confirm source API keys/config exist.
* Confirm upsert behavior is safe and idempotent.
* Confirm generated summaries are preserved.
* Identify source coverage and date/session/state scope.
* Provide non-destructive dry-run or count comparison where possible.

Backfill acceptance criteria should include:

```text
[ ] Bills newer than 2025-10-13 are present.
[ ] bill_count increases materially beyond the stale baseline.
[ ] status_date_last_30d becomes nonzero where expected.
[ ] net._http_response shows successful Edge calls.
[ ] cron_job_errors stops accumulating invocation failures.
[ ] summary_worker_claimable decreases after summary processing.
[ ] ai_job_log records summary attempts/completions if that log is active.
```

## 14. Testing and validation

Use repo-defined scripts first. Inspect `package.json`, workflow files, and docs before inventing commands.

Preferred validation order:

1. Targeted static checks for touched files.
2. Unit tests for changed logic.
3. Typecheck.
4. Lint.
5. Build.
6. Migration validation / SQL smoke tests.
7. Manual verification SQL for production-only behavior.

Always state which commands were run and which were not run.

Do not claim production behavior is fixed unless production evidence exists. For migrations/code changes without live verification, say:

```text
Implemented but not runtime-verified.
```

## 15. PR expectations

For PRs, include:

```text
Summary
Files changed
User impact
Security considerations
Database/migration considerations
Validation performed
Manual verification steps
Rollback or roll-forward plan
Remaining unknowns
Follow-ups
```

For ingestion/RPC/database PRs, include exact SQL verification queries.

Keep PRs focused. Prefer separate PRs for:

* invocation restore
* grant/RLS hardening
* summary-worker repair
* backfill
* schema observability improvements
* UI changes

## 16. Risk and rollback expectations

For each meaningful change, identify:

* failure mode
* affected component
* whether data could be changed
* whether auth/security behavior changes
* rollback or roll-forward path

For migrations:

* If true rollback is safe, provide rollback SQL.
* If rollback is unsafe, provide roll-forward remediation steps.
* Avoid irreversible schema or data changes unless explicitly approved.

## 17. Git hygiene

Before editing, check working tree status when available.

Do not overwrite unrelated user changes.

Do not commit:

* build outputs
* coverage output
* local artifacts
* `.env*`
* credentials
* downloaded secrets
* temporary SQL scratch files
* generated files unless the repo already tracks them

Prefer focused commits and PRs.

## 18. When to stop and ask

Stop and request the minimum missing information when:

* production credentials are required but unavailable
* multiple Supabase projects/environments are possible
* the next step is destructive
* secrets are missing
* RLS/grant changes could break unknown clients
* backfill scope is unclear
* live verification is impossible and the user asked for production certainty
* repo-local instructions conflict with the requested change

When blocked, provide:

```text
Blocked reason
Evidence
Smallest input needed
Exact command/query the user can run
```

## 19. Definition of done

For ordinary code changes:

```text
[ ] Scope is limited to the requested task.
[ ] Relevant call sites were inspected.
[ ] Tests/checks were run or explicitly listed as not run.
[ ] No secrets were exposed.
[ ] Risks and rollback are documented.
```

For Supabase/RPC/ingestion changes:

```text
[ ] Migration or code patch is checked in.
[ ] SECURITY DEFINER functions touched by the change have explicit search_path.
[ ] No changed function depends on nonexistent Vault helpers.
[ ] Required secret/config presence can be verified without exposing values.
[ ] PostgREST schema-cache reload instruction is included when needed.
[ ] Manual invocation path is documented.
[ ] net._http_response verification is documented.
[ ] bill freshness verification is documented.
[ ] cron_job_errors verification is documented.
[ ] Backfill is either out of scope or explicitly planned.
```

For production incident resolution:

```text
[ ] The immediate blocker is fixed.
[ ] The fix is runtime-verified or clearly marked as not runtime-verified.
[ ] Downstream effects are checked.
[ ] Remaining unknowns are listed.
[ ] Follow-up hardening/backfill tasks are separated.
```
