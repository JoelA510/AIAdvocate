# Risk Register

Date: 2026-11-11 (first written version)

This register ties each identified product and data risk to the control that
answers it and the signal that would show the control failing. It was compiled
from the repository as it stood on the date above: every control and signal
below names the file, migration, or check that implements it. Where a control
or a signal does not exist, the row says so rather than implying one.

How to use it:

- Read the row before changing the area it covers. A change that removes a
  control or a signal updates the row in the same pull request.
- "Open" items are known gaps, in priority order within each row. An item
  marked "tracked privately" is deliberately not detailed in a public file.
- Review the whole register at each release, and after any incident.

No external security review has been conducted. Nothing here should be read as
an audit result.

---

## 1. What the app holds about a person

Public users sign in anonymously (`mobile-app/src/providers/AuthProvider.tsx`).
The app asks for no name, email, or phone number, and creates no account. What
is stored is tied to an anonymous session id:

| Data | Where | Kept because |
| --- | --- | --- |
| Saved bills, reactions, vote-alert subscriptions | `bookmarks`, `reactions`, `subscriptions` | The features need them; each user can read only their own rows, and reaction counts are served as totals (`20261118120000`) |
| Push-notification token | `user_push_tokens` | Only for users who allow notifications |
| Usage events (event type and bill id) | `events` | Aggregate usage |
| Representative lookups, by ZIP code or city | `location_lookup_cache` (7-day expiry) | Not tied to a session; avoids repeat geocoding |

Representative lookup is the one place the app asks for a location: it invites
an address or a ZIP code, and says under the field that the entry goes to a
mapping service. What the user types is sent to a geocoding provider to be
turned into coordinates, which stay on the server. It is not tied to the
session, and it is cached only when it is a ZIP code or reads as a city name;
a street address is never stored. The cache is readable only by the server
(see R1).

Staff accounts on the web admin are the one place an email address exists.

---

## 2. Register

Severity is the harm if the risk is realized, not its likelihood.

### R1. Survivor-identifying data is collected or exposed

Severity: high. The people this app serves can be harmed by a leak.

- **Control:** anonymous sign-in only on the public app; no profile fields.
  Error reports strip cookies, authorization headers, and email before sending
  (`mobile-app/src/lib/sentry.ts`). The language model receives bill text, never
  user-written text. Push messages carry only a bill number and title.
  Representative lookup sends coordinates, not the query, to the legislator
  data provider, does not return them to the app, and keeps its cache
  (`location_lookup_cache`) readable by the service role only
  (`20261116120000`). Reactions are readable only by their author; the app
  gets totals from a function that returns counts and the caller's own
  reaction (`20261118120000`).
- **Signal:** none automated. Expired lookup rows are deleted by the
  `cleanup-location-cache` cron; `cron_job_errors` rows are deleted after 30
  days by `cleanup-cron-job-errors`.
- **Open:**
  1. Representative lookup still sends a street address to the geocoding
     provider as typed, by decision (a ZIP alone gives approximate districts);
     the user is told. A query made only of letters is cached as a city, so
     text that is not a city can be cached for 7 days, readable only by the
     server.
  2. No retention limit on `events` or on push tokens that have stopped working.
  3. No published privacy policy or data-retention statement.
  4. Nothing checks the "no identifying information" claim mechanically.

### R2. One user reads or changes another user's data

Severity: high.

- **Control:** row-level security on every public table
  (`20251021121000_rls_audit_hardening.sql`), with `auth.uid() = user_id`
  policies on user-owned tables. User-facing RPCs reject a caller acting for
  another id and are not executable by `anon` (`20260709162000`). Reporting
  views run as the caller (`20260812121000`). Ingestion, scheduler, and admin
  RPCs are locked down (`20260812122000`, `20261113120000`, `20261114120000`).
  Cron and admin Edge Functions authorize in code
  (`supabase/functions/_shared/auth.ts`).
