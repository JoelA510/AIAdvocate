# Handoff: make the Legislature's pubinfo archive the primary data source

Date: 2026-11-10. Written at the end of the session that shipped #93-#96 and
the ingestion-health alerting PR. For the next agent: **produce a plan first,
get the owner's sign-off, then start the work.** The owner has approved the
direction in principle (pubinfo primary, LegiScan as fallback) on the condition
that it stays within free-tier Supabase, free-tier Vercel and a small OpenAI
bill. The cost assessment below says it does.

Read before touching anything: `AGENTS.md` (repo rules, production
sensitivity), `docs/external-api-policy.md` (binding; CI enforces parts of it),
and this file.

## 1. Goal

Today bill **text** and search **verification** come from pubinfo, but two
things still depend on LegiScan:

1. **Discovery**: finding new relevant bills (`getSearch` full-text search,
   in `bulk-import-dataset`).
2. **Status metadata** for new bills: `status`, `status_text`, `status_date`,
   `progress`, `calendar`, `history` (`getBill`, in `sync-updated-bills`).

Target: both come from pubinfo, with LegiScan kept as a fallback. LegiScan's
key is single and irreplaceable (locked once, 2026-07-26), so every call
removed lowers that risk. Also in scope if cheap: refreshing status for bills
already summarised. That doesn't happen today, because `lease_next_bill` only
selects bills needing summary work.

## 2. Where things stand (production, project `klpwiiszmzzfvlbfsjrd`)

### Shipped

| PR | What |
|---|---|
| #93 | Search phrase rotation, `BULK_IMPORT_PINNED_BILLS` (AB1705, AB1568, AB2749 pinned permanently) |
| #94 | Fetched text persisted before summarising; per-invocation LegiScan pacer (`sync-updated-bills/legiscanPacer.ts`) |
| #95 | Shared LegiScan rate gate: `reserve_legiscan_api_call_gated` / `claim_legiscan_slot` (migration `20261109120000`). Search verification reads pubinfo in a background task (`EdgeRuntime.waitUntil`). Admission requires `BULK_IMPORT_VERIFY_MIN_MENTIONS` (default 5) topic mentions. |
| #96 | `sync-updated-bills` takes text from pubinfo first. Shared pubinfo index cache with build lock. `getBill` runs alone for status metadata; a bill that misses it stays queued (`summary_ok = false`) and retries without OpenAI. |
| alerting PR | `public.ingestion_health()` / `report_ingestion_health()`, pg_cron `ingestion-health` 11:30 UTC, optional Sentry via Vault `ingestion_alert_sentry_dsn` (migration `20261110120000`) |

### Measured, 2026-11-09/10

- **Bills:** 175 in `public.bills`.
- **Search queue:** 206 candidates, verified 30 per run. About 25% are admitted at the 5-mention threshold. The per-bill scoring sheet from the last session is not in the repo; regenerate it if needed.
- **LegiScan spacing:** after the gate, ≥ 1.5 s between all calls across all functions, confirmed in `legiscan_api_call_log`.
- **Database:** 43 MB of the 500 MB free-tier limit, about 100 KB per bill including text, embedding and translations.
- **Plans:** Supabase org `SecureYourTech` is on the **free** plan. Vercel hosts only the Expo web build and previews; no ingestion runs there.

### Daily chain

```
pg_cron 10:00 UTC daily-bill-sync -> invoke_full_legislative_refresh()
  -> bulk-import-dataset (pinned lookup, getSearch sweep <= 6 calls,
       then background: pubinfo verification of 30 queued candidates)
  -> sync-updated-bills x N in parallel (lease bills; text: stored ->
       pubinfo -> leginfo scrape -> LegiScan getBillText; getBill for
       status; OpenAI summaries + embedding)
pg_cron 11:30 UTC ingestion-health -> report_ingestion_health()
```

`net._http_response` shows 30 s timeouts for `sync-updated-bills`. That's
expected: the database waits 30 s for a reply, while the function runs to
completion within its 150 s wall clock.

## 3. pubinfo facts, verified 2026-11-09

