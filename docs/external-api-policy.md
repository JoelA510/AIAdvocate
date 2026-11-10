# External API usage policy

Binding rules for every call this project makes to a third-party legislative
data provider. **LegiScan and OpenStates access is single-key and
irreplaceable**: losing a key takes bill ingestion offline entirely, and
LegiScan explicitly forbids replacing a locked key. Treat these rules the same
way as the RLS and secret-handling rules in `AGENTS.md`.

CI enforces the mechanical parts via
`yarn workspace mobile-app check:external-api`
(`mobile-app/scripts/check-external-api-usage.js`). The rest is on reviewers.

---

## 1. Incident record — read this before changing any call site

**2026-07-26: the LegiScan API key was locked.**

A discovery sweep issued **23 `getSearch` calls in 3.2 seconds** — about **7
requests per second** — while being tested. LegiScan's response:

> API key has been locked because of a violation of the Terms of Service
> abusing public services, please contact api@legiscan.com to restore access.
> Creating additional API keys will result in permanent suspension.

The per-call guardrails (`reserve_legiscan_api_call`) were all satisfied — each
call was individually within its cooldown and quota. Monthly usage at the time
was 29 of the 30,000 allowance, so quota was never a factor. What tripped the
lock was **request rate**, which nothing in the system limited. That is why §3
exists as a separate rule from §2.

The rate above is measured, not estimated — `public.legiscan_api_call_log`
records one row per reserved call, so the true burst window is:

```sql
select count(*),
       extract(epoch from (max(created_at) - min(created_at))) as span_seconds
from public.legiscan_api_call_log
where endpoint = 'getSearch'
  and created_at >= timestamptz '2026-07-26 03:00:00+00';
```

**Never register a replacement key.** Restoration goes through
api@legiscan.com only.

---

## 2. LegiScan: published limits

From the LegiScan API User Manual (`https://api.legiscan.com/dl/`). These are
the provider's own numbers — do not "optimise" past them.

- **Public service keys have a monthly limit of 30,000 queries.**
- Each operation has a documented minimum refresh interval. Requesting more
  often than this **still spends a query** and returns unchanged cached data,
  so exceeding it is pure waste:

  | Operation | Documented frequency |
  | --- | --- |
  | `getDatasetList` | Weekly |
  | `getDataset` | Weekly |
  | `getSearch` / `getSearchRaw` | 1 hour |
  | `getMasterList` / `getMasterListRaw` | 1 hour |
  | `getBill` | 3 hours |
  | `getBillText` | Static (fetch once, cache forever) |
  | `getRollCall` / `getAmendment` / `getSupplement` | Static |
  | `getPerson` / `getSessionPeople` | Weekly |

  The manual's own guidance: *"In practice most use cases can be satisfied with
  daily updates."*

## 3. LegiScan: self-imposed rate limits

LegiScan does not publish a requests-per-second ceiling, but its Terms of
Service prohibit "abusing public services" and enforcement is automated and
immediate (§1). These floors are therefore mandatory and are CI-checked:

- **≥ 1000 ms between consecutive LegiScan calls** from a single invocation.
  Current default is 1500 ms.
- **≤ 6 LegiScan calls per function invocation.** Work that needs more is spread
  across days by the per-resource cooldown, not crammed into one run.
- **No concurrent LegiScan calls within an invocation.** Never issue LegiScan
  requests inside `Promise.all`, `runConcurrent`, or any parallel map.
  Sequential only.
- **Cross-invocation spacing is enforced by a shared gate.** Every LegiScan
  request, from any function and any invocation, passes the database gate from
  migration `20261109120000`. The first attempt reserves through
  `reserveGatedLegiScanCall()` (`supabase/functions/_shared/legiscanGate.ts` ->
  `public.reserve_legiscan_api_call_gated`), which takes the cooldown/quota
  reservation and a rate slot in one transaction: a busy gate returns
  `rate_gate` and reserves nothing, so a one-year `getBillText` reservation can
  never be spent without its request. Retries of an already-sent request claim
  a fresh slot with `claimLegiScanSlot()`. Slots are granted only when due,
  ≥ 1500 ms apart (never below 1000 ms), and the caller sends immediately; a
  grant whose round trip exceeded gap − 1000 ms is re-claimed on the retry path
  and logged ("grant arrived late") on the reservation path, so spacing stays
  ≥ 1000 ms. Waits honour the caller's deadline and abort signal. CI fails any
  LegiScan call site that does not reserve through the gate or that calls the
  ungated RPC directly. If the gate cannot be reached the call **fails closed**:
  nothing is reserved or sent, and the run stops its LegiScan traffic.
  History: before the gate, `invoke_full_legislative_refresh`'s parallel
  workers fell back to LegiScan together whenever leginfo failed. leginfo has
  served a Cloudflare challenge to cloud egress since at least 2026-10-27, and
  production logged three `getBill` calls 1-92 ms apart every day from
  2026-10-28 to 2026-11-09, at times overlapping the `getSearch` sweep. Within
  one invocation `sync-updated-bills` still holds its own floors as well
  (`sync-updated-bills/legiscanPacer.ts`: ≤ 6 calls, getBill and getBillText
  reserved only as a pair). The same caveat applies to leginfo: parallel
  workers can exceed the ≥ 250 ms spacing in §5.
