# Plan: pubinfo as the primary data source

Date: 2026-11-10. Follows `docs/handoffs/2026-11-10-pubinfo-primary-source.md`.
Phase 1 (investigation) is done and recorded here. Two decisions are the
owner's (§4). Everything else proceeds in the order of §3.

## 1. Phase 1 findings (measured 2026-11-09/10)

### Corrections to the handoff

- **`pubinfo_<year>.zip` is rebuilt weekly, not nightly.** The Legislature's
  `pubinfo_Readme.pdf` says to load it on Sundays, and every past session's
  file carries a Sunday timestamp. Until now a bill introduced or amended on a
  Monday had no pubinfo text until the following Sunday night, so in session
  most new text would have fallen through to LegiScan `getBillText`.
- **`pubinfo_daily_<Day>.zip` is a full daily archive** of the current session
  ("all current session data except Code tables"): the same 14 bill tables and
  19,437 bill-version lobs, 1.16 GB, plain zip (no zip64), 42,672 entries, a
  4.1 MB central directory against 19.6 MB, same Range support. Fixed in the
  PR that adds this file: reads now use the freshest daily archive.
- **`pubinfo_<Day>.zip` deltas are "the day's new records since last
  extract"**: partial `.dat` files in the same layout plus the lobs they
  reference. Tuesday 2026-11-03 held 41 `BILL_TBL` rows, 1,347
  `BILL_HISTORY_TBL` rows and one veto message; Friday held only 19 committee
  analyses. They carry no deletions and a missed day is unrecoverable from
  them alone, so they are useful as a cheap "what changed" signal but not as
  the source of truth. The daily full archive is.

### Tables (layout from `pubinfo_load.zip`, `capublic.sql`)

Tab-separated, strings backtick-quoted, `NULL` for null. 5,065 bills this
session.

| Table | Compressed / raw | Columns that matter (1-based) |
|---|---|---|
| `BILL_TBL` | 100 KB / 954 KB | 1 bill_id, 4 measure_type, 5 measure_num, 6 measure_state, 11 latest_bill_version_id, 15 current_location, 16 current_secondary_loc, 17 current_house, 18 current_status |
| `BILL_HISTORY_TBL` | 1.8 MB / 18 MB | 1 bill_id, 3 action_date, 4 action, 7 action_sequence, 8 action_code, 9 action_status, 10 primary_location, 11 secondary_location, 12 ternary_location, 13 end_status |
| `BILL_VERSION_TBL` | 756 KB / 4.5 MB | 2 bill_id, 3 version_num, 4 action date, 5 version action, 7 subject, 15 lob name |
| `COMMITTEE_HEARING_TBL` | 84 KB / 1.6 MB | 1 bill_id, 2 committee_type, 3 committee_nr, 4 hearing_date, 5 location_code |
| `LOCATION_CODE_TBL` | 3 KB / 27 KB | 2 location_code, 5 description, 6 long_description |

Observed values: `measure_state` is one of Introduced, Amended Assembly,
Amended Senate, Enrolled, Chaptered. `current_status` is one of Chaptered, In
Committee Process, Died, Passed, Vetoed, In Floor Process, Pending Referral,
Failed Passage in Committee, Failed, In Desk Process. `action_status` is
Applied in 99.9% of history rows; the rest are Rescinded or Reconsidered and
must be skipped.

### What the app needs

- `status_text ?? STATUS_LABELS[status]` for the label, `status_date`.
- `history` entries with `date` (or `action_date`) and `action`.
- `progress` entries with `date` and `event`/`step`; only the introduced date
  and the latest date are used.
- `calendar` entries with `date`, `time`, `description` (or `type`),
  `chamber`, `location`; only future entries are shown.

All of it is derivable from the tables above. `COMMITTEE_HEARING_TBL` has the
hearing date and committee but no time or room; `COMMITTEE_AGENDA_TBL` may
(not yet examined).

### Production state that changes the priorities

- **83 of 175 bills have no `status`** (never got `getBill`), and 173 have a
  `status_date` that is null or older than 60 days. Nothing refreshes status
  after a bill is summarised. Status is the largest visible gap.