- Host `downloads.leginfo.legislature.ca.gov`. It returns 206 to Supabase egress, while `leginfo.legislature.ca.gov` returns a 403 Cloudflare challenge. The download host is also served by Cloudflare (`server: cloudflare`), so it could be challenged in future; see §7.
- `pubinfo_2025.zip` (1.29 GB, zip64, rebuilt nightly around 05:26 UTC) supports HTTP Range.
- Its central directory is 19.6 MB with 205,284 entries, including 19,437 `BILL_VERSION_TBL_<n>.lob` entries and `BILL_TBL.dat`, `BILL_HISTORY_TBL.dat`, `BILL_VERSION_TBL.dat`, `BILL_SUMMARY_VOTE_TBL.dat` and `BILL_DETAIL_VOTE_TBL.dat`.
- Sizes:

  | Table | Compressed | Uncompressed |
  |---|---|---|
  | `BILL_TBL.dat` | 100 KB | 954 KB |
  | `BILL_HISTORY_TBL.dat` | 1.8 MB | 18 MB |
  | `BILL_VERSION_TBL.dat` | 756 KB | 4.5 MB |

- The `.dat` files are tab-separated, with values backtick-quoted and `NULL` for nulls. `BILL_VERSION_TBL` columns used today: 2 = bill_id (`202520260AB1568`), 3 = version_num (counts down from 99), 4 = date, 15 = lob name. Parser: `parseBillVersionTable` in `supabase/functions/_shared/pubinfo.ts`.
- Each `.lob` is CAML XML. Amendment marks are processing instructions, and a deletion's struck text sits inside the mark (`<?xm-deletion_mark data="..."?>`), so dropping all marks gives the bill as amended.
- **Daily delta files** `pubinfo_<Mon..Sun>.zip`, a few KB to 1 MB, appear alongside the big archive. **Not opened yet.** They are the obvious basis for discovery without `getSearch`. Confirm their contents first.
- Code: `supabase/functions/_shared/pubinfo.ts`.
  - Range reads with local-header name check.
  - `loadPubinfoIndexCached` caches a ~330 KB slice in `ingestion_cursors` under `pubinfo_index:pubinfo_2025.zip`, with a `:build_lock` row.
  - `camlBillToHtml`, `isBotChallenge`.
  - Tests in `pubinfo.test.ts`, including a JSZip-built archive and a fake range server.

## 4. Proposed plan (for the next agent to refine, not a decision)

Do it in phases, as separate PRs, per `AGENTS.md`.

1. **Investigate, with no code changes.**
   - Open the daily delta files and `BILL_TBL.dat` / `BILL_HISTORY_TBL.dat` and document their columns.
   - Decide how to map them onto what the app reads (see §5).
   - Check whether `pubinfo_2027.zip` appears when the 2027-28 session starts in December, and how early.
2. **Status metadata from pubinfo.**
   - Build `status`, `status_text`, `status_date`, `history`, `progress` (and `calendar` if available) from pubinfo tables. Keep `getBill` as the fallback.
   - Add a periodic status refresh for existing bills. Today they never refresh.
3. **Discovery from daily deltas.**
   - Scan changed bill versions each day for the topic phrases, applying the same mention threshold, and queue or admit them.
   - Keep `getSearch` as a slower fallback sweep. Decide its new cadence with the owner.
4. **Sweep LegiScan down to fallback only.**
   - Measure the call mix in `legiscan_api_call_log` for a week first.
   - Extend `ingestion_health()` with checks that matter once pubinfo is primary, such as "no delta processed in 48 h".

## 5. Constraints and invariants (do not break)

- **App data shape.** The app (`mobile-app/src/lib/billStatus.ts`, `components/Bill.tsx`, `app/(tabs)/*.tsx`) reads:
  - `status`, as LegiScan numeric codes `"1".."6"` (Introduced, Engrossed, Enrolled, Passed, Vetoed, Failed);
  - `status_text`, `status_date`;
  - `progress`, `history`, `calendar`, as LegiScan-shaped arrays (calendar entries `{date, time, description|desc|event|type, chamber, location}`).

  Either map pubinfo into exactly this shape, or change the client in its own PR.
- **`bills.id` is LegiScan's numeric `bill_id`.** pubinfo uses `202520260AB1568`-style ids. New bills from pubinfo-only discovery have no LegiScan id. Pinned bills use one `getMasterList` call to resolve ids; for discovery this needs a design decision: mapping table, or synthetic ids. Flag this to the owner early. It is the hardest part.
- **LegiScan policy.**
  - Every request goes through `reserve_legiscan_api_call_gated` / `claim_legiscan_slot` (`_shared/legiscanGate.ts`). CI fails otherwise.
  - At most 6 calls per invocation, at least 1 s apart, abort on `status: "ERROR"`.
  - Never point ad-hoc loops at production LegiScan.
  - Never register a new key.