- **Abort the whole sweep on the first API-level error.** A LegiScan response of
  `status: "ERROR"` (locked key, exhausted quota, malformed query) will repeat
  for every subsequent call. Stop; do not continue to the next item.
- **Never run an ad-hoc burst against production.** Test loops with `dry_run`
  plus a reduced phrase/page set, or against recorded fixtures.

## 4. LegiScan: mandatory metering

- **Every LegiScan request must be reserved first** through
  `public.reserve_legiscan_api_call(p_endpoint, p_resource_key,
  p_cooldown_seconds, p_daily_limit, p_monthly_limit)`. If the reservation is
  not `allowed`, the call **must not** be made. CI fails any file that fetches
  `api.legiscan.com` without referencing this RPC.
- Reservation cooldowns must be **at or above** the §2 documented frequency for
  that operation.
- The reservation is what writes `public.legiscan_api_call_log`, which is the
  only record of quota consumption. A call made outside it is invisible to the
  daily/monthly budget and corrupts the accounting.
- Diagnostics count too. Calling LegiScan directly from SQL/`pg_net` bypasses
  the log; if you must, record it and say so.

## 5. Prefer free sources over quota

Bill text and status are available from the California Legislature at no API
cost. When adding a feature, ask whether these can answer it before spending
quota.

- **`leginfo.legislature.ca.gov` bill pages** serve a Cloudflare challenge to
  cloud egress (403 "Just a moment" to Supabase since at least 2026-10-27). The
  scrape in `sync-updated-bills` still runs first but no longer succeeds from
  production, which is why the LegiScan fallback became the normal path (§3).
- **`downloads.leginfo.legislature.ca.gov` bulk data ("pubinfo")** is not
  challenged (206 to Supabase on 2026-11-09). `pubinfo_<session year>.zip`
  (~1.2 GB) is rebuilt only on Sundays; `pubinfo_daily_<Day>.zip` carries the
  same bill data for the current session and is rebuilt daily. Both support
  HTTP range requests, so `supabase/functions/_shared/pubinfo.ts` reads one
  bill's latest text with a few small requests, from the freshest daily
  archive (today's or yesterday's, by Last-Modified, at most 3 days old) and
  otherwise from the session archive. The index (4-20 MB) is built once per
  archive version and
  cached as a ~330 KB slice in `ingestion_cursors` (`pubinfo_index:<file>`),
  so parallel workers pay one HEAD request each. Search verification in
  `bulk-import-dataset` and bill text in `sync-updated-bills` both use it.
  Sync tries pubinfo first, then the leginfo scrape, then LegiScan
  `getBillText`; LegiScan `getBill` is still called once for a bill that has
  never had status metadata. Amendment marks are processing instructions whose
  deleted text lives in the mark itself, so pubinfo text is the bill as
  amended, without struck passages.

Both are public government sites, not APIs — keep requests sequential and
spaced (≥ 250 ms), send an identifying `User-Agent`, and never download a whole
pubinfo archive from an Edge Function.

### Monitoring

Both free sources and the LegiScan fallback degrade quietly, so a daily
database-side check (`public.report_ingestion_health()`, pg_cron
`ingestion-health` at 11:30 UTC, migration `20261110120000`) flags: a stale or
blocked search verification, an unavailable pubinfo index, bills older than two
days without text or summary, and no LegiScan search in 48 hours. Problems are
written to `cron_job_errors` (job `ingestion-health`) and, when the Vault secret
`ingestion_alert_sentry_dsn` is set, sent to Sentry as one issue per kind of
failure. Verification queries: `supabase/verification/20261110_ingestion_health.sql`.

## 6. OpenStates