- **All 175 bills have a leginfo `state_link`** from which the pubinfo bill id
  is derived, so every tracked bill can be matched to pubinfo today with no
  schema change.

## 2. Target design

```
pg_cron daily
  -> bulk-import-dataset      pinned bills; discovery from pubinfo (phase 3);
                              getSearch as a slow fallback sweep
  -> sync-updated-bills x N   text from pubinfo; summaries; getBill only when
                              pubinfo has no status for the bill
  -> refresh-bill-status      NEW (phase 2): one pass over BILL_TBL +
                              BILL_HISTORY_TBL (+ hearings) for every tracked
                              bill; writes status fields that changed
  -> ingestion-health         existing; gains pubinfo-primary checks (phase 4)
```

Status mapping (LegiScan codes the app already understands; `status_text`
stays null so labels and translations are unchanged):

| pubinfo | `status` |
|---|---|
| `current_status` Chaptered | 4 Passed |
| Vetoed | 5 Vetoed |
| Died, Failed, Failed Passage in Committee | 6 Failed |
| `measure_state` Enrolled | 3 Enrolled |
| `current_house` differs from the house of origin | 2 Engrossed |
| otherwise | 1 Introduced |

`status_date` is the latest applied history action date. `history` is the
applied rows as `{date, action, chamber, sequence}`. `progress` is derived
from the same rows (introduced, referred, passed house, enrolled, chaptered,
vetoed). `calendar` comes from committee hearings.

The refresh streams `BILL_HISTORY_TBL` (18 MB raw) through a decompressor and
keeps only rows for tracked bills, to stay inside the Edge Function's ~2 s CPU
and memory limits. If that proves too tight when measured in production, the
fallback is to process a fixed slice of tracked bills per run.

## 3. Work order (one PR each)

1. **Daily archive + this plan.** Done in the PR that adds this file.
2. **Status from pubinfo.** *Implemented in the PR after #98; decisions A and B
   below were accepted by the owner on 2026-11-10, along with a
   `pubinfo_bill_id` column linking each bill to both providers.* Parsers and mapping in `_shared/pubinfo.ts` with
   tests pinned to real rows; `refresh-bill-status` function and its cron
   wrapper (migration + verification SQL); `sync-updated-bills` skips `getBill`
   when the bill already has status. Writes only source fields, never
   summaries (`AGENTS.md` §11).
3. **Discovery from pubinfo.** Each day, score bill versions whose action date
   is newer than a cursor with the existing `countTopicMentions` threshold.
   Depends on decision A.
4. **LegiScan to fallback.** After a week of `legiscan_api_call_log` data:
   lower `getSearch` cadence (decision B), extend `ingestion_health()` with
   "status refresh stale" and "daily archive stale" checks.

## 4. Decisions for the owner

**A. Ids for bills discovered through pubinfo.** `bills.id` is LegiScan's
`bill_id`, referenced by 10 foreign keys.

- *Recommended:* keep LegiScan ids. Resolve newly admitted bills with one
  `getMasterList` call (the path pinned bills already use): at most one call
  on a day with admissions, none otherwise. A bill waits in the queue while
  LegiScan is unavailable. No schema or client change, no duplicate risk.
- *Alternative:* synthetic ids, which removes LegiScan from discovery
  entirely but needs a unique key on session + bill number and a rule for
  merging when LegiScan later reports the same bill. More code and a real
  duplicate risk, for a dependency of roughly one call a day.

**B. `getSearch` cadence once pubinfo discovery runs.** Today: up to 6 calls
daily. Recommended: weekly, as a cross-check that pubinfo discovery misses
nothing, then reconsider after a month of comparison.

## 5. Risks

- **CPU limit on the status refresh** (see §2). Measured before it is
  scheduled.
- **Session rollover, December 2026.** The daily archives will switch to
  2027-28. The loader checks that the daily index holds the requested session
  and otherwise falls back to `pubinfo_2025.zip`; tested with a fake, not yet
  seen in production.
- **Cloudflare on the download host.** Unchanged: detected, alerted, LegiScan
  fallback.
- **Mapping drift.** A new `current_status` value would map to Introduced or
  Engrossed. The refresh logs unknown values and the health check will flag
  them (phase 4).