- **Generated content is never overwritten by source ingestion.** See `AGENTS.md` §11 and `guard_bill_summaries`.
- **Edge Function limits the code is built around:** 150 s wall clock, about 2 s CPU per request, and responses inside `pg_net`'s 30 s timeout for anything whose response matters (`bulk-import-dataset` uses an 18 s budget and moves long work into `EdgeRuntime.waitUntil`). Memory for an uncached index build measured 107 MB RSS in the Deno CLI.
- **Politeness to the Legislature's servers:** sequential requests, ≥ 250 ms apart, an identifying `User-Agent`, never a whole archive download, and the shared cache plus build lock.

## 6. Cost assessment (owner asked; as of 2026-11-10, unofficial sources)

- **Supabase Free** (500 MB DB, 500k Edge invocations/month, 5 GB egress, pauses after 7 days of inactivity):
  - Usage is about 20-40 invocations/day and 43 MB of DB.
  - pubinfo downloads are inbound traffic, not counted as egress.
  - Room for roughly 4,000 more bills at the current size per bill.
  - **Unverified:** whether pg_cron activity alone prevents the inactivity pause. App traffic does. Check before relying on it.
- **Vercel Hobby:** not used by ingestion. Its terms restrict Hobby to non-commercial, personal use; the owner should confirm the app's status qualifies.
- **OpenAI:**
  - `gpt-4o-mini` at about $0.15 per million input tokens and $0.60 per million output tokens.
  - Each summary sends at most about 3k tokens of input (12,000 characters) and gets about 1.5-2k tokens out. That is about $0.002 per bill, or $0.004 with a re-ask.
  - `text-embedding-3-small` adds about $0.0001 per bill.
  - 60 new bills is about $0.10-0.25; a full year at current discovery rates is likely under $5.
  - Confirm current prices on OpenAI's pricing page.

## 7. Known risks and open questions

- **Cloudflare on the download host.** Detected as `blocked`, alerted by `ingestion-health`, and sync falls back to LegiScan. There is no mitigation beyond the fallback.
- **pubinfo format change.** A changed column layout or CAML tags would make bills read as "not in archive". Alerting catches the resulting stall; tests pin the current layout.
- **Session rollover in December 2026.** Code derives the year from `year_start` or the bill id. Unverified until it happens.
- **The pubinfo-id to LegiScan-id gap.** See §5.
- **Status refresh for summarised bills.** Not built; it's part of phase 2.

## 8. How the last session worked (tips)

- **Deno** isn't preinstalled. Use `npm i deno@2 --prefix <scratch>/denopkg`, then run with `--no-lock --node-modules-dir=none` (the repo's `node_modules` confuses `npm:` imports).
- **Format only the files you touch.** `deno fmt` on a whole directory reformats unrelated files.
- **Postgres testing.** Postgres 16 binaries are installed. `initdb` as `nobody` in a scratch dir (make parent dirs `a+x`), then stub `net.http_post`, `vault.decrypted_secrets`, `cron.schedule` and the tables you need. This is how the gate and health migrations were tested, including concurrency.
- **Production SQL.** Supabase MCP `execute_sql` / `apply_migration`. Per `AGENTS.md`, production writes need the owner's explicit OK. Migrations were applied by running the file and inserting the version into `supabase_migrations.schema_migrations`, so repo and production stay aligned.
- **Deploys.** Merging to `main` auto-deploys Edge Functions via the Supabase GitHub integration, about a minute later. Verify with `list_edge_functions` / `get_edge_function` and compare file contents to `main`.
- **PR reviews.** Codex reviews every PR. Its P1/P2 findings in the last session were all real; verify each, fix, reply on the thread, resolve. CodeQL caught a double-unescape.
- **Git.** Force-push is blocked. When the session branch has old pre-squash commits, merge `origin/<branch>` into the new work (the trees are identical) instead of force-pushing.

## 9. Verification queries

```sql
-- Health (no side effects)
select public.ingestion_health();

-- LegiScan call mix (approximate: log time is reservation time)
select endpoint, count(*) from public.legiscan_api_call_log
where created_at >= now() - interval '7 days' group by 1 order by 2 desc;

-- Verification progress
select cursor->'last_verification' as last_verification,
       jsonb_array_length(cursor->'rows') as queued
from public.ingestion_cursors where key = 'bulk_import_search_pending:ca:2172';

-- Bill completeness
select count(*) as bills,
       count(*) filter (where original_text is null) as no_text,
       count(*) filter (where summary_ok is distinct from true) as not_done,
       count(*) filter (where status_date is null) as no_status
from public.bills;
```