- Endpoint: `https://openstates.org/graphql` (GraphQL v1), key on `X-API-KEY`.
- **The schema is not stable and is not versioned.** As of 2026-07-26 the root
  query type exposes only: `jurisdictions`, `jurisdiction`, `people`, `person`,
  `organization`, `bill`, `bills`. There is **no** `voteEvents` root field and
  **no** `DateTime` scalar — `updatedSince` is a `String`. A query written
  against a schema that no longer exists returns HTTP 400.
- Because of that, **always surface the GraphQL error body on a non-2xx
  response.** A bare `OpenStates request failed (400)` hid a completely broken
  nightly job for months. See `src/lib/openstatesClient.ts`.
- Keep `batchSize` small (≤ 5) and never widen it to "catch up" faster.
- Verify any schema assumption by introspection before shipping, not by
  inference from another query that happens to work.

## 7. Adding a new external call site

New files that talk to LegiScan or OpenStates must be added to the allowlist in
`mobile-app/scripts/check-external-api-usage.js`. This is deliberate friction:
it forces a reviewer to confirm the call is metered, throttled and sequential
before it can reach production.

## 8. Tunable knobs

All rate-related behaviour in `supabase/functions/bulk-import-dataset` is
env-configurable, so an incident can be contained without a redeploy:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BULK_IMPORT_SEARCH_DISCOVERY` | `true` | Kill switch for the full-text sweep |
| `LEGISCAN_SEARCH_DELAY_MS` | `1500` | Gap between any two LegiScan calls in an invocation (never below 1000) |
| `LEGISCAN_SEARCH_MAX_CALLS_PER_RUN` | `6` | Hard cap on all LegiScan calls per invocation (never above 6) |
| `LEGISCAN_SEARCH_COOLDOWN_SECONDS` | `72000` | Per (phrase, page) cooldown |
| `LEGISCAN_DAILY_QUERY_LIMIT` | `900` | Daily budget ceiling |
| `LEGISCAN_MONTHLY_QUERY_LIMIT` | `25000` | Monthly budget ceiling (below the 30k limit) |
| `BULK_IMPORT_DATASET_PASS` | `true` | Kill switch for the dataset download pass |
| `BULK_IMPORT_VERIFY_PER_RUN` | `30` | Search candidates verified against pubinfo text per run (background task) |
| `BULK_IMPORT_VERIFY_MIN_MENTIONS` | `5` | Topic-phrase mentions in a bill's text needed to admit it |
| `BULK_IMPORT_PINNED_BILLS` | unset | Bill numbers to ingest directly, e.g. `AB1705\|AB1568` (max 25) |
| `LEGISCAN_MASTERLIST_COOLDOWN_SECONDS` | `86400` | Cooldown for the pinned-bill `getMasterList` lookup (never below 3600) |
| `LEGISCAN_SYNC_DELAY_MS` | `1500` | `sync-updated-bills`: gap between its LegiScan calls (never below 1000) |
| `LEGISCAN_SYNC_MAX_CALLS_PER_RUN` | `6` | `sync-updated-bills`: LegiScan calls per invocation (never above 6) |

The search sweep visits phrases least-recently-searched first (from
`legiscan_api_call_log`), so the per-run cap rotates through the whole list
instead of re-spending it on the leading phrases every day. Changing the phrase
list (code default or `BULK_IMPORT_SEARCH_PHRASES`) or the mention threshold
discards the verification rejection cache once, so bills rejected under the
old rule are re-checked. Verification runs as a background task after the
function responds; its results are stored as `last_verification` on the
`bulk_import_search_pending:<state>:<session>` row of `ingestion_cursors`, and
a pubinfo Cloudflare challenge there (`blocked`) stops verification for the
run.

Every LegiScan request in `bulk-import-dataset` (`getDatasetList`,
`getMasterList`, `getSearch`, `getDataset`) draws from one per-invocation
budget, so the cap and spacing above hold across call sites, not per site. Env
overrides can tighten them but not loosen them past the §3 floors. A
`status: "ERROR"` from any of them ends all LegiScan traffic for the run.

Pinned bills skip topic discovery and leginfo verification. Their LegiScan
`bill_id` comes from a single `getMasterList` call for the whole set, made only
while a pinned bill is missing from `bills`. Once every pinned bill is present
the lookup stops, so leaving the variable set costs nothing.

To stop **all** LegiScan traffic immediately without a deploy, disable the
`daily-bill-sync` cron job:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'daily-bill-sync'), active := false);
```