- **Signal:** verification SQL in `supabase/verification/` checks RLS coverage
  and grants (`20251021_vote_history.sql`,
  `20261113_lock_down_scheduler_rpcs.sql`, `20261114_admin_rpc_hardening.sql`,
  `20260730_get_bill_details_payload.sql`). It is run by hand at release.
- **Open:**
  1. No per-session rate limit on the functions that call paid APIs.
  2. The verification SQL does not run in CI.
  3. New tables in `public` still start with every privilege granted to the
     client roles (the platform default). Internal tables were narrowed by
     hand (`20261117120000`); a table added later needs the same, and
     `supabase/verification/20261117_client_grants.sql` shows what each role
     holds.

### R3. The admin surface is compromised

Severity: high. An admin can change what every user reads.

- **Control:** admin rights are a row in `app_admins`, checked inside the admin
  RPCs and in `manage-admin-users`. Admin screens exist only in the web build,
  which CI enforces (`check:admin-web-only`), so store binaries carry no admin
  code. Admins can enroll a second factor.
- **Signal:** `admin_audit_log`, written server-side.
- **Open:**
  1. A second factor is offered but not required.
  2. `manage-admin-users` writes its audit row best-effort.
  3. Nothing alerts when an admin is created.

### R4. A secret or key leaks

Severity: high.

- **Control:** server keys live in Edge Function secrets and Supabase Vault.
  `.env*` files are ignored by git. CI fails the build if a provider key that
  must stay server-side appears under a client-exposed name
  (`check:public-env`). `AGENTS.md` section 3 limits secret checks to booleans.
- **Signal:** the `check:public-env` self-test on every pull request.
- **Open:**
  1. The check covers a short list of names.
  2. The tracked Firebase client configuration files hold client keys; their
     restrictions and rotation are not documented.

### R5. An external API locks the project out or runs up cost

Severity: medium. It has happened once (`docs/external-api-policy.md`
section 1).

- **Control:** `docs/external-api-policy.md` is binding. Calls to the bill-data
  API are spaced, sequential, capped per invocation, and reserved against daily
  and monthly budgets through a gate that fails closed (`20261109120000`,
  `supabase/functions/_shared/legiscanGate.ts`). The scheduled job can be
  switched off in one statement.
- **Signal:** CI check `check:external-api`; the `legiscan_api_call_log` table
  and `v_legiscan_api_usage_30d` view; the `legiscan_search_idle` health check.
- **Open:**
  1. No spend cap or usage alert for the language-model API.
  2. The legislator and geocoding APIs have written rules but no metering.

### R6. Ingestion fails, and the app shows stale or wrong legislation

Severity: high. A wrong bill status misinforms the people the app is for. It
has happened once, for months (`AGENTS.md` section 6).

- **Control:** three sources in order: the Legislature's public data archive,
  then its website, then the bill-data API (`docs/external-api-policy.md`
  section 5). Status is refreshed daily (`refresh-bill-status`).
- **Signal:** `ingestion_health()` runs daily and records stale verification,
  blocked downloads, bills missing text or a summary, a failing status refresh,
  unmapped status values, and stalled discovery (`20261110120000`,
  `20261112120000`). Findings land in `cron_job_errors` and, when the alert
  secret is set, in error reporting. Verification SQL:
  `20261110_ingestion_health.sql`, `20261111_bill_status_refresh.sql`,
  `20261112_pubinfo_discovery.sql`.
- **Open:**
  1. The December 2026 session rollover has been tested only against a fake.
  2. Whether the alert secret is set in production is not recorded here.
  3. A scheduler that stops entirely is caught only by the staleness checks.

### R7. An AI summary or translation is wrong or misleading

Severity: high. A summary is the first thing a user reads about a bill.

