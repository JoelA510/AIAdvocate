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

A discovery sweep issued **23 `getSearch` calls in roughly 20 seconds** while
being tested. LegiScan's response:

> API key has been locked because of a violation of the Terms of Service
> abusing public services, please contact api@legiscan.com to restore access.
> Creating additional API keys will result in permanent suspension.

The per-call guardrails (`reserve_legiscan_api_call`) were all satisfied — each
call was individually within its cooldown and quota. What tripped the lock was
**request rate**, which nothing in the system limited at the time. That is why
§3 exists as a separate rule from §2.

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
- **Known gap — cross-invocation concurrency is not enforced.**
  `invoke_full_legislative_refresh` enqueues five `sync-updated-bills`
  invocations through `pg_net`, which run in parallel. With
  `SYNC_USE_LEGISCAN=true` those five workers can call LegiScan simultaneously,
  and nothing in the code serialises them: `reserve_legiscan_api_call` bounds
  per-resource cooldowns and daily/monthly totals, not instantaneous rate.
  Today this is latent because `SYNC_USE_LEGISCAN` defaults to `false` and that
  path scrapes leginfo instead. **Before enabling it**, either reduce the fan-out
  or add a shared rate gate. The same caveat applies to leginfo: five parallel
  workers plus the verification pass can exceed the ≥250 ms spacing in §5.
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

Bill text and status are available from
`leginfo.legislature.ca.gov` at no API cost. The ingestion pipeline uses
leginfo scraping as the primary text source and LegiScan `getBillText` only as
a fallback. When adding a feature, ask whether leginfo can answer it before
spending quota.

Leginfo is a public government site, not an API — keep requests sequential and
spaced (≥ 250 ms), and send a real `User-Agent`.

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
| `LEGISCAN_SEARCH_DELAY_MS` | `1500` | Gap between LegiScan search calls |
| `LEGISCAN_SEARCH_MAX_CALLS_PER_RUN` | `6` | Hard cap per invocation |
| `LEGISCAN_SEARCH_COOLDOWN_SECONDS` | `72000` | Per (phrase, page) cooldown |
| `LEGISCAN_DAILY_QUERY_LIMIT` | `900` | Daily budget ceiling |
| `LEGISCAN_MONTHLY_QUERY_LIMIT` | `25000` | Monthly budget ceiling (below the 30k limit) |
| `BULK_IMPORT_DATASET_PASS` | `true` | Kill switch for the dataset download pass |
| `BULK_IMPORT_VERIFY_PER_RUN` | `8` | Leginfo verifications per invocation |

To stop **all** LegiScan traffic immediately without a deploy, disable the
`daily-bill-sync` cron job:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'daily-bill-sync'), active := false);
```