- **Control:** a fixed prompt that forbids stating effects the text does not
  state, low temperature, and a strict output schema
  (`supabase/functions/sync-updated-bills/index.ts`). Database triggers reject
  placeholder or too-short summaries and block overwrites from client roles
  (`guard_bill_summaries`, `validate_bill_summary`). Those triggers skip the
  service role and admins (`20260430110000`), so they do not constrain the
  ingestion worker, which runs as the service role. What keeps a source refresh
  from replacing a summary is the worker's own code: the bill upsert keeps the
  existing summary whenever the incoming one is null
  (`20260501124000_fix_bill_translation_upsert_columns.sql`). Admins can correct
  a summary or translation, with an audit row. The app labels summaries as
  AI-generated.
- **Signal:** `ai_job_log`; the `bills_missing_summary` health check, which
  checks presence only.
- **Open:**
  1. No human review before a summary is published, and no check of accuracy.
  2. Nothing in the database stops a service-role writer from replacing an
     existing or admin-edited summary with a non-null one; the rule lives in
     `AGENTS.md` and in the worker's code.
  3. No "not legal advice" notice in the app.
  4. Translations are not validated beyond parsing.

### R8. Notifications are sent in error or abused

Severity: medium.

- **Control:** only the scheduler or an admin can trigger a send
  (`supabase/functions/send-push-notifications/index.ts`). Each recipient gets
  a given notification once (`push_notification_recipients`, `20260709172000`).
- **Signal:** the send response reports failed batches. Nothing alerts on it.
- **Open:**
  1. No cap on volume.
  2. Tokens that stop working are not pruned.

### R9. A dependency introduces a vulnerability

Severity: medium.

- **Control:** patched versions are pinned through `resolutions`; CI installs
  from the frozen lockfile. [`SECURITY.md`](../SECURITY.md) documents private
  vulnerability reporting, scope, testing boundaries, and supported versions;
  GitHub private vulnerability reporting was verified enabled on 2026-11-12.
- **Signal:** none automated in this repository.
- **Open:**
  1. CI does not run an advisory audit.
  2. No Dependabot configuration is committed.
  3. Some Edge Function imports are not pinned to an exact version.

### R10. The service becomes unavailable or data is lost

Severity: medium. The data is public legislation and can be re-ingested; user
bookmarks and subscriptions cannot.

- **Control:** the project runs within free-tier limits, with the bill payload
  trimmed to stay under the egress allowance (`20260730120000`).
- **Signal:** none for database size, egress, or quota.
- **Open:**
  1. No backup or restore procedure is written down.
  2. Whether scheduled jobs alone prevent the free-tier inactivity pause is
     unverified.

### R11. A release breaks production

Severity: medium.

- **Control:** a written release process (`README.md`, `DEPLOYMENT_GUIDE.md`).
  Migrations are the schema's source of truth, are never edited once applied,
  and each carries a rollback note. `AGENTS.md` sections 15 and 16 require a
  rollback or roll-forward note in every pull request.
- **Signal:** CI (types, lint, tests, and the three guard checks) and the
  verification SQL run at release.
- **Open:**
  1. No migration is applied in CI before it reaches production.
  2. Rolling back a bad Edge Function deploy or store release is not documented.

---

## 3. Review log

| Date | What changed |
| --- | --- |
| 2026-11-11 | First written version, compiled from the repository. Corrected in review: representative lookup invites an address; the summary triggers skip the service role. |
| 2026-11-11 | R2: the Edge Function authorization gap that was tracked privately is closed; the open item is removed. |
| 2026-11-11 | R1: the lookup cache is no longer publicly readable, coordinates are no longer returned to the app, and the lookup field says the entry goes to a third party. Sending addresses and caching cities stay, by decision. |
| 2026-11-12 | R2: client roles lost their default grants on internal tables, write grants on `app_config`, and TRUNCATE/REFERENCES/TRIGGER everywhere. Open item 3 added for the default privileges on new tables. |
| 2026-11-13 | R1: reactions are no longer publicly readable; counts come from `get_bill_details_for_user`. R2: `app_config` is server-only and its unused placeholder rows are deleted. |
| 2026-11-12 | R9: added SECURITY.md and README reporting links; verified GitHub private vulnerability reporting is enabled. Removed the missing-policy item; dependency audit and update gaps remain open. |
